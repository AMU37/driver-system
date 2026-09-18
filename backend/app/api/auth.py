from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from jwt import PyJWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, decode_token, verify_password
from app.models import User
from app.schemas import LoginRequest, RefreshRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "بيانات الدخول غير صحيحة")
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
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


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
