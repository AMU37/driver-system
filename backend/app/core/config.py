from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "نظام رحلات السائقين"
    environment: str = "development"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    database_url: str = "sqlite:///./driver_transport.db"
    cors_origins: str = "http://localhost:3000"
    company_code_default: str = "YCSR"
    trip_release_hours: int = 8
    microsoft_enabled: bool = False
    microsoft_outbound_url: str = ""
    microsoft_inbound_api_key: str = "change-me"
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


settings = Settings()
