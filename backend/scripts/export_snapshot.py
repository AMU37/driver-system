import json
import os
import sqlite3
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("DB_PATH") or os.path.join(BACKEND_DIR, "driver_transport.db")
OUT_PATH = os.environ.get("SNAPSHOT_OUT") or os.path.join(
    BACKEND_DIR, "..", "frontend", "public", "data", "snapshot.json"
)


def norm(value):
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        if " " in s and s.count(":") >= 2:
            return s.replace(" ", "T")
        return s
    return value


def main():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    employees = [
        {
            "id": r["id"],
            "employee_code": r["employee_code"],
            "name": r["name"],
            "job_title": r["job_title"],
            "department_name": r["department_name"],
            "company_name": r["company_name"],
            "housing_location": r["housing_location"],
            "is_active": bool(r["is_active"]),
        }
        for r in db.execute(
            """SELECT id, employee_code, name, job_title, department_name, company_name, housing_location, is_active
               FROM employees ORDER BY employee_code"""
        )
    ]

    buses = [
        {
            "id": r["id"],
            "number": r["number"],
            "plate_number": r["plate_number"],
            "capacity": r["capacity"],
            "company_code": r["company_code"],
            "is_active": bool(r["is_active"]),
        }
        for r in db.execute(
            """SELECT id, number, plate_number, capacity, company_code, is_active
               FROM buses ORDER BY number"""
        )
    ]

    routes = [
        {
            "id": r["id"],
            "name": r["name"],
            "origin": r["origin"],
            "destination": r["destination"],
            "company_code": r["company_code"],
            "is_active": bool(r["is_active"]),
        }
        for r in db.execute(
            """SELECT id, name, origin, destination, company_code, is_active
               FROM routes ORDER BY name"""
        )
    ]

    drivers = [
        {
            "id": r["id"],
            "username": r["username"],
            "full_name": r["full_name"],
            "role": r["role"],
            "driver_code": r["driver_code"],
            "company_code": r["company_code"],
        }
        for r in db.execute(
            """SELECT id, username, full_name, role, driver_code, company_code
               FROM users WHERE role IN ('driver', 'supervisor', 'admin') ORDER BY username"""
        )
    ]

    planned = [
        {
            "id": r["id"],
            "external_id": r["external_id"],
            "trip_number": r["trip_number"],
            "driver_id": r["driver_id"],
            "driver_username": r["u"] and r["u"][0],
            "driver_full_name": r["u"] and r["u"][1],
            "company_code": r["company_code"],
            "bus_number": r["bus_number"],
            "route_name": r["route_name"],
            "origin": r["origin"],
            "destination": r["destination"],
            "trip_date": norm(r["trip_date"]),
            "release_at": norm(r["release_at"]),
            "scheduled_start_at": norm(r["scheduled_start_at"]),
            "status": r["status"],
        }
        for r in db.execute(
            """
            SELECT p.*, b.number AS bus_number, ro.name AS route_name, ro.origin, ro.destination,
                   (SELECT username FROM users u WHERE u.id = p.driver_id) AS u
            FROM planned_trips p
            LEFT JOIN buses b ON b.id = p.bus_id
            LEFT JOIN routes ro ON ro.id = p.route_id
            ORDER BY p.scheduled_start_at DESC LIMIT 500
            """
        )
    ]

    # Restructure driver join fields that the placeholder above cannot easily produce.
    planned = [
        {
            "id": r["id"],
            "external_id": r["external_id"],
            "trip_number": r["trip_number"],
            "driver_id": r["driver_id"],
            "driver_username": r["u"],
            "driver_full_name": r["u"],
            "company_code": r["company_code"],
            "bus_number": r["bus_number"],
            "route_name": r["route_name"],
            "origin": r["origin"],
            "destination": r["destination"],
            "trip_date": norm(r["trip_date"]),
            "release_at": norm(r["release_at"]),
            "scheduled_start_at": norm(r["scheduled_start_at"]),
            "status": r["status"],
        }
        for r in db.execute(
            """
            SELECT p.id, p.external_id, p.trip_number, p.driver_id, p.company_code,
                   p.trip_date, p.release_at, p.scheduled_start_at, p.status,
                   b.number AS bus_number, ro.name AS route_name, ro.origin, ro.destination,
                   u.username AS u
            FROM planned_trips p
            LEFT JOIN buses b ON b.id = p.bus_id
            LEFT JOIN routes ro ON ro.id = p.route_id
            LEFT JOIN users u ON u.id = p.driver_id
            ORDER BY p.scheduled_start_at DESC LIMIT 500
            """
        )
    ]

    snapshot = {
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
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, ensure_ascii=False, indent=1)

    print("done", OUT_PATH)
    for k, v in snapshot["counts"].items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()