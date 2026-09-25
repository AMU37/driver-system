from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "change-me-in-production"
KNOWN_WEAK_KEYS = {
    "",
    "change-me",
    "secret",
    "secret-key",
    "replace-with-a-secret-key",
    "replace-with-a-long-random-production-secret",
    "replace-with-a-long-random-inbound-key",
    DEFAULT_SECRET_KEY,
}


class Settings(BaseSettings):
    app_name: str = "نظام رحلات السائقين"
    environment: str = "development"
    secret_key: str = DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    database_url: str = "sqlite:///./driver_transport.db"
    cors_origins: str = "http://localhost:3000"
    company_code_default: str = "YCSR"
    trip_release_hours: int = 8
    microsoft_enabled: bool = False
    microsoft_outbound_url: str = ""
    microsoft_inbound_api_key: str = ""
    microsoft_timeout_seconds: int = 15

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        url = self.database_url.strip()
        # Supabase/Render examples commonly provide postgres:// or postgresql://.
        # SQLAlchemy with psycopg expects the explicit postgresql+psycopg dialect.
        if url.startswith("postgres://"):
            return "postgresql+psycopg://" + url[len("postgres://"): ]
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url[len("postgresql://"): ]
        return url

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def secure_secret(self) -> bool:
        key = self.secret_key.strip()
        return bool(key) and key.lower() not in KNOWN_WEAK_KEYS and len(key) >= 32

    @property
    def secure_microsoft_inbound_key(self) -> bool:
        key = self.microsoft_inbound_api_key.strip()
        return bool(key) and key.lower() not in KNOWN_WEAK_KEYS and len(key) >= 24

    def runtime_warnings(self) -> list[str]:
        warnings: list[str] = []
        if not self.secure_secret:
            warnings.append(
                "SECRET_KEY ضعيف: استخدم قيمة عشوائية بطول 32 حرفاً فأكثر "
                f"(الحالية: {len(self.secret_key)} حرفاً) - مطلوب في الإنتاج"
            )
        if self.microsoft_enabled and not self.secure_microsoft_inbound_key:
            warnings.append("MICROSOFT_INBOUND_API_KEY ضعيف (عالجه قبل تفعيل التكامل في الإنتاج)")
        if not self.microsoft_outbound_url.strip():
            warnings.append("MICROSOFT_OUTBOUND_URL فارغ: الترحيل الخارجي للرحلات لن يعمل")
        return warnings

    def runtime_errors(self) -> list[str]:
        errors: list[str] = []
        if self.is_production:
            if not self.secure_secret:
                errors.append("SECRET_KEY غير آمن متطلب في بيئة الإنتاج (32+ حرفاً عشوائياً)")
            if self.microsoft_enabled and not self.secure_microsoft_inbound_key:
                errors.append("MICROSOFT_INBOUND_API_KEY غير آمن متطلب عند تفعيل التكامل في الإنتاج")
        return errors


settings = Settings()
