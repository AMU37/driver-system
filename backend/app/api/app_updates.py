"""تحديثات تطبيق الجوال (OTA) — حزم الويب التي يحمّلها التطبيق تلقائياً.

الآلية: إضافة CapacitorUpdater في التطبيق ترسل طلب POST إلى
``/api/app/updates`` عند كل إقلاع/عودة للتطبيق، فترد هذه الوحدة ببيان
النسخة الأحدث إن وُجدت. الملفات نفسها تُخدَّم من ``/api/app/bundle/{name}``.

مجلد الحزم ``backend/updates`` يُنشأ بأمر ``npm run bundle`` داخل frontend،
ويحتوي ``latest.json`` + ملف zip لكل نسخة.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import FileResponse

from app.core.config import settings

router = APIRouter(prefix="/api/app", tags=["app-updates"])

UPDATES_DIR = Path(__file__).resolve().parents[2] / "updates"
MANIFEST_NAME = "latest.json"
_SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


def _load_manifest() -> dict[str, Any] | None:
    path = UPDATES_DIR / MANIFEST_NAME
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not data.get("version") or not data.get("file"):
        return None
    return data


def _version_key(value: str) -> tuple[int, ...]:
    """مفتاح مقارنة بسيط لأرقام النسخ: "1.0.12" ⇒ (1, 0, 12)."""
    parts = re.findall(r"\d+", str(value or ""))
    return tuple(int(p) for p in parts[:4]) or (0,)


def _client_version(info: dict[str, Any]) -> str:
    """نسخة العميل الفعلية: نسخة الحزمة إن وُجدت، وإلا نسخة التطبيق المدمجة."""
    for key in ("version_name", "version_build"):
        value = str(info.get(key) or "").strip()
        if value and value.lower() != "builtin":
            return value
    return ""


_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}


def _public_base(request: Request) -> str:
    """عنوان الخادم كما يراه التطبيق — https دائماً في الإنتاج.

    إضافة التحديث ترفض الروابط غير المشفّرة (httpsOnly)، لذا نحوّل http إلى
    https، باستثناء الخوادم المحلية أثناء الاختبار.
    """
    base = (settings.public_base_url or "").strip().rstrip("/")
    if not base:
        base = str(request.base_url).rstrip("/")
    if base.startswith("http://"):
        host = request.url.hostname or ""
        if host not in _LOOPBACK_HOSTS and not (settings.public_base_url or "").strip():
            base = "https://" + base[len("http://") :]
    return base


@router.post("/updates")
def check_update(request: Request, info: dict[str, Any] = Body(default_factory=dict)):
    """يستجيب لطلب فحص التحديث من التطبيق.

    يُرجع بيانات الحزمة فقط إن كانت أحدث من نسخة الجهاز؛ وإلا يُرجع رسالة
    بلا ``version`` حتى لا يحمّل التطبيق شيئاً.
    """
    manifest = _load_manifest()
    if not manifest:
        return {"message": "لا توجد حزم تحديث منشورة"}

    latest = str(manifest["version"])
    current = _client_version(info)
    if current and _version_key(latest) <= _version_key(current):
        return {"message": "أحدث نسخة مثبتة"}

    filename = str(manifest["file"])
    if not _SAFE_NAME.match(filename):
        return {"message": "بيان تحديث غير صالح"}

    return {
        "version": latest,
        "url": f"{_public_base(request)}/api/app/bundle/{filename}",
        "checksum": str(manifest.get("checksum") or ""),
        "size": manifest.get("size"),
        "message": manifest.get("notes") or "",
    }


@router.get("/bundle/{filename}")
def get_bundle(filename: str):
    """يخدّم ملف الحزمة (zip) لتطبيق الجوال."""
    if not _SAFE_NAME.match(filename) or not filename.lower().endswith(".zip"):
        raise HTTPException(404, "غير موجود")
    path = UPDATES_DIR / filename
    if not path.is_file():
        raise HTTPException(404, "غير موجود")
    return FileResponse(
        path,
        media_type="application/zip",
        filename=filename,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/latest")
def latest_bundle():
    """بيان آخر حزمة منشورة — للفحص الإداري/التشخيص."""
    manifest = _load_manifest()
    if not manifest:
        raise HTTPException(404, "لا توجد حزم تحديث منشورة")
    return manifest
