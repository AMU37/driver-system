from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.models import Bus, Employee, NewEmployeeRequest, PlannedTrip, Trip, TripEmployee, TripReport, TripStatus, User, UserRole
from app.schemas import AdminTripPlanCreate, AdminUserCreate, AdminUserUpdate, DriverCreate, NewEmployeeReview, PlannedTripOut, UserOut
from app.services.employees import import_employee_rows, parse_employee_rows
from app.services.numbering import next_trip_number, normalize_trip_type
from app.services.trips import ensure_bus, ensure_route

router = APIRouter(prefix="/api/admin", tags=["admin"])


def planned_out(item: PlannedTrip) -> dict:
    return {"id": item.id, "external_id": item.external_id, "trip_number": item.trip_number, "driver_id": item.driver_id, "company_code": item.company_code, "trip_date": item.trip_date, "trip_type": item.trip_type, "release_at": item.release_at, "scheduled_start_at": item.scheduled_start_at, "status": item.status.value, "bus_number": item.bus.number if item.bus else None, "route_name": item.route.name if item.route else None, "origin": item.route.origin if item.route else None, "destination": item.route.destination if item.route else None}


@router.get("/drivers", response_model=list[UserOut])
def drivers(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.role == UserRole.driver, User.is_active.is_(True)).order_by(User.full_name)).all()


_MANAGED_ROLES = (UserRole.driver, UserRole.supervisor, UserRole.admin)


def _user_out(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "full_name": u.full_name,
        "role": u.role.value if isinstance(u.role, UserRole) else str(u.role),
        "driver_code": u.driver_code,
        "company_code": u.company_code,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
    }


@router.get("/users")
def users(user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)), db: Session = Depends(get_db)):
    """كل حسابات النظام (سائق/مشرف/أدمن) لإدارة كلمة مرور كل حساب بشكل مستقل."""
    rows = db.scalars(select(User).where(User.role.in_(_MANAGED_ROLES)).order_by(User.role, User.full_name)).all()
    return [_user_out(u) for u in rows]


@router.post("/users")
def create_user(payload: AdminUserCreate, user: User = Depends(require_roles(UserRole.admin)), db: Session = Depends(get_db)):
    """إضافة حساب مشرف/أدمن جديد (المدير فقط)."""
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(409, "اسم المستخدم موجود مسبقاً")
    target = User(
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole(payload.role),
        company_code=payload.company_code,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return _user_out(target)


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    user: User = Depends(require_roles(UserRole.supervisor, UserRole.admin)),
    db: Session = Depends(get_db),
):
    """تغيير كلمة مرور/اسم/حالة أي حساب (سائق/مشرف/أدمن) مستقلًا."""
    target = db.get(User, user_id)
    if not target or target.role not in _MANAGED_ROLES:
        raise HTTPException(404, "المستخدم غير موجود")
    if payload.full_name is not None:
        target.full_name = payload.full_name
    if payload.is_active is not None:
        if target.id == user.id and not payload.is_active:
            raise HTTPException(400, "لا يمكنك تعطيل حسابك الحالي")
        target.is_active = payload.is_active
    if payload.new_password:
        target.password_hash = hash_password(payload.new_password)
        target.must_change_password = False
    db.commit()
    db.refresh(target)
    return _user_out(target)


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
    company_code = (payload.company_code or driver.company_code or "YCSR")
    trip_type = normalize_trip_type(payload.trip_type)
    bus = ensure_bus(db, payload.bus_number, company_code)
    route = ensure_route(db, payload.route_name, payload.origin, payload.destination, company_code)
    scheduled = payload.scheduled_start_at
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    release_hours = payload.release_hours if payload.release_hours is not None else settings.trip_release_hours
    release_at = scheduled - timedelta(hours=release_hours)
    status = TripStatus.available if datetime.now(timezone.utc) >= release_at else TripStatus.planned
    item: PlannedTrip | None = None
    for _ in range(5):
        trip_number = next_trip_number(db, bus_number=payload.bus_number, company_code=company_code, when=scheduled, trip_type=trip_type)
        item = PlannedTrip(
            trip_number=trip_number,
            driver_id=driver.id,
            bus_id=bus.id,
            route_id=route.id,
            company_code=company_code,
            trip_date=scheduled,
            trip_type=trip_type,
            release_at=release_at,
            scheduled_start_at=scheduled,
            status=status,
        )
        db.add(item)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            item = None
    if item is None:
        raise HTTPException(409, "تعذر توليد رقم رحلة فريد — أعد المحاولة")
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
