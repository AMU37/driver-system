from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


database_url = settings.sqlalchemy_database_url
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
engine = create_engine(
    database_url,
    pool_pre_ping=True,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def column_exists(table: str, column: str) -> bool:
    with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            rows = conn.exec_driver_sql(f'PRAGMA table_info("{table}")').fetchall()
            return any(row[1] == column for row in rows)
        row = conn.exec_driver_sql(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = %s AND column_name = %s",
            (table, column),
        ).fetchone()
        return row is not None


def migrate_schema() -> None:
    """Lightweight additive migrations for columns added after first deploy.

    Intentionally keeps scope small: only idempotent ADD COLUMN operations on
    pre-existing tables. Run AFTER Base.metadata.create_all() so that fresh
    databases already contain these columns (pragmas would otherwise find no
    table at all on first boot).
    """
    if not column_exists("users", "must_change_password"):
        with engine.begin() as conn:
            if engine.dialect.name == "sqlite":
                conn.exec_driver_sql(
                    "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT 0 NOT NULL"
                )
            else:
                conn.exec_driver_sql(
                    "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE NOT NULL"
                )
    _normalize_datetime_columns()


def _normalize_datetime_columns() -> None:
    """Backfill invalid stored datetimes on legacy rows.

    Some older inserts stored 0 (or empty) in DATETIME columns.  Reading such
    rows crashes SQLite's str_to_datetime, so we normalize them to now during
    startup.  Idempotent; cheap on small reference tables.
    """
    import datetime as _dt

    tables = (
        "users", "trips", "planned_trips", "notifications",
        "audit_logs", "integration_logs", "new_employee_requests",
    )
    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    with engine.begin() as conn:
        for table in tables:
            try:
                if not column_exists(table, "created_at"):
                    continue
                if engine.dialect.name == "sqlite":
                    conn.exec_driver_sql(
                        f"UPDATE {table} SET created_at = ? "
                        "WHERE created_at IS NULL OR CAST(created_at AS TEXT) IN ('0', '')",
                        (now,),
                    )
                else:
                    conn.exec_driver_sql(
                        text(f"UPDATE {table} SET created_at = :now "
                             "WHERE created_at IS NULL OR CAST(created_at AS VARCHAR) IN ('0', '')"),
                        {"now": now},
                    )
            except Exception:
                # Table may not exist yet on fresh installs (create_all runs first,
                # but be defensive about partial schemas).
                continue
