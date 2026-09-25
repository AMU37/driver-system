import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.config import settings
from app.core.database import get_db
from app.models import Employee, NewEmployeeRequest, Notification, PlannedTrip, Trip, TripEmployee, TripReport, TripStatus, User, UserRole
from app.schemas import DashboardOut, EmployeeLookup, NewEmployeeCreate, NotificationOut, PlannedTripOut, TripDetail, TripEmployeeAdd, TripEmployeeOut, TripOut
from app.integrations.microsoft import transfer_trip
from app.services.trips import add_known_employee, add_new_employee, can_access_trip, complete_trip, serialize_trip, start_planned_trip

router = APIRouter(prefix="/api/driver", tags=["driver"])


def planned_out(item: PlannedTrip) -> dict:
    return {
        "id": item.id,
        "external_id": item.external_id,
        "trip_number": item.trip_number,
        "driver_id": item.driver_id,
        "company_code": item.company_code,
        "trip_date": item.trip_date,
        "release_at": item.release_at,
        "scheduled_start_at": item.scheduled_start_at,
        "status": item.status.value,
        "bus_number": item.bus.number if item.bus else None,
        "route_name": item.route.name if item.route else None,
        "origin": item.route.origin if item.route else None,
        "destination": item.route.destination if item.route else None,
    }


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    # DB stores naive UTC datetimes; use a naive UTC "now" for comparisons.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    planned = db.scalars(
        select(PlannedTrip).options(selectinload(PlannedTrip.bus), selectinload(PlannedTrip.route)).where(
            PlannedTrip.driver_id == user.id,
            PlannedTrip.scheduled_start_at >= now,
            PlannedTrip.status.in_([TripStatus.planned, TripStatus.available]),
        ).order_by(PlannedTrip.scheduled_start_at).limit(10)
    ).all()
    for item in planned:
        if item.status == TripStatus.planned and item.release_at and now >= item.release_at:
            item.status = TripStatus.available
    active = db.scalar(
        select(Trip).options(selectinload(Trip.passengers), selectinload(Trip.actual_bus), selectinload(Trip.planned_bus), selectinload(Trip.route), selectinload(Trip.planned_trip)).where(
            Trip.driver_id == user.id, Trip.status.in_([TripStatus.started, TripStatus.boarding])
        ).order_by(Trip.started_at.desc())
    )
    completed_count = db.scalar(select(func.count(Trip.id)).where(Trip.driver_id == user.id, Trip.status == TripStatus.completed)) or 0
    transferred_count = db.scalar(select(func.count(Trip.id)).where(Trip.driver_id == user.id, Trip.status == TripStatus.transferred)) or 0
    today_count = db.scalar(select(func.count(Trip.id)).where(Trip.driver_id == user.id)) or 0
    active_data = serialize_trip(active) if active else None
    return {
        "upcoming": [planned_out(p) for p in planned],
        "active_trip": active_data,
        "stats": {"today_total": today_count, "completed": completed_count, "transferred": transferred_count},
    }


