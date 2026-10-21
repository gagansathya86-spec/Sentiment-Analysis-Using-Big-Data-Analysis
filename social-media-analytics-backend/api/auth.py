from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from services import auth_service

router = APIRouter(prefix="/api/auth", tags=["authentication"])
bearer_scheme = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=1024)


def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.", headers={"WWW-Authenticate": "Bearer"})
    user = auth_service.validate_token(credentials.credentials)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid. Please sign in again.", headers={"WWW-Authenticate": "Bearer"})
    return user


@router.post("/login")
def login(request: LoginRequest):
    user = auth_service.authenticate(request.username, request.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.", headers={"WWW-Authenticate": "Bearer"})
    return auth_service.issue_token(user)


@router.get("/me")
def me(user=Depends(get_current_user)):
    return user


@router.post("/logout")
def logout(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme), user=Depends(get_current_user)):
    auth_service.revoke_token(credentials.credentials)
    return {"message": "Signed out successfully."}
