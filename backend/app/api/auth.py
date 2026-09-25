from fastapi import APIRouter, Depends, HTTPException, Request
from jwt import PyJWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.ratelimit import enforce, login_ip_limiter, login_user_limiter, refresh_limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import User
from app.schemas import ChangePasswordRequest, LoginRequest, RefreshRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    if request.client:
        return request.client.host
    return "unknown"


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    enforce(login_ip_limiter, f"login-ip:{ip}")
    user_key = f"login-user:{ip}:{payload.username}"
    enforce(login_user_limiter, user_key)
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        login_user_limiter.record(user_key)
        login_ip_limiter.record(f"login-ip:{ip}")
        raise HTTPException(401, "بيانات الدخول غير صحيحة")
    login_user_limiter.reset(user_key)
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    enforce(refresh_limiter, f"refresh-ip:{_client_ip(request)}")
    try:
        token = decode_token(payload.refresh_token)
        if token.get("type") != "refresh" or not token.get("sub"):
            raise HTTPException(401, "رمز التحديث غير صالح")
    except PyJWTError:
        raise HTTPException(401, "رمز التحديث غير صالح")
    user = db.scalar(select(User).where(User.id == token["sub"], User.is_active.is_(True)))
    if not user:
        raise HTTPException(401, "المستخدم غير موجود")
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user,
    )


@router.post("/change-password", response_model=UserOut)
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "كلمة المرور الحالية غير صحيحة")
    if payload.new_password == payload.current_password:
        raise HTTPException(400, "كلمة المرور الجديدة مطابقة للحالية")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user