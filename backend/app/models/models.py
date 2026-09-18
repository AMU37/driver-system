import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    driver = "driver"
    supervisor = "supervisor"
    admin = "admin"


class TripStatus(str, enum.Enum):
    planned = "planned"
    available = "available"
    started = "started"
    boarding = "boarding"
    completed = "completed"
    transferred = "transferred"
    received = "received"
    cancelled = "cancelled"
    needs_review = "needs_review"


class EmployeeVisitPurpose(str, enum.Enum):
    employee = "employee"
    contractor = "contractor"
    visitor = "visitor"
    meeting = "meeting"
    training = "training"
    maintenance = "maintenance"
    business_mission = "business_mission"
    other = "other"


class IntegrationStatus(str, enum.Enum):
    pending = "pending"
    success = "success"
    failed = "failed"
    retrying = "retrying"


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class HousingLocation(Base):
    __tablename__ = "housing_locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    job_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    housing_location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Bus(Base):
    __tablename__ = "buses"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    plate_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=40)
    company_code: Mapped[str] = mapped_column(String(30), default="YCSR", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Route(Base):
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    origin: Mapped[str] = mapped_column(String(200))
    destination: Mapped[str] = mapped_column(String(200))
    company_code: Mapped[str] = mapped_column(String(30), default="YCSR", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(default=UserRole.driver)
    driver_code: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    company_code: Mapped[str] = mapped_column(String(30), default="YCSR", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PlannedTrip(Base):
    __tablename__ = "planned_trips"
    __table_args__ = (UniqueConstraint("external_id", name="uq_planned_external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str | None] = mapped_column(String(150), nullable=True, index=True)
    trip_number: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    bus_id: Mapped[int] = mapped_column(ForeignKey("buses.id"), index=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    company_code: Mapped[str] = mapped_column(String(30), default="YCSR", index=True)
    trip_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    release_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[TripStatus] = mapped_column(default=TripStatus.planned, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    driver = relationship("User")
    bus = relationship("Bus")
    route = relationship("Route")


class Trip(Base):
    __tablename__ = "trips"
    id: Mapped[int] = mapped_column(primary_key=True)
    trip_number: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    planned_trip_id: Mapped[int | None] = mapped_column(ForeignKey("planned_trips.id"), nullable=True, index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    planned_bus_id: Mapped[int | None] = mapped_column(ForeignKey("buses.id"), nullable=True)
    actual_bus_id: Mapped[int | None] = mapped_column(ForeignKey("buses.id"), nullable=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    company_code: Mapped[str] = mapped_column(String(30), index=True)
    status: Mapped[TripStatus] = mapped_column(default=TripStatus.started, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transferred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    employee_count: Mapped[int] = mapped_column(Integer, default=0)
    transfer_attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    driver = relationship("User")
    planned_trip = relationship("PlannedTrip")
    route = relationship("Route")
    actual_bus = relationship("Bus", foreign_keys=[actual_bus_id])
    planned_bus = relationship("Bus", foreign_keys=[planned_bus_id])
    passengers = relationship("TripEmployee", back_populates="trip", cascade="all, delete-orphan")


class TripEmployee(Base):
    __tablename__ = "trip_employees"
    __table_args__ = (UniqueConstraint("trip_id", "employee_id", name="uq_trip_employee"), UniqueConstraint("trip_id", "employee_code", name="uq_trip_employee_code"))
    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), index=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True, index=True)
    employee_code: Mapped[str] = mapped_column(String(50), index=True)
    name_snapshot: Mapped[str] = mapped_column(String(200))
    job_title_snapshot: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department_snapshot: Mapped[str | None] = mapped_column(String(200), nullable=True)
    company_snapshot: Mapped[str | None] = mapped_column(String(200), nullable=True)
    housing_location_snapshot: Mapped[str | None] = mapped_column(String(200), nullable=True)
    visit_purpose: Mapped[str] = mapped_column(String(50), default=EmployeeVisitPurpose.employee.value)
    boarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    source: Mapped[str] = mapped_column(String(30), default="employee_master")
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)

    trip = relationship("Trip", back_populates="passengers")
    employee = relationship("Employee")


class NewEmployeeRequest(Base):
    __tablename__ = "new_employee_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    employee_code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    job_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    visit_purpose: Mapped[str] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IntegrationLog(Base):
    __tablename__ = "integration_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    direction: Mapped[str] = mapped_column(String(20))
    event_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[str] = mapped_column(String(150), index=True)
    request_id: Mapped[str] = mapped_column(String(100), unique=True)
    status: Mapped[IntegrationStatus] = mapped_column(default=IntegrationStatus.pending, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    request_body: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_body: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[str] = mapped_column(String(150))
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
