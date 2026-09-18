from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, driver, integration
from app.core.config import settings
from app.core.database import Base, engine
from app.models import models  # noqa: F401


APP_VERSION = "1.0.1"

app = FastAPI(
    title=settings.app_name,
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(driver.router)
app.include_router(admin.router)
app.include_router(integration.router)


@app.on_event("startup")
def startup():
    # V1.0 creates the initial schema automatically. Later releases can replace
    # this with formal Alembic migrations without changing the API architecture.
    Base.metadata.create_all(bind=engine)


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
    return {"name": settings.app_name, "docs": "/docs", "health": "/health", "version": APP_VERSION}
