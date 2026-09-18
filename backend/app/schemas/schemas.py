from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    full_name: str
    role: str
    driver_code: str | None = None
    company_code: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class EmployeeLookup(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_code: str
    name: str
    job_title: str | None = None
    department_name: str | None = None
    company_name: str | None = None
    housing_location: str | None = None
    is_active: bool


class NewEmployeeCreate(BaseModel):
    employee_code: str | None = Field(default=None, max_length=50)
    name: str = Field(min_length=2, max_length=200)
    job_title: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    visit_purpose: str = Field(default="employee", max_length=50)
    notes: str | None = None


class TripEmployeeAdd(BaseModel):
    employee_code: str = Field(min_length=1, max_length=50)
    visit_purpose: str = "employee"


class TripEmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_code: str
    name_snapshot: str
    job_title_snapshot: str | None = None
    department_snapshot: str | None = None
    company_snapshot: str | None = None
    housing_location_snapshot: str | None = None
    visit_purpose: str
    boarded_at: datetime
    source: str
    needs_review: bool


class TripOut(BaseModel):
    id: int
    trip_number: str
    driver_id: str
    company_code: str
    status: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    transferred_at: datetime | None = None
    employee_count: int
    planned_bus_number: str | None = None
    actual_bus_number: str | None = None
    route_name: str | None = None
    origin: str | None = None
    destination: str | None = None
    scheduled_start_at: datetime | None = None
    release_at: datetime | None = None


class TripDetail(TripOut):
    passengers: list[TripEmployeeOut] = []


class PlannedTripOut(BaseModel):
    id: int
    external_id: str | None = None
    trip_number: str
    driver_id: str
    company_code: str
    trip_date: datetime
    release_at: datetime | None = None
    scheduled_start_at: datetime
    status: str
    bus_number: str | None = None
    route_name: str | None = None
    origin: str | None = None
    destination: str | None = None


class PlannedTripImport(BaseModel):
    external_id: str | None = None
    trip_number: str
    driver_code: str
    bus_number: str
    route_name: str
    origin: str
    destination: str
    company_code: str = "YCSR"
    scheduled_start_at: datetime
    release_hours: int | None = None
    metadata: dict = {}


class AdminTripPlanCreate(BaseModel):
    driver_code: str
    bus_number: str
    route_name: str
    origin: str
    destination: str
    company_code: str = "YCSR"
    scheduled_start_at: datetime
    release_hours: int | None = None


class DriverCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    driver_code: str = Field(min_length=1, max_length=50)
    company_code: str = "YCSR"


class EmployeeSyncItem(BaseModel):
    employee_code: str
    name: str
    job_title: str | None = None
    department_name: str | None = None
    company_name: str | None = None
    housing_location: str | None = None
    is_active: bool = True


class EmployeeSyncPayload(BaseModel):
    employees: list[EmployeeSyncItem] = []


class NewEmployeeReview(BaseModel):
    status: str = Field(pattern="^(approved|rejected)$")


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    body: str
    read_at: datetime | None = None
    created_at: datetime


class DashboardOut(BaseModel):
    upcoming: list[PlannedTripOut]
    active_trip: TripDetail | None = None
    stats: dict[str, int]
