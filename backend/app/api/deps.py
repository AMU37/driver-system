from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models import User, UserRole

bearer = HTTPBearer(auto_error=False)

# Endpoints a user may still reach while a password change is forced.
ALLOWED_UNLESS_CHANGED = {"/api/auth/change-password", "/api/auth/me"}


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="يلزم تسجيل الدخول")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access" or not payload.get("sub"):
            raise HTTPException(status_code=401, detail="رمز الدخول غير صالح")
    except PyJWTError:
        raise HTTPException(status_code=401, detail="رمز الدخول غير صالح")
    user = db.scalar(select(User).where(User.id == payload["sub"], User.is_active.is_(True)))
    if not user:
        raise HTTPException(status_code=401, detail="المستخدم غير موجود أو غير نشط")
    if user.must_change_password and request.url.path not in ALLOWED_UNLESS_CHANGED:
        raise HTTPException(
            status_code=403,
            detail="يجب تغيير كلمة المرور قبل المتابعة",
            headers={"X-Must-Change-Password": "true"},
        )
    return user


def require_roles(*roles: UserRole):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية لتنفيذ هذه العملية")
        return user
    return checker
