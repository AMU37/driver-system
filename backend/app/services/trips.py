from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AuditLog, Bus, Employee, NewEmployeeRequest, PlannedTrip, Route, Trip, TripEmployee, TripStatus, User, UserRole


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def log_action(db: Session, user_id: str | None, action: str, entity_type: str, entity_id: str, details: dict | None = None):
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type, entity_id=entity_id, details=details or {}))


def _serialize_trip(trip: Trip) -> dict:
    return {
        "id": trip.id,
        "trip_number": trip.trip_number,
        "driver_id": trip.driver_id,
        "company_code": trip.company_code,
        "status": trip.status.value if hasattr(trip.status, "value") else trip.status,
        "started_at": trip.started_at,
        "completed_at": trip.completed_at,
        "transferred_at": trip.transferred_at,
        "employee_count": trip.employee_count,
        "planned_bus_number": trip.planned_bus.number if trip.planned_bus else None,
        "actual_bus_number": trip.actual_bus.number if trip.actual_bus else None,
        "route_name": trip.route.name if trip.route else None,
        "origin": trip.route.origin if trip.route else None,
        "destination": trip.route.destination if trip.route else None,
        "scheduled_start_at": trip.planned_trip.scheduled_start_at if trip.planned_trip else None,
        "release_at": trip.planned_trip.release_at if trip.planned_trip else None,
    }


def serialize_trip(trip: Trip) -> dict:
    data = _serialize_trip(trip)
    data["passengers"] = [
        {
            "id": p.id,
            "employee_code": p.employee_code,
            "name_snapshot": p.name_snapshot,
            "job_title_snapshot": p.job_title_snapshot,
            "department_snapshot": p.department_snapshot,
            "company_snapshot": p.company_snapshot,
            "housing_location_snapshot": p.housing_location_snapshot,
            "visit_purpose": p.visit_purpose,
            "boarded_at": p.boarded_at,
            "source": p.source,
            "needs_review": p.needs_review,
        }
        for p in trip.passengers
    ]
    return data


def ensure_route(db: Session, route_name: str, origin: str, destination: str, company_code: str) -> Route:
    route = db.scalar(select(Route).where(Route.name == route_name, Route.company_code == company_code))
    if not route:
        route = Route(name=route_name, origin=origin, destination=destination, company_code=company_code)
        db.add(route)
        db.flush()
    else:
        route.origin = origin
        route.destination = destination
    return route


def ensure_bus(db: Session, bus_number: str, company_code: str) -> Bus:
    bus = db.scalar(select(Bus).where(Bus.number == bus_number))
    if not bus:
        bus = Bus(number=bus_number, company_code=company_code)
        db.add(bus)
        db.flush()
    return bus


def driver_for_user(user: User):
    if user.role not in (UserRole.driver, UserRole.supervisor, UserRole.admin):
        raise HTTPException(403, "غير مصرح")


def can_access_trip(user: User, trip: Trip):
    if user.role == UserRole.driver and trip.driver_id != user.id:
        raise HTTPException(403, "لا يمكنك الوصول إلى هذه الرحلة")


def start_planned_trip(db: Session, user: User, planned: PlannedTrip, actual_bus_number: str | None = None) -> Trip:
    driver_for_user(user)
    if user.role == UserRole.driver and planned.driver_id != user.id:
        raise HTTPException(403, "هذه الرحلة ليست مخصصة لك")
    if planned.status not in (TripStatus.planned, TripStatus.available):
        raise HTTPException(400, "الرحلة ليست جاهزة للبدء")
    existing = db.scalar(select(Trip).where(Trip.planned_trip_id == planned.id))
    if existing:
        return existing

    actual_bus = planned.bus if not actual_bus_number else ensure_bus(db, actual_bus_number, planned.company_code)
    trip = Trip(
        trip_number=planned.trip_number,
        planned_trip_id=planned.id,
        driver_id=planned.driver_id,
        planned_bus_id=planned.bus_id,
        actual_bus_id=actual_bus.id,
        route_id=planned.route_id,
        company_code=planned.company_code,
        status=TripStatus.started,
        started_at=now_utc(),
    )
    planned.status = TripStatus.started
    db.add(trip)
    db.flush()
    log_action(db, user.id, "trip_started", "trip", str(trip.id), {"planned_trip_id": planned.id, "bus": actual_bus.number})
    return trip


def complete_trip(db: Session, user: User, trip: Trip) -> Trip:
    can_access_trip(user, trip)
    if trip.status not in (TripStatus.started, TripStatus.boarding):
        raise HTTPException(400, "لا يمكن إكمال الرحلة في حالتها الحالية")
    trip.status = TripStatus.completed
    trip.completed_at = now_utc()
    log_action(db, user.id, "trip_completed", "trip", str(trip.id), {"employee_count": trip.employee_count})
    return trip