@router.get("/planned", response_model=list[PlannedTripOut])
def planned_trips(user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    items = db.scalars(select(PlannedTrip).options(selectinload(PlannedTrip.bus), selectinload(PlannedTrip.route)).where(PlannedTrip.driver_id == user.id).order_by(PlannedTrip.scheduled_start_at.desc()).limit(100)).all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    changed = False
    for item in items:
        if item.status == TripStatus.planned and item.release_at and now >= item.release_at:
            item.status = TripStatus.available
            changed = True
    if changed:
        db.commit()
    return [planned_out(i) for i in items]


@router.get("/trips", response_model=list[TripDetail])
def my_trips(user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    items = db.scalars(select(Trip).options(selectinload(Trip.passengers), selectinload(Trip.actual_bus), selectinload(Trip.planned_bus), selectinload(Trip.route), selectinload(Trip.planned_trip)).where(Trip.driver_id == user.id).order_by(Trip.created_at.desc()).limit(100)).all()
    return [serialize_trip(i) for i in items]


@router.get("/trips/{trip_id}", response_model=TripDetail)
def get_trip(trip_id: int, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    trip = db.scalar(select(Trip).options(selectinload(Trip.passengers), selectinload(Trip.actual_bus), selectinload(Trip.planned_bus), selectinload(Trip.route), selectinload(Trip.planned_trip)).where(Trip.id == trip_id))
    if not trip:
        raise HTTPException(404, "الرحلة غير موجودة")
    can_access_trip(user, trip)
    return serialize_trip(trip)


@router.post("/planned/{planned_id}/start", response_model=TripDetail)
def start_trip(planned_id: int, actual_bus_number: str | None = None, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    planned = db.scalar(select(PlannedTrip).options(selectinload(PlannedTrip.bus), selectinload(PlannedTrip.route)).where(PlannedTrip.id == planned_id))
    if not planned:
        raise HTTPException(404, "الرحلة المخططة غير موجودة")
    trip = start_planned_trip(db, user, planned, actual_bus_number)
    db.commit()
    db.refresh(trip)
    trip = db.scalar(select(Trip).options(selectinload(Trip.passengers), selectinload(Trip.actual_bus), selectinload(Trip.planned_bus), selectinload(Trip.route), selectinload(Trip.planned_trip)).where(Trip.id == trip.id))
    return serialize_trip(trip)


@router.post("/trips/{trip_id}/employees", response_model=TripEmployeeOut)
def add_employee(trip_id: int, payload: TripEmployeeAdd, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    trip = db.scalar(select(Trip).where(Trip.id == trip_id))
    if not trip:
        raise HTTPException(404, "الرحلة غير موجودة")
    if trip.status not in (TripStatus.started, TripStatus.boarding):
        raise HTTPException(400, "لا يمكن إضافة موظفين بعد إكمال الرحلة")
    employee = db.scalar(select(Employee).where(Employee.employee_code == payload.employee_code, Employee.is_active.is_(True)))
    if not employee:
        raise HTTPException(404, "الموظف غير موجود")
    passenger = add_known_employee(db, user, trip, employee, payload.visit_purpose)
    db.commit()
    db.refresh(passenger)
    return passenger


@router.post("/trips/{trip_id}/new-employees", response_model=TripEmployeeOut)
def add_new(trip_id: int, payload: NewEmployeeCreate, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    trip = db.scalar(select(Trip).where(Trip.id == trip_id))
    if not trip:
        raise HTTPException(404, "الرحلة غير موجودة")
    if trip.status not in (TripStatus.started, TripStatus.boarding):
        raise HTTPException(400, "لا يمكن إضافة موظفين بعد إكمال الرحلة")
    passenger = add_new_employee(db, user, trip, payload)
    db.commit()
    db.refresh(passenger)
    return passenger


@router.get("/employees", response_model=list[EmployeeLookup])
def employees_list(user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    return db.scalars(
        select(Employee).where(Employee.is_active.is_(True)).order_by(Employee.employee_code)
    ).all()


@router.get("/employees/search", response_model=EmployeeLookup)
def employee_search(code: str, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    employee = db.scalar(select(Employee).where(Employee.employee_code == code.strip(), Employee.is_active.is_(True)))
    if not employee:
        raise HTTPException(404, "الموظف غير موجود")
    return employee


@router.post("/trips/{trip_id}/complete", response_model=TripDetail)
def complete(trip_id: int, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    trip = db.scalar(select(Trip).where(Trip.id == trip_id))
    if not trip:
        raise HTTPException(404, "الرحلة غير موجودة")
    complete_trip(db, user, trip)
    db.commit()
    trip = db.scalar(select(Trip).options(selectinload(Trip.passengers), selectinload(Trip.actual_bus), selectinload(Trip.planned_bus), selectinload(Trip.route), selectinload(Trip.planned_trip)).where(Trip.id == trip.id))
    return serialize_trip(trip)


class TripReportIn(BaseModel):
    event_type: str = "trip.completed"
    trip: dict = {}


@router.post("/trips/report")
def report_trip(payload: TripReportIn, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    """تسليم نسخة الرحلة المكتملة للخادم حتى يراها المشرف، مع إعادة توجيهها لـ Power Automate إن ضُبط."""
    data = payload.trip or {}
    employees = data.get("employees") or []
    report = TripReport(
        driver_id=user.id,
        driver_username=user.username,
        driver_name=user.full_name,
        trip_number=str(data.get("trip_id") or data.get("internal_id") or "UNKNOWN"),
        employee_count=len(employees),
        payload=payload.model_dump(),
        integration_status="server_only",
    )
    forwarded = {"ok": True, "error": None}
    if settings.microsoft_enabled and settings.microsoft_outbound_url:
        try:
            req_id = str(uuid.uuid4())
            with httpx.Client(timeout=settings.microsoft_timeout_seconds) as client:
                resp = client.post(
                    settings.microsoft_outbound_url,
                    headers={"Content-Type": "application/json", "X-Request-ID": req_id},
                    json=payload.model_dump(),
                )
            if 200 <= resp.status_code < 300:
                report.integration_status = "success"
            else:
                report.integration_status = f"failed:{resp.status_code}"
                forwarded = {"ok": False, "error": f"HTTP {resp.status_code}"}
        except Exception as exc:
            report.integration_status = "retrying"
            forwarded = {"ok": False, "error": str(exc)}
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"ok": True, "report_id": report.id, "integration": forwarded, "message": "تم تسليم تقرير الرحلة للمشرف"}


@router.post("/trips/{trip_id}/transfer")
def transfer(trip_id: int, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    trip = db.scalar(select(Trip).options(selectinload(Trip.passengers), selectinload(Trip.actual_bus), selectinload(Trip.planned_bus), selectinload(Trip.route), selectinload(Trip.planned_trip)).where(Trip.id == trip_id))
    if not trip:
        raise HTTPException(404, "الرحلة غير موجودة")
    can_access_trip(user, trip)
    if trip.status not in (TripStatus.completed, TripStatus.transferred):
        raise HTTPException(400, "لا يمكن ترحيل الرحلة قبل إكمالها")
    log = transfer_trip(db, trip)
    if log.status.value == "success":
        trip.status = TripStatus.transferred
        trip.transferred_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": log.status.value == "success", "status": log.status.value, "request_id": log.request_id, "message": "تم الترحيل بنجاح" if log.status.value == "success" else "تم تسجيل الرحلة للتكامل أو إعادة المحاولة", "error": log.error_message}


@router.get("/notifications", response_model=list[NotificationOut])
def notifications(user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    return db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(50)).all()


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(require_roles(UserRole.driver)), db: Session = Depends(get_db)):
    notification = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not notification:
        raise HTTPException(404, "الإشعار غير موجود")
    notification.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
