from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

_PASSWORD_RULE = "يجب أن تحتوي كلمة المرور على حروف وأرقام وألا تقل عن 8 أحرف"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    full_name: str
    role: str
    driver_code: str | None = None
    company_code: str
    must_change_password: bool = False


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        if not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value):
            raise ValueError(_PASSWORD_RULE)
        return value


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
    trip_type: str | None = None
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
    trip_type: str | None = None
    scheduled_start_at: datetime
    release_hours: int | None = None
    metadata: dict = {}


class AdminTripPlanCreate(BaseModel):
    driver_code: str
    bus_number: str
    route_name: str
    origin: str
    destination: str
    company_code: str | None = None
    trip_type: str | None = None
    scheduled_start_at: datetime
    release_hours: int | None = None


class DriverCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    driver_code: str = Field(min_length=1, max_length=50)
    company_code: str = "YCSR"

    @field_validator("password")
    @classmethod
    def driver_password_strength(cls, value: str) -> str:
        if not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value):
            raise ValueError(_PASSWORD_RULE)
        return value


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


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=2, max_length=200)
    job_title: str | None = Field(default=None, max_length=200)
    department_name: str | None = Field(default=None, max_length=200)
    company_name: str | None = Field(default=None, max_length=200)
    housing_location: str | None = Field(default=None, max_length=200)
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    employee_code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=2, max_length=200)
    job_title: str | None = Field(default=None, max_length=200)
    department_name: str | None = Field(default=None, max_length=200)
    company_name: str | None = Field(default=None, max_length=200)
    housing_location: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None


class DriverUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    driver_code: str | None = Field(default=None, min_length=1, max_length=50)
    company_code: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=200)

    @field_validator("new_password")
    @classmethod
    def driver_update_password_strength(cls, value: str | None) -> str | None:
        if value is not None and (
            not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value)
        ):
            raise ValueError(_PASSWORD_RULE)
        return value


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    role: str = "supervisor"
    company_code: str = "YCSR"

    @field_validator("password")
    @classmethod
    def admin_user_password_strength(cls, value: str) -> str:
        if not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value):
            raise ValueError(_PASSWORD_RULE)
        return value

    @field_validator("role")
    @classmethod
    def admin_user_role_allowed(cls, value: str) -> str:
        if value not in ("supervisor", "admin"):
            raise ValueError("الدور المسموح: مشرف أو أدمن")
        return value


class AdminUserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=200)

    @field_validator("new_password")
    @classmethod
    def admin_user_update_password_strength(cls, value: str | None) -> str | None:
        if value is not None and (
            not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value)
        ):
            raise ValueError(_PASSWORD_RULE)
        return value


class BusCreate(BaseModel):
    number: str = Field(min_length=1, max_length=50)
    plate_number: str | None = Field(default=None, max_length=100)
    capacity: int = Field(default=40, ge=1, le=200)
    company_code: str = "YCSR"


class BusUpdate(BaseModel):
    number: str | None = Field(default=None, min_length=1, max_length=50)
    plate_number: str | None = Field(default=None, max_length=100)
    capacity: int | None = Field(default=None, ge=1, le=200)
    company_code: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None


class CompanyCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=2, max_length=200)


class CompanyUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, min_length=2, max_length=200)
    is_active: bool | None = None


class RouteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    origin: str = Field(min_length=1, max_length=200)
    destination: str = Field(min_length=1, max_length=200)
    company_code: str = "YCSR"


class RouteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    origin: str | None = Field(default=None, min_length=1, max_length=200)
    destination: str | None = Field(default=None, min_length=1, max_length=200)
    company_code: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    company_id: int


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    company_id: int | None = None
    is_active: bool | None = None


class JobCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class JobUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    is_active: bool | None = None


class HousingLocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class HousingLocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    is_active: bool | None = None


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
