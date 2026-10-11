from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine, migrate_schema
from app.main import app
from app.models import Employee, PlannedTrip, User, UserRole

Base.metadata.create_all(bind=engine)
migrate_schema()
client = TestClient(app)

_DRIVER_CODE = "TST-ASSIGN-DRV"
_EMP_CODE = "TST-ASSIGN-EMP"


def _cleanup():
    db = SessionLocal()
    try:
        for plan in db.query(PlannedTrip).filter(PlannedTrip.trip_number.like("%TSTASSIGN%")).all():
            db.delete(plan)
        emp = db.query(Employee).filter(Employee.employee_code == _EMP_CODE).first()
        if emp:
            db.delete(emp)
        driver = db.query(User).filter(User.driver_code == _DRIVER_CODE).first()
        if driver:
            db.delete(driver)
        db.commit()
    finally:
        db.close()


def test_create_plan_assigns_employees():
    _cleanup()
    try:
        db = SessionLocal()
        db.add(Employee(employee_code=_EMP_CODE, name="موظف إسناد", housing_location="الحديدة",
                        work_schedule="YCSR-B-YCSR-B", schedule_desc="من الأحد - الأربعاء",
                        work_days=4, rest_days=3, first_work_day="2026-08-02 00:00:00", departure_time="16:00:00"))
        db.add(User(username="tst_assign_driver", full_name="سائق إسناد",
                    password_hash="x", role=UserRole.driver, driver_code=_DRIVER_CODE, company_code="YCSR"))
        db.commit()
        db.close()

        login = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@12345"})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        res = client.post(
            "/api/admin/planned-trips",
            headers=headers,
            json={
                "driver_code": _DRIVER_CODE,
                "bus_number": "TST-BUS",
                "route_name": "TST-ROUTE",
                "origin": "أ",
                "destination": "ب",
                "trip_type": "قادم",
                "scheduled_start_at": "2027-01-03T06:00:00Z",
                "employee_codes": [_EMP_CODE, _EMP_CODE, "UNKNOWN-CODE"],
                "employee_statuses": {_EMP_CODE: "arriving"},
            },
        )
        assert res.status_code in (200, 201), res.text
        body = res.json()
        codes = [e["employee_code"] for e in body["assigned_employees"]]
        assert _EMP_CODE in codes
        assert codes.count(_EMP_CODE) == 1
        assigned = next(e for e in body["assigned_employees"] if e["employee_code"] == _EMP_CODE)
        assert assigned["name"] == "موظف إسناد"
        assert assigned["housing_location"] == "الحديدة"

        listed = client.get("/api/admin/planned-trips", headers=headers)
        assert listed.status_code == 200
        match = [p for p in listed.json() if p["trip_number"] == body["trip_number"]]
        assert match and any(e["employee_code"] == _EMP_CODE for e in match[0]["assigned_employees"])
    finally:
        _cleanup()
