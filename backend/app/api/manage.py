from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.core.security import hash_password
from app.models import (
    Bus,
    Company,
    Department,
    Employee,
    HousingLocation,
    Job,
    NewEmployeeRequest,
    Notification,
    PlannedTrip,
    Route,
    Trip,
    TripEmployee,
    User,
    UserRole,
)
from app.schemas import (
    BusCreate,
    BusUpdate,
    CompanyCreate,
    CompanyUpdate,
    DepartmentCreate,
    DepartmentUpdate,
    DriverUpdate,
    EmployeeCreate,
    EmployeeUpdate,
    HousingLocationCreate,
    HousingLocationUpdate,
    JobCreate,
    JobUpdate,
    RouteCreate,
    RouteUpdate,
    UserOut,
)

router = APIRouter(prefix="/api/admin", tags=["admin-management"])
ADMIN = (UserRole.supervisor, UserRole.admin)


def _conflict(detail: str):
    return HTTPException(409, detail)


def _not_found(detail: str = "العنصر غير موجود"):
    return HTTPException(404, detail)


def _delete_or_deactivate(db: Session, obj, referenced: bool) -> dict:
    if referenced and obj.is_active:
        obj.is_active = False
        db.commit()
        return {"id": obj.id, "deleted": False, "deactivated": True}
    db.delete(obj)
    db.commit()
    return {"id": obj.id, "deleted": True, "deactivated": False}


# --------------------------------------------------------------------------
# Drivers
# --------------------------------------------------------------------------
@router.put("/drivers/{driver_id}", response_model=UserOut)
def update_driver(
    driver_id: str,
    payload: DriverUpdate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    driver = db.get(User, driver_id)
    if not driver or driver.role != UserRole.driver:
        raise _not_found("السائق غير موجود")
    if payload.driver_code is not None and payload.driver_code != driver.driver_code:
        if db.scalar(select(User).where(User.driver_code == payload.driver_code, User.id != driver_id)):
            raise _conflict("كود السائق مستخدم مسبقاً")
        driver.driver_code = payload.driver_code
    if payload.full_name is not None:
        driver.full_name = payload.full_name
    if payload.company_code is not None:
        driver.company_code = payload.company_code
    if payload.is_active is not None:
        driver.is_active = payload.is_active
    if payload.new_password:
        driver.password_hash = hash_password(payload.new_password)
        driver.must_change_password = False
    db.commit()
    db.refresh(driver)
    return driver


@router.delete("/drivers/{driver_id}")
def delete_driver(
    driver_id: str,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    driver = db.get(User, driver_id)
    if not driver or driver.role != UserRole.driver:
        raise _not_found("السائق غير موجود")
    referenced = bool(
        db.scalar(select(Trip.id).where(Trip.driver_id == driver_id).limit(1))
        or db.scalar(select(PlannedTrip.id).where(PlannedTrip.driver_id == driver_id).limit(1))
        or db.scalar(select(Notification.id).where(Notification.user_id == driver_id).limit(1))
        or db.scalar(select(NewEmployeeRequest.id).where(NewEmployeeRequest.created_by == driver_id).limit(1))
    )
    if referenced and driver.is_active:
        driver.is_active = False
        driver.driver_code = None
        db.commit()
        return {"id": driver_id, "deleted": False, "deactivated": True}
    db.delete(driver)
    db.commit()
    return {"id": driver_id, "deleted": True, "deactivated": False}


# --------------------------------------------------------------------------
# Employees
# --------------------------------------------------------------------------
@router.post("/employees")
def create_employee(
    payload: EmployeeCreate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Employee).where(Employee.employee_code == payload.employee_code)):
        raise _conflict("كود الموظف موجود مسبقاً")
    employee = Employee(**payload.model_dump())
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    employee = db.get(Employee, employee_id)
    if not employee:
        raise _not_found("الموظف غير موجود")
    data = payload.model_dump(exclude_unset=True)
    if "employee_code" in data and data["employee_code"] != employee.employee_code:
        if db.scalar(select(Employee).where(Employee.employee_code == data["employee_code"], Employee.id != employee_id)):
            raise _conflict("كود الموظف مستخدم مسبقاً")
    for field, value in data.items():
        setattr(employee, field, value)
    db.commit()
    db.refresh(employee)
    return employee


@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: int,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    employee = db.get(Employee, employee_id)
    if not employee:
        raise _not_found("الموظف غير موجود")
    for passenger in db.scalars(select(TripEmployee).where(TripEmployee.employee_id == employee_id)).all():
        passenger.employee_id = None
    db.delete(employee)
    db.commit()
    return {"id": employee_id, "deleted": True, "deactivated": False}


# --------------------------------------------------------------------------
# Buses
# --------------------------------------------------------------------------
@router.post("/buses")
def create_bus(
    payload: BusCreate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Bus).where(Bus.number == payload.number)):
        raise _conflict("رقم الباص موجود مسبقاً")
    bus = Bus(**payload.model_dump())
    db.add(bus)
    db.commit()
    db.refresh(bus)
    return bus


@router.put("/buses/{bus_id}")
def update_bus(
    bus_id: int,
    payload: BusUpdate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    bus = db.get(Bus, bus_id)
    if not bus:
        raise _not_found("الباص غير موجود")
    data = payload.model_dump(exclude_unset=True)
    if "number" in data and data["number"] != bus.number:
        if db.scalar(select(Bus).where(Bus.number == data["number"], Bus.id != bus_id)):
            raise _conflict("رقم الباص مستخدم مسبقاً")
    for field, value in data.items():
        setattr(bus, field, value)
    db.commit()
    db.refresh(bus)
    return bus


@router.delete("/buses/{bus_id}")
def delete_bus(
    bus_id: int,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    bus = db.get(Bus, bus_id)
    if not bus:
        raise _not_found("الباص غير موجود")
    referenced = bool(
        db.scalar(select(PlannedTrip.id).where(PlannedTrip.bus_id == bus_id).limit(1))
        or db.scalar(select(Trip.id).where(or_(Trip.planned_bus_id == bus_id, Trip.actual_bus_id == bus_id)).limit(1))
    )
    return _delete_or_deactivate(db, bus, referenced)


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@router.get("/routes")
def routes(
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    return db.scalars(select(Route).where(Route.is_active.is_(True)).order_by(Route.name)).all()


@router.post("/routes")
def create_route(
    payload: RouteCreate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    route = Route(**payload.model_dump())
    db.add(route)
    db.commit()
    db.refresh(route)
    return route


@router.put("/routes/{route_id}")
def update_route(
    route_id: int,
    payload: RouteUpdate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    route = db.get(Route, route_id)
    if not route:
        raise _not_found("الخط غير موجود")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(route, field, value)
    db.commit()
    db.refresh(route)
    return route


@router.delete("/routes/{route_id}")
def delete_route(
    route_id: int,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    route = db.get(Route, route_id)
    if not route:
        raise _not_found("الخط غير موجود")
    referenced = bool(
        db.scalar(select(PlannedTrip.id).where(PlannedTrip.route_id == route_id).limit(1))
        or db.scalar(select(Trip.id).where(Trip.route_id == route_id).limit(1))
    )
    return _delete_or_deactivate(db, route, referenced)


# --------------------------------------------------------------------------
# Companies
# --------------------------------------------------------------------------
@router.get("/companies")
def companies(
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    return db.scalars(select(Company).where(Company.is_active.is_(True)).order_by(Company.code)).all()


@router.post("/companies")
def create_company(
    payload: CompanyCreate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Company).where(Company.code == payload.code)):
        raise _conflict("كود الشركة موجود مسبقاً")
    company = Company(**payload.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.put("/companies/{company_id}")
def update_company(
    company_id: int,
    payload: CompanyUpdate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    company = db.get(Company, company_id)
    if not company:
        raise _not_found("الشركة غير موجودة")
    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"] != company.code:
        if db.scalar(select(Company).where(Company.code == data["code"], Company.id != company_id)):
            raise _conflict("كود الشركة مستخدم مسبقاً")
    for field, value in data.items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.delete("/companies/{company_id}")
def delete_company(
    company_id: int,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    company = db.get(Company, company_id)
    if not company:
        raise _not_found("الشركة غير موجودة")
    referenced = bool(db.scalar(select(Department.id).where(Department.company_id == company_id).limit(1)))
    return _delete_or_deactivate(db, company, referenced)


# --------------------------------------------------------------------------
# Departments
# --------------------------------------------------------------------------
def _department_out(department: Department, db: Session) -> dict:
    company = db.get(Company, department.company_id) if department.company_id else None
    return {
        "id": department.id,
        "name": department.name,
        "company_id": department.company_id,
        "company_name": company.name if company else None,
        "is_active": department.is_active,
    }


@router.get("/departments")
def departments(
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    rows = db.scalars(select(Department).order_by(Department.name)).all()
    return [_department_out(row, db) for row in rows]


@router.post("/departments")
def create_department(
    payload: DepartmentCreate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Department).where(Department.name == payload.name)):
        raise _conflict("اسم الإدارة موجود مسبقاً")
    if not db.get(Company, payload.company_id):
        raise _not_found("الشركة غير موجودة")
    department = Department(name=payload.name, company_id=payload.company_id)
    db.add(department)
    db.commit()
    db.refresh(department)
    return _department_out(department, db)


@router.put("/departments/{department_id}")
def update_department(
    department_id: int,
    payload: DepartmentUpdate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    department = db.get(Department, department_id)
    if not department:
        raise _not_found("الإدارة غير موجودة")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != department.name:
        if db.scalar(select(Department).where(Department.name == data["name"], Department.id != department_id)):
            raise _conflict("اسم الإدارة مستخدم مسبقاً")
    if "company_id" in data and not db.get(Company, data["company_id"]):
        raise _not_found("الشركة غير موجودة")
    for field, value in data.items():
        setattr(department, field, value)
    db.commit()
    db.refresh(department)
    return _department_out(department, db)


@router.delete("/departments/{department_id}")
def delete_department(
    department_id: int,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    department = db.get(Department, department_id)
    if not department:
        raise _not_found("الإدارة غير موجودة")
    db.delete(department)
    db.commit()
    return {"id": department_id, "deleted": True, "deactivated": False}


# --------------------------------------------------------------------------
# Jobs
# --------------------------------------------------------------------------
@router.get("/jobs")
def jobs(
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    return db.scalars(select(Job).order_by(Job.title)).all()


@router.post("/jobs")
def create_job(
    payload: JobCreate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Job).where(Job.title == payload.title)):
        raise _conflict("المسمى الوظيفي موجود مسبقاً")
    job = Job(title=payload.title)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.put("/jobs/{job_id}")
def update_job(
    job_id: int,
    payload: JobUpdate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)
    if not job:
        raise _not_found("المسمى الوظيفي غير موجود")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] != job.title:
        if db.scalar(select(Job).where(Job.title == data["title"], Job.id != job_id)):
            raise _conflict("المسمى الوظيفي مستخدم مسبقاً")
    for field, value in data.items():
        setattr(job, field, value)
    db.commit()
    db.refresh(job)
    return job


@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)
    if not job:
        raise _not_found("المسمى الوظيفي غير موجود")
    db.delete(job)
    db.commit()
    return {"id": job_id, "deleted": True, "deactivated": False}


# --------------------------------------------------------------------------
# Housing locations
# --------------------------------------------------------------------------
@router.get("/housing")
def housing_locations(
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    return db.scalars(select(HousingLocation).order_by(HousingLocation.name)).all()


@router.post("/housing")
def create_housing(
    payload: HousingLocationCreate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    if db.scalar(select(HousingLocation).where(HousingLocation.name == payload.name)):
        raise _conflict("اسم السكن موجود مسبقاً")
    location = HousingLocation(name=payload.name)
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.put("/housing/{location_id}")
def update_housing(
    location_id: int,
    payload: HousingLocationUpdate,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    location = db.get(HousingLocation, location_id)
    if not location:
        raise _not_found("السكن غير موجود")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != location.name:
        if db.scalar(select(HousingLocation).where(HousingLocation.name == data["name"], HousingLocation.id != location_id)):
            raise _conflict("اسم السكن مستخدم مسبقاً")
    for field, value in data.items():
        setattr(location, field, value)
    db.commit()
    db.refresh(location)
    return location


@router.delete("/housing/{location_id}")
def delete_housing(
    location_id: int,
    user: User = Depends(require_roles(*ADMIN)),
    db: Session = Depends(get_db),
):
    location = db.get(HousingLocation, location_id)
    if not location:
        raise _not_found("السكن غير موجود")
    db.delete(location)
    db.commit()
    return {"id": location_id, "deleted": True, "deactivated": False}
