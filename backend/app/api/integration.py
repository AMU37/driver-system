import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.ratelimit import enforce, integration_limiter
from app.models import Employee, PlannedTrip
from app.schemas import EmployeeSyncPayload, PlannedTripImport
from app.services.trips import import_planned_trip

router = APIRouter(prefix="/api/integration", tags=["integration"])


def require_inbound_key(
    request: Request,
    x_integration_key: str | None = Header(default=None),
) -> None:
    key = f"integration-ip:{request.client.host if request.client else 'unknown'}"
    enforce(integration_limiter, key)
    if not settings.microsoft_inbound_api_key:
        raise HTTPException(503, "التكامل غير مهيأ حاليًا")
    if not x_integration_key or not hmac.compare_digest(
        x_integration_key, settings.microsoft_inbound_api_key
    ):
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
    _SCHEDULE_FIELDS = (
        "job_title", "department_name", "company_name", "housing_location",
        "work_schedule", "schedule_desc", "work_days", "rest_days", "first_work_day",
        "rotation_status", "departure_time", "gender", "service_type", "transport_type",
        "cycle_day_today", "base_status_today", "cycle_day_tomorrow", "is_active",
    )
    for item in payload.employees:
        employee = db.scalar(select(Employee).where(Employee.employee_code == item.employee_code))
        if not employee:
            employee = Employee(employee_code=item.employee_code, name=item.name)
            db.add(employee)
            created += 1
        else:
            employee.name = item.name
            updated += 1
        for field in _SCHEDULE_FIELDS:
            setattr(employee, field, getattr(item, field))
    db.commit()
    return {"ok": True, "received": len(payload.employees), "created": created, "updated": updated}
