from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models import User

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _norm(value):
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        if " " in s and s.count(":") >= 2:
            return s.replace(" ", "T")
        return s
    return value


@router.get("/snapshot")
def sync_snapshot(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """نسخة كاملة من البيانات الأساسية لتنزيلها على أجهزة التطبيق (مصدر التحديث)."""
    employees = [
        {
            "id": r.id, "employee_code": r.employee_code, "name": r.name, "job_title": r.job_title,
            "department_name": r.department_name, "company_name": r.company_name,
            "housing_location": r.housing_location, "is_active": bool(r.is_active),
        }
        for r in db.execute(text("SELECT id, employee_code, name, job_title, department_name, company_name, housing_location, is_active FROM employees ORDER BY employee_code"))
    ]
    buses = [
        {
            "id": r.id, "number": r.number, "plate_number": r.plate_number, "capacity": r.capacity,
            "company_code": r.company_code, "is_active": bool(r.is_active),
        }
        for r in db.execute(text("SELECT id, number, plate_number, capacity, company_code, is_active FROM buses ORDER BY number"))
    ]
    routes = [
        {
            "id": r.id, "name": r.name, "origin": r.origin, "destination": r.destination,
            "company_code": r.company_code, "is_active": bool(r.is_active),
        }
        for r in db.execute(text("SELECT id, name, origin, destination, company_code, is_active FROM routes ORDER BY name"))
    ]
    drivers = [
        {
            "id": r.id, "username": r.username, "full_name": r.full_name, "role": r.role,
            "driver_code": r.driver_code, "company_code": r.company_code,
        }
        for r in db.execute(text("SELECT id, username, full_name, role, driver_code, company_code FROM users WHERE role IN ('driver', 'supervisor', 'admin') ORDER BY username"))
    ]
    planned = [
        {
            "id": r.id, "external_id": r.external_id, "trip_number": r.trip_number, "driver_id": r.driver_id,
            "driver_username": r.driver_username, "company_code": r.company_code, "bus_number": r.bus_number,
            "route_name": r.route_name, "origin": r.origin, "destination": r.destination,
            "trip_date": _norm(r.trip_date), "release_at": _norm(r.release_at),
            "scheduled_start_at": _norm(r.scheduled_start_at), "status": r.status,
        }
        for r in db.execute(text(
            """
            SELECT p.id, p.external_id, p.trip_number, p.driver_id, p.company_code,
                   p.trip_date, p.release_at, p.scheduled_start_at, p.status,
                   b.number AS bus_number, ro.name AS route_name, ro.origin, ro.destination,
                   u.username AS driver_username
            FROM planned_trips p
            LEFT JOIN buses b ON b.id = p.bus_id
            LEFT JOIN routes ro ON ro.id = p.route_id
            LEFT JOIN users u ON u.id = p.driver_id
            ORDER BY p.scheduled_start_at DESC LIMIT 500
            """
        ))
    ]
    return {
        "version": 1,
        "built_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "counts": {
            "employees": len(employees),
            "buses": len(buses),
            "routes": len(routes),
            "drivers": len(drivers),
            "planned": len(planned),
        },
        "employees": employees,
        "buses": buses,
        "routes": routes,
        "drivers": drivers,
        "planned": planned,
        "config": {"power_automate_url": settings.microsoft_outbound_url or ""},
    }