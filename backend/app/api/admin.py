from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.models import Bus, Employee, NewEmployeeRequest, PlannedTrip, Trip, TripEmployee, TripStatus, User, UserRole
from app.schemas import AdminTripPlanCreate, DriverCreate, NewEmployeeReview, PlannedTripOut, UserOut
from app.services.employees import import_employee_rows, parse_employee_rows
from app.services.trips import ensure_bus, ensure_route

router = APIRouter(prefix="/api/admin", tags=["admin"])


def planned_out(item: PlannedTrip) -> dict:
    return {"id": item.id, "external_id": item.external_id, "trip_number": item.trip_number, "driver_id": item.driver_id, "company_code": item.company_code, "trip_date": item.trip_date, "release_at": item.release_at, "scheduled_start_at": item.scheduled_start_at, "status": item.status.value, "bus_number": item.bus.number if item.bus else None, "route_name": item.route.name if item.route else None, "origin": item.route.origin if item.route else None, "destination": item.route.destination if item.route else None}


@router.get("/drivers", response_model=list[UserOut])
def drivers(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.role == UserRole.driver).order_by(User.full_name)).all()


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
    return db.scalars(select(Bus).order_by(Bus.number)).all()


@router.get("/employees")
def employees(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    return db.scalars(select(Employee).order_by(Employee.employee_code).limit(1000)).all()


@router.post("/employees/import")
def import_employees(file: UploadFile = File(...), user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    data = file.file.read()
    try:
        rows = parse_employee_rows(data, file.filename or "")
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
    release_hours = payload.release_hours if payload.release_hours is not None else settings.trip_release_hours
    release_at = payload.scheduled_start_at - timedelta(hours=release_hours)
    status = TripStatus.available if datetime.now(timezone.utc) >= release_at else TripStatus.planned
    day_count = db.scalar(select(func.count(PlannedTrip.id)).where(func.date(PlannedTrip.scheduled_start_at) == payload.scheduled_start_at.date())) or 0
    item = PlannedTrip(
        trip_number=f"TR-{payload.bus_number}-{payload.scheduled_start_at:%Y%m%d}-{payload.company_code}-{day_count + 1:03d}",
        driver_id=driver.id,
        bus_id=bus.id,
        route_id=route.id,
        company_code=payload.company_code,
        trip_date=payload.scheduled_start_at,
        release_at=release_at,
        scheduled_start_at=payload.scheduled_start_at,
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
