from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.models import Bus, Employee, NewEmployeeRequest, PlannedTrip, Trip, TripEmployee, TripReport, TripStatus, User, UserRole
from app.schemas import AdminTripPlanCreate, DriverCreate, NewEmployeeReview, PlannedTripOut, UserOut
from app.services.employees import import_employee_rows, parse_employee_rows
from app.services.trips import ensure_bus, ensure_route

router = APIRouter(prefix="/api/admin", tags=["admin"])


def planned_out(item: PlannedTrip) -> dict:
    return {"id": item.id, "external_id": item.external_id, "trip_number": item.trip_number, "driver_id": item.driver_id, "company_code": item.company_code, "trip_date": item.trip_date, "release_at": item.release_at, "scheduled_start_at": item.scheduled_start_at, "status": item.status.value, "bus_number": item.bus.number if item.bus else None, "route_name": item.route.name if item.route else None, "origin": item.route.origin if item.route else None, "destination": item.route.destination if item.route else None}


@router.get("/drivers", response_model=list[UserOut])
def drivers(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.role == UserRole.driver, User.is_active.is_(True)).order_by(User.full_name)).all()


@router.post("/drivers", response_model=UserOut)
def create_driver(payload: DriverCreate, user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(409, "اسم المستخدم موجود مسبقاً")
    if db.scalar(select(User).where(User.driver_code == payload.driver_code)):
        raise HTTPException(409, "كود السائق موجود مسبقاً")
    driver = User(username=payload.username, full_name=payload.full_name, password_hash=hash_password(payload.password), role=UserRole.driver, driver_code=payload.driver_code, company_code=payload.company_code)
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


@router.get("/buses")
def buses(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    return db.scalars(select(Bus).where(Bus.is_active.is_(True)).order_by(Bus.number)).all()


@router.get("/employees")
def employees(search: str | None = None, user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    stmt = select(Employee)
    if search and search.strip():
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Employee.employee_code.like(like), Employee.name.like(like)))
    return db.scalars(stmt.order_by(Employee.employee_code).limit(5000)).all()


MAX_UPLOAD_BYTES = 5 * 1024 * 1024


@router.post("/employees/import")
def import_employees(file: UploadFile = File(...), user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "حجم الملف يتجاوز الحد المسموح (5 ميجابايت)")
    try:
        rows = parse_employee_rows(data, file.filename or "")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(400, f"تعذر قراءة الملف: {exc}")
    if not rows:
        raise HTTPException(400, "الملف لا يحتوي على بيانات موظفين صالحة")
    result = import_employee_rows(db, rows)
    return {"ok": True, "received": len(rows), **result}


@router.get("/planned-trips", response_model=list[PlannedTripOut])
def planned_trips(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    items = db.scalars(select(PlannedTrip).order_by(PlannedTrip.scheduled_start_at.desc()).limit(200)).all()
    return [planned_out(i) for i in items]


@router.post("/planned-trips", response_model=PlannedTripOut)
def create_plan(payload: AdminTripPlanCreate, user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    driver = db.scalar(select(User).where(User.driver_code == payload.driver_code, User.role == UserRole.driver))
    if not driver:
        raise HTTPException(404, "السائق غير موجود")
    bus = ensure_bus(db, payload.bus_number, payload.company_code)
    route = ensure_route(db, payload.route_name, payload.origin, payload.destination, payload.company_code)
    scheduled = payload.scheduled_start_at
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    release_hours = payload.release_hours if payload.release_hours is not None else settings.trip_release_hours
    release_at = scheduled - timedelta(hours=release_hours)
    status = TripStatus.available if datetime.now(timezone.utc) >= release_at else TripStatus.planned
    day_count = db.scalar(select(func.count(PlannedTrip.id)).where(func.date(PlannedTrip.scheduled_start_at) == scheduled.date())) or 0
    item = PlannedTrip(
        trip_number=f"TR-{payload.bus_number}-{scheduled:%Y%m%d}-{payload.company_code}-{day_count + 1:03d}",
        driver_id=driver.id,
        bus_id=bus.id,
        route_id=route.id,
        company_code=payload.company_code,
        trip_date=scheduled,
        release_at=release_at,
        scheduled_start_at=scheduled,
        status=status,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    item.bus = bus
    item.route = route
    return planned_out(item)


@router.get("/new-employees")
def new_employees(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    rows = db.execute(select(NewEmployeeRequest, Trip.trip_number, User.full_name).join(Trip, Trip.id == NewEmployeeRequest.trip_id).join(User, User.id == NewEmployeeRequest.created_by).order_by(NewEmployeeRequest.created_at.desc()).limit(200)).all()
    return [
        {
            "request": {
                "id": req.id, "trip_id": req.trip_id, "created_by": req.created_by,
                "employee_code": req.employee_code, "name": req.name, "job_title": req.job_title,
                "department": req.department, "company": req.company, "visit_purpose": req.visit_purpose,
                "notes": req.notes, "status": req.status, "created_at": req.created_at,
            },
            "trip_number": trip_number,
            "created_by_name": creator_name,
        }
        for req, trip_number, creator_name in rows
    ]


@router.get("/trip-reports")
def trip_reports(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    """تقارير الرحلات المكتملة التي سلمتها أجهزة السائقين — تظهر الرحلة وقائمة الصاعدين للمشرف."""
    items = db.scalars(select(TripReport).order_by(TripReport.received_at.desc()).limit(300)).all()
    out = []
    for r in items:
        trip = (r.payload or {}).get("trip") or {}
        out.append({
            "id": r.id,
            "trip_number": r.trip_number,
            "driver_username": r.driver_username,
            "driver_name": r.driver_name or r.driver_username,
            "bus_number": trip.get("bus_number"),
            "route": trip.get("route"),
            "origin": trip.get("origin"),
            "destination": trip.get("destination"),
            "trip_type": trip.get("trip_type"),
            "started_at": trip.get("started_at"),
            "completed_at": trip.get("completed_at"),
            "scheduled_start_at": trip.get("scheduled_start_at"),
            "employee_count": r.employee_count,
            "integration_status": r.integration_status,
            "received_at": r.received_at,
            "raw": r.payload,
        })
    return out


@router.post("/new-employees/{request_id}/review")
def review_new_employee(request_id: int, payload: NewEmployeeReview, user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    req = db.scalar(select(NewEmployeeRequest).where(NewEmployeeRequest.id == request_id))
    if not req:
        raise HTTPException(404, "الطلب غير موجود")
    req.status = payload.status
    if payload.status == "approved":
        employee = None
        if req.employee_code:
            employee = db.scalar(select(Employee).where(Employee.employee_code == req.employee_code))
        if not employee:
            employee = Employee(employee_code=req.employee_code or f"NEW-{req.id}", name=req.name, job_title=req.job_title, department_name=req.department, company_name=req.company)
            db.add(employee)
            db.flush()
        passenger = db.scalar(select(TripEmployee).where(TripEmployee.trip_id == req.trip_id, TripEmployee.employee_code == (req.employee_code or f"NEW-{req.id}")))
        if passenger:
            passenger.employee_id = employee.id
            passenger.needs_review = False
    db.commit()
    return {"ok": True, "status": req.status}
