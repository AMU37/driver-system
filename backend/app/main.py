import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import admin, auth, driver, integration, manage, sync
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, migrate_schema
from app.core.security import verify_password
from app.models import User, models  # noqa: F401
from app.seed import seed_if_empty

logger = logging.getLogger("uvicorn.error")

APP_VERSION = "1.0.1"

# Demo credentials seeded by seed.py — if detected in production the account is
# locked until the password is changed.
DEMO_PASSWORDS = ("Admin@12345", "Supervisor@12345", "Driver@12345")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"
        )
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


if settings.is_production:
    app = FastAPI(
        title=settings.app_name,
        version=APP_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
else:
    app = FastAPI(title=settings.app_name, version=APP_VERSION, docs_url="/docs", redoc_url="/redoc")

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(driver.router)
app.include_router(admin.router)
app.include_router(manage.router)
app.include_router(integration.router)
app.include_router(sync.router)


@app.on_event("startup")
def startup():
    errors = settings.runtime_errors()
    if errors:
        raise RuntimeError("إعدادات أمان غير صالحة: " + " ; ".join(errors))

    Base.metadata.create_all(bind=engine)
    migrate_schema()

    db = SessionLocal()
    try:
        if seed_if_empty(db):
            logger.warning("SECURITY: قاعدة البيانات فارغة - تم إنشاء البيانات التجريبية (غيّر كلمات المرور فوراً)")
    except Exception:
        logger.exception("فشل البذر التلقائي للبيانات - قد تكون قاعدة البيانات فارغة بلا مستخدمين")
    finally:
        db.close()

    for warning in settings.runtime_warnings():
        logger.warning("SECURITY: %s", warning)

    if settings.is_production:
        _force_default_password_changes()


def _force_default_password_changes():
    db = SessionLocal()
    try:
        users = db.scalars(select(User)).all()
        for user in users:
            for demo_password in DEMO_PASSWORDS:
                if verify_password(demo_password, user.password_hash):
                    user.must_change_password = True
                    logger.warning(
                        "SECURITY: كلمة مرور افتراضية معروفة للمستخدم '%s' - "
                        "تم طلب تغييرها قبل المتابعة",
                        user.username,
                    )
                    break
        db.commit()
    finally:
        db.close()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": APP_VERSION,
        "environment": settings.environment,
        "database": "configured",
    }


@app.get("/")
def root():
    if settings.is_production:
        return {"name": settings.app_name, "health": "/health", "version": APP_VERSION}
    return {"name": settings.app_name, "docs": "/docs", "health": "/health", "version": APP_VERSION}


DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@app.get("/{path:path}", include_in_schema=False)
def static_site(path: str):
    """Serve the built static web app (single-service deployment)."""
    if not DIST_DIR.is_dir():
        return JSONResponse({"detail": "not found"}, status_code=404)
    dist_root = DIST_DIR.resolve()
    target = (DIST_DIR / path).resolve()
    try:
        target.relative_to(dist_root)
    except ValueError:
        return JSONResponse({"detail": "forbidden"}, status_code=403)
    if path and target.is_file():
        return FileResponse(target)
    index = dist_root / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse({"detail": "not found"}, status_code=404)