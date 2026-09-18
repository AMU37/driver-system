import json
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import IntegrationLog, IntegrationStatus, Trip
from app.services.trips import serialize_trip


def _request_id() -> str:
    return str(uuid.uuid4())


def build_trip_payload(trip: Trip) -> dict:
    data = serialize_trip(trip)
    return {
        "event_type": "trip.completed",
        "trip": {
            "trip_id": data["trip_number"],
            "internal_id": data["id"],
            "company_code": data["company_code"],
            "driver_id": data["driver_id"],
            "bus_number": data["actual_bus_number"] or data["planned_bus_number"],
            "route": data["route_name"],
            "origin": data["origin"],
            "destination": data["destination"],
            "scheduled_start_at": data["scheduled_start_at"].isoformat() if data["scheduled_start_at"] else None,
            "started_at": data["started_at"].isoformat() if data["started_at"] else None,
            "completed_at": data["completed_at"].isoformat() if data["completed_at"] else None,
            "employee_count": data["employee_count"],
            "employees": [
                {
                    "employee_code": p["employee_code"],
                    "name": p["name_snapshot"],
                    "job": p["job_title_snapshot"],
                    "department": p["department_snapshot"],
                    "company": p["company_snapshot"],
                    "housing_location": p["housing_location_snapshot"],
                    "visit_purpose": p["visit_purpose"],
                    "boarded_at": p["boarded_at"].isoformat(),
                    "source": p["source"],
                    "needs_review": p["needs_review"],
                }
                for p in data["passengers"]
            ],
        },
    }


def transfer_trip(db: Session, trip: Trip) -> IntegrationLog:
    payload = build_trip_payload(trip)
    request_id = _request_id()
    log = IntegrationLog(
        direction="outbound",
        event_type="trip.completed",
        entity_id=trip.trip_number,
        request_id=request_id,
        status=IntegrationStatus.pending,
        attempts=0,
        request_body=payload,
    )
    db.add(log)
    db.flush()

    if not settings.microsoft_enabled or not settings.microsoft_outbound_url:
        log.status = IntegrationStatus.pending
        log.error_message = "Microsoft integration is not configured. Trip remains ready for integration."
        return log

    headers = {"Content-Type": "application/json", "X-Request-ID": request_id}
    try:
        with httpx.Client(timeout=settings.microsoft_timeout_seconds) as client:
            response = client.post(settings.microsoft_outbound_url, headers=headers, json=payload)
        log.attempts += 1
        log.status_code = response.status_code
        try:
            log.response_body = response.json()
        except ValueError:
            log.response_body = {"text": response.text[:5000]}
        if 200 <= response.status_code < 300:
            log.status = IntegrationStatus.success
            trip.transferred_at = datetime.now(timezone.utc)
        else:
            log.status = IntegrationStatus.failed
            log.error_message = f"Microsoft returned HTTP {response.status_code}"
    except Exception as exc:
        log.attempts += 1
        log.status = IntegrationStatus.retrying
        log.error_message = str(exc)
    return log
