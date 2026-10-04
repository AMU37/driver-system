"""Single source of truth for trip numbers.

A trip number identifies exactly one physical journey.  A planned trip and the
actual trip executed from it therefore share the same number; only journeys
that were never planned get a freshly allocated one.

Format:  TR-{bus}-{YYYYMMDD}-{COMPANY}-{DRIVER}-{M|Q}-{NNN}

  DRIVER = the driver code (sanitised, e.g. DRV-001 -> DRV001)
  M = مغادر (outbound)   Q = قادم (inbound)

NNN is the sequence **within** one (day, company, driver, trip type) group —
deliberately *not* per bus, so one driver's journeys stay sequential
(001, 002, 003, ...) even when they move between buses.  The bus stays visible
in the number as journey data.

The sequence is computed from every source that can mint a number — planned
trips, executed trips and trip reports received from driver handsets.  That is
what keeps a manually created trip on a driver phone from colliding with a
planned trip of the same driver for the same day and type.
"""

from __future__ import annotations

import re
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

_DRIVER_SEGMENT_MAX = 10


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


def driver_segment(value: str | None) -> str:
    """Driver code as it appears inside a trip number.

    Alphanumerics only, upper-cased and capped, so the segment can never break
    the number grammar (and therefore the prefix matching on both the server
    and the handset, which implement this identically).
    """
    cleaned = re.sub(r"[^A-Za-z0-9]", "", (value or "").strip()).upper()
    return (cleaned[:_DRIVER_SEGMENT_MAX]) or "NA"


def _like_literal(text: str) -> str:
    """Escape LIKE metacharacters in a part of the pattern that must match exactly."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def trip_number(
    *, bus_number: str, when: datetime, company_code: str, driver_code: str | None, trip_type: str | None, seq: int
) -> str:
    return (
        f"TR-{bus_number}-{when:%Y%m%d}-{company_code}-"
        f"{driver_segment(driver_code)}-{trip_type_code(trip_type)}-{seq:03d}"
    )


def sequence_pattern(*, when: datetime, company_code: str, driver_code: str | None, trip_type: str | None) -> str:
    """LIKE pattern for the whole group, with the leading bus segment wildcard.

    The sequence follows the driver across buses, so the bus position is left
    open (a deliberate LIKE wildcard) while everything around it is anchored.
    """
    tail = f"-{when:%Y%m%d}-{company_code}-{driver_segment(driver_code)}-{trip_type_code(trip_type)}-"
    return "TR-%" + _like_literal(tail) + "%"


def next_trip_number(
    db: Session,
    *,
    bus_number: str,
    company_code: str,
    driver_code: str | None,
    when: datetime,
    trip_type: str | None,
) -> str:
    """Return the next free number for this (day, company, driver, type) group."""
    pattern = sequence_pattern(
        when=when, company_code=company_code, driver_code=driver_code, trip_type=trip_type
    )
    numbers: list[str] = []
    numbers += list(db.scalars(select(PlannedTrip.trip_number).where(PlannedTrip.trip_number.like(pattern, escape="\\"))).all())
    numbers += list(db.scalars(select(Trip.trip_number).where(Trip.trip_number.like(pattern, escape="\\"))).all())
    numbers += list(db.scalars(select(TripReport.trip_number).where(TripReport.trip_number.like(pattern, escape="\\"))).all())
    highest = 0
    for number in numbers:
        tail = number.rsplit("-", 1)[-1]
        if tail.isdigit():
            highest = max(highest, int(tail))
    return trip_number(
        bus_number=bus_number,
        when=when,
        company_code=company_code,
        driver_code=driver_code,
        trip_type=trip_type,
        seq=highest + 1,
    )