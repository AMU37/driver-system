import jwt

from fastapi.testclient import TestClient

from app.core.database import SessionLocal, migrate_schema
from app.core.ratelimit import (
    integration_limiter,
    login_ip_limiter,
    login_user_limiter,
)
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import User, UserRole

# Ensure the users table has the must_change_password column before any test touches it.
migrate_schema()

client = TestClient(app)


def _clear_limiters():
    for limiter in (login_ip_limiter, login_user_limiter, integration_limiter):
        limiter.clear()


def _create_temp_driver(username: str) -> User:
    db = SessionLocal()
    try:
        user = User(
            username=username,
            full_name="مستخدم اختبار أمني",
            password_hash=hash_password("TempPass123"),
            role=UserRole.driver,
            driver_code=f"SEC-{username}",
            company_code="YCSR",
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _delete_temp_driver(username: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user:
            db.delete(user)
            db.commit()
    finally:
        db.close()


def setup_function():
    _clear_limiters()


def teardown_function():
    _clear_limiters()


def test_forged_token_rejected():
    forged = jwt.encode({"sub": "admin", "type": "access"}, "attacker-secret", algorithm="HS256")
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert res.status_code == 401


def test_login_rate_limited_after_repeated_failures():
    payload = {"username": "admin", "password": "wrong-password"}
    statuses = [client.post("/api/auth/login", json=payload).status_code for _ in range(11)]
    assert statuses[:10] == [401] * 10
    assert statuses[-1] == 429


def test_successful_login_resets_user_failures():
    for _ in range(3):
        client.post("/api/auth/login", json={"username": "admin", "password": "wrong-password"})
    res = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@12345"})
    assert res.status_code == 200
    res2 = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@12345"})
    assert res2.status_code == 200


def test_integration_wrong_key_and_correct_key():
    wrong = client.post(
        "/api/integration/planned-trips",
        headers={"X-Integration-Key": "wrong"},
        json={"trip_number": "X", "driver_code": "x", "bus_number": "x", "route_name": "x", "origin": "a", "destination": "b", "scheduled_start_at": "2026-09-18T08:00:00Z"},
    )
    assert wrong.status_code == 401
    from app.core.config import settings

    if settings.microsoft_inbound_api_key:
        ok = client.get("/api/integration/health", headers={"X-Integration-Key": settings.microsoft_inbound_api_key})
        assert ok.status_code == 200


def test_must_change_password_gate_blocks_then_clears():
    username = "sec_driver_gate"
    tmp = _create_temp_driver(username)
    try:
        login = client.post("/api/auth/login", json={"username": username, "password": "TempPass123"})
        assert login.status_code == 200
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        blocked = client.get("/api/driver/dashboard", headers=headers)
        assert blocked.status_code == 403
        assert blocked.headers.get("x-must-change-password") == "true"

        weak = client.post(
            "/api/auth/change-password",
            json={"current_password": "TempPass123", "new_password": "onlyletters"},
            headers=headers,
        )
        assert weak.status_code == 422

        changed = client.post(
            "/api/auth/change-password",
            json={"current_password": "TempPass123", "new_password": "NewSecure456"},
            headers=headers,
        )
        assert changed.status_code == 200
        assert changed.json()["must_change_password"] is False

        allowed = client.get("/api/driver/dashboard", headers=headers)
        assert allowed.status_code == 200
    finally:
        db = SessionLocal()
        user = db.query(User).filter(User.id == tmp.id).first()
        if user:
            db.delete(user)
            db.commit()
        db.close()


def test_change_password_rejects_wrong_current():
    username = "sec_driver_wrongcurrent"
    _create_temp_driver(username)
    try:
        login = client.post("/api/auth/login", json={"username": username, "password": "TempPass123"})
        token = login.json()["access_token"]
        res = client.post(
            "/api/auth/change-password",
            json={"current_password": "not-the-current", "new_password": "NewSecure456"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400
    finally:
        _delete_temp_driver(username)


def test_csv_formula_injection_sanitized():
    from app.services.employees import parse_employee_rows

    csv_data = "employee_code,name,job_title\n90001,=1+1,=HYPERLINK(\"x\")\n90002,@SUM(A1),-2+3\n".encode("utf-8")
    rows = parse_employee_rows(csv_data, "file.csv")
    assert rows[0]["name"] == "'=1+1"
    assert rows[0]["job_title"].startswith("'")
    assert rows[1]["name"] == "'@SUM(A1)"
    assert rows[1]["job_title"] == "'-2+3"


def test_weak_secret_reported_as_error_in_production(monkeypatch):
    from app.core.config import settings

    original_environment = settings.environment
    original_secret = settings.secret_key
    try:
        settings.environment = "production"
        settings.secret_key = "change-me-in-production"
        errors = settings.runtime_errors()
        assert any("SECRET_KEY" in err for err in errors)
    finally:
        settings.environment = original_environment
        settings.secret_key = original_secret