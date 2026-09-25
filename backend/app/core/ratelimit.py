import threading
import time

from fastapi import HTTPException


class RateLimiter:
    """In-memory sliding-window rate limiter, keyed by an arbitrary string.

    Suitable for single-process deployments (Render free/standard). For
    multi-replica deployments replace this with a shared store (e.g. Redis).
    """

    def __init__(self, max_hits: int, window_seconds: int):
        self.max_hits = max_hits
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = [t for t in self._hits.get(key, []) if now - t < self.window_seconds]
            self._hits[key] = bucket
            return len(bucket) < self.max_hits

    def record(self, key: str) -> None:
        with self._lock:
            self._hits.setdefault(key, []).append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


def enforce(limiter: RateLimiter, key: str) -> None:
    if not limiter.check(key):
        limiter.record(key)
        raise HTTPException(
            status_code=429,
            detail="محاولات كثيرة - حاول مرة أخرى لاحقاً",
            headers={"Retry-After": str(limiter.window_seconds)},
        )


# Login: count only failed attempts per (ip, username); cap guess rate.
login_user_limiter = RateLimiter(max_hits=10, window_seconds=300)
# Login: cap attempts per IP regardless of username (anti username-spray).
login_ip_limiter = RateLimiter(max_hits=60, window_seconds=300)
# Refresh endpoint: per IP.
refresh_limiter = RateLimiter(max_hits=30, window_seconds=60)
# Integration inbound endpoints: per IP.
integration_limiter = RateLimiter(max_hits=60, window_seconds=60)