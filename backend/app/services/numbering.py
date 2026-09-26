"""Single source of truth for trip numbers.

A trip number identifies exactly one physical journey.  A planned trip and the
actual trip executed from it therefore share the same number; only journeys
that were never planned get a freshly allocated one.

Format:  TR-{bus}-{YYYYMMDD}-{COMPANY}-{M|Q}-{NNN}

  M = مغادر (outbound)   Q = قادم (inbound)

NNN is the sequence **within** one (bus, day, company, trip type) group and is
computed from every source that can mint a number — planned trips, executed
trips and trip reports received from driver handsets.  That is what keeps a
manually created trip on a driver phone from colliding with a planned trip for
the same bus on the same day.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlannedTrip, Trip, TripReport

TRIP_TYPE_ALIASES = {
    "مغادر": "مغادر",
    "مغادرة": "مغادر",
    "خارج": "مغادر",
    "الخروج": "مغادر",
    "outbound": "مغادر",
    "قادم": "قادم",
    "قادمة": "قادم",
    "داخل": "قادم",
    "الدخول": "قادم",
    "inbound": "قادم",
}
TRIP_TYPE_CODES = {"مغادر": "M", "قادم": "Q"}
DEFAULT_TRIP_TYPE = "مغادر"


def normalize_trip_type(value: str | None) -> str:
    """Map any accepted spelling onto one of the two canonical types."""
    raw = (value or "").strip()
    if not raw:
        return DEFAULT_TRIP_TYPE
    if raw in TRIP_TYPE_ALIASES:
        return TRIP_TYPE_ALIASES[raw]
    return TRIP_TYPE_ALIASES.get(raw.lower(), DEFAULT_TRIP_TYPE)


def trip_type_code(value: str | None) -> str:
    return TRIP_TYPE_CODES[normalize_trip_type(value)]


def _like_prefix(prefix: str) -> str:
    escaped = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return escaped + "%"


def trip_number_prefix(bus_number: str, when: datetime, company_code: str, trip_type: str | None) -> str:
    return f"TR-{bus_number}-{when:%Y%m%d}-{company_code}-{trip_type_code(trip_type)}-"


def next_trip_number(
    db: Session,
    *,
    bus_number: str,
    company_code: str,
    when: datetime,
    trip_type: str | None,
) -> str:
    """Return the next free number for this bus/day/company/type group."""
    prefix = trip_number_prefix(bus_number, when, company_code, trip_type)
    pattern = _like_prefix(prefix)
    numbers: list[str] = []
    numbers += list(db.scalars(select(PlannedTrip.trip_number).where(PlannedTrip.trip_number.like(pattern, escape="\\"))).all())
    numbers += list(db.scalars(select(Trip.trip_number).where(Trip.trip_number.like(pattern, escape="\\"))).all())
    numbers += list(db.scalars(select(TripReport.trip_number).where(TripReport.trip_number.like(pattern, escape="\\"))).all())
    highest = 0
    for number in numbers:
        tail = number[len(prefix):]
        if tail.isdigit():
            highest = max(highest, int(tail))
    return f"{prefix}{highest + 1:03d}"