def add_known_employee(db: Session, user: User, trip: Trip, employee: Employee, visit_purpose: str) -> TripEmployee:
    can_access_trip(user, trip)
    existing = db.scalar(select(TripEmployee).where(TripEmployee.trip_id == trip.id, TripEmployee.employee_code == employee.employee_code))
    if existing:
        raise HTTPException(409, "الموظف موجود بالفعل في هذه الرحلة")
    passenger = TripEmployee(
        trip_id=trip.id,
        employee_id=employee.id,
        employee_code=employee.employee_code,
        name_snapshot=employee.name,
        job_title_snapshot=employee.job_title,
        department_snapshot=employee.department_name,
        company_snapshot=employee.company_name,
        housing_location_snapshot=employee.housing_location,
        visit_purpose=visit_purpose,
        source="employee_master",
        needs_review=False,
    )
    trip.status = TripStatus.boarding
    db.add(passenger)
    trip.employee_count += 1
    db.flush()
    log_action(db, user.id, "employee_boarded", "trip", str(trip.id), {"employee_code": employee.employee_code})
    return passenger


def add_new_employee(db: Session, user: User, trip: Trip, payload) -> TripEmployee:
    can_access_trip(user, trip)
    if payload.employee_code:
        existing_master = db.scalar(select(Employee).where(Employee.employee_code == payload.employee_code))
        if existing_master:
            raise HTTPException(409, "الكود موجود مسبقاً في قاعدة الموظفين. استخدم البحث عن الموظف.")
    if payload.employee_code:
        existing_trip = db.scalar(select(TripEmployee).where(TripEmployee.trip_id == trip.id, TripEmployee.employee_code == payload.employee_code))
        if existing_trip:
            raise HTTPException(409, "الموظف موجود بالفعل في هذه الرحلة")

    request = NewEmployeeRequest(
        trip_id=trip.id,
        created_by=user.id,
        employee_code=payload.employee_code,
        name=payload.name,
        job_title=payload.job_title,
        department=payload.department,
        company=payload.company,
        visit_purpose=payload.visit_purpose,
        notes=payload.notes,
        status="pending",
    )
    db.add(request)
    db.flush()
    passenger = TripEmployee(
        trip_id=trip.id,
        employee_id=None,
        employee_code=payload.employee_code or f"NEW-{request.id}",
        name_snapshot=payload.name,
        job_title_snapshot=payload.job_title,
        department_snapshot=payload.department,
        company_snapshot=payload.company,
        housing_location_snapshot=None,
        visit_purpose=payload.visit_purpose,
        source="new_employee_request",
        needs_review=True,
    )
    db.add(passenger)
    trip.status = TripStatus.boarding
    trip.employee_count += 1
    db.flush()
    log_action(db, user.id, "new_employee_added", "trip", str(trip.id), {"request_id": request.id, "employee_code": payload.employee_code})
    return passenger


def import_planned_trip(db: Session, payload):
    existing = None
    if payload.external_id:
        existing = db.scalar(select(PlannedTrip).where(PlannedTrip.external_id == payload.external_id))
    if existing:
        return existing, False
    existing = db.scalar(select(PlannedTrip).where(PlannedTrip.trip_number == payload.trip_number))
    if existing:
        return existing, False

    driver = db.scalar(select(User).where(User.driver_code == payload.driver_code, User.role == UserRole.driver))
    if not driver:
        raise HTTPException(404, "السائق غير موجود")
    bus = ensure_bus(db, payload.bus_number, payload.company_code)
    route = ensure_route(db, payload.route_name, payload.origin, payload.destination, payload.company_code)
    release_hours = payload.release_hours if payload.release_hours is not None else settings.trip_release_hours
    release_at = payload.scheduled_start_at - timedelta(hours=release_hours)
    if release_at.tzinfo is None:
        # DB columns round-trip naive UTC (SQLite); match the comparison side.
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        status = TripStatus.available if now >= release_at else TripStatus.planned
    else:
        status = TripStatus.available if now_utc() >= release_at else TripStatus.planned
    planned = PlannedTrip(
        external_id=payload.external_id,
        trip_number=payload.trip_number,
        driver_id=driver.id,
        bus_id=bus.id,
        route_id=route.id,
        company_code=payload.company_code,
        trip_date=payload.scheduled_start_at,
        release_at=release_at,
        scheduled_start_at=payload.scheduled_start_at,
        status=status,
        metadata_json=payload.metadata,
    )
    db.add(planned)
    db.flush()
    return planned, True
