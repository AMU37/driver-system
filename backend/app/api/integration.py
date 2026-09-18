from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Employee, PlannedTrip
from app.schemas import EmployeeSyncPayload, PlannedTripImport
from app.services.trips import import_planned_trip

router = APIRouter(prefix="/api/integration", tags=["integration"])


def require_inbound_key(x_integration_key: str | None = Header(default=None)):
    if not settings.microsoft_inbound_api_key or x_integration_key != settings.microsoft_inbound_api_key:
        raise HTTPException(401, "مفتاح التكامل غير صحيح")


@router.get("/health")
def integration_health(_: None = Depends(require_inbound_key)):
    return {"ok": True, "microsoft_enabled": settings.microsoft_enabled}


@router.post("/planned-trips")
def receive_planned_trip(payload: PlannedTripImport, _: None = Depends(require_inbound_key), db: Session = Depends(get_db)):
    item, created = import_planned_trip(db, payload)
    db.commit()
    return {"created": created, "id": item.id, "trip_number": item.trip_number, "status": item.status.value, "release_at": item.release_at}


@router.post("/employees/sync")
def sync_employees(payload: EmployeeSyncPayload, _: None = Depends(require_inbound_key), db: Session = Depends(get_db)):
    created = 0
    updated = 0
    for item in payload.employees:
        employee = db.scalar(select(Employee).where(Employee.employee_code == item.employee_code))
        if not employee:
            employee = Employee(employee_code=item.employee_code, name=item.name, job_title=item.job_title, department_name=item.department_name, company_name=item.company_name, housing_location=item.housing_location, is_active=item.is_active)
            db.add(employee)
            created += 1
        else:
            employee.name = item.name
            employee.job_title = item.job_title
            employee.department_name = item.department_name
            employee.company_name = item.company_name
            employee.housing_location = item.housing_location
            employee.is_active = item.is_active
            updated += 1
    db.commit()
    return {"ok": True, "received": len(payload.employees), "created": created, "updated": updated}
