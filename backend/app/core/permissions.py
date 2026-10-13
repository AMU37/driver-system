"""صلاحيات المستخدمين العامة (عرض/إضافة/تعديل/حذف).

تُعيَّن من قِبل مدير النظام فقط، وتُطبَّق على واجهات الإدارة. الأدوار الحالية
توفّر قيمًا افتراضية عند عدم وجود صلاحيات مخصّصة محفوظة للمستخدم.
"""

from __future__ import annotations

import json

from app.models import UserRole

ACTIONS: tuple[str, ...] = ("view", "add", "edit", "delete")

ACTION_LABELS: dict[str, str] = {
    "view": "عرض",
    "add": "إضافة",
    "edit": "تعديل",
    "delete": "حذف",
}

ROLE_DEFAULTS: dict[str, dict[str, bool]] = {
    UserRole.admin.value: {"view": True, "add": True, "edit": True, "delete": True},
    UserRole.supervisor.value: {"view": True, "add": True, "edit": True, "delete": True},
    UserRole.viewer.value: {"view": True, "add": False, "edit": False, "delete": False},
    UserRole.driver.value: {"view": False, "add": False, "edit": False, "delete": False},
}


def role_value(role: object) -> str:
    return role.value if isinstance(role, UserRole) else str(role)


def _coerce(raw: object) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except (ValueError, TypeError):
            return {}
    return {}


def effective_permissions(user: object) -> dict[str, bool]:
    """الصلاحيات الفعلية: المدير دائمًا كامل؛ وإلا المخصّصة ثم الافتراضية حسب الدور."""
    rv = role_value(getattr(user, "role", None))
    if rv == UserRole.admin.value:
        return {action: True for action in ACTIONS}
    base = dict(ROLE_DEFAULTS.get(rv, {action: False for action in ACTIONS}))
    stored = _coerce(getattr(user, "permissions", None))
    for action in ACTIONS:
        if action in stored:
            base[action] = bool(stored[action])
    return base


def sanitize_permissions(raw: object, *, keep_missing: dict[str, bool] | None = None) -> dict[str, bool]:
    """يبني قاموس صلاحيات نظيفًا بقيم منطقية للأزرار الأربعة فقط."""
    incoming = _coerce(raw)
    base = dict(keep_missing or {action: False for action in ACTIONS})
    for action in ACTIONS:
        if action in incoming:
            base[action] = bool(incoming[action])
    return base


def has_permission(user: object, action: str) -> bool:
    return bool(effective_permissions(user).get(action))
