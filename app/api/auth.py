import os
import re
import hashlib
import hmac
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.database import get_conn

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
bearer_scheme = HTTPBearer(auto_error=True)

PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if not stored or not stored.startswith("pbkdf2_sha256$"):
        return False
    try:
        _, iter_s, salt_hex, hash_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iter_s))
        return hmac.compare_digest(dk, bytes.fromhex(hash_hex))
    except (ValueError, TypeError):
        return False


def validate_password(password: str) -> Optional[str]:
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return "Password must contain at least one number."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain at least one special character."
    return None


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "role": role, "iat": now, "exp": now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)},
        JWT_SECRET, algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid authentication token")


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    payload = decode_access_token(creds.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid authentication token")
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT id, email, role FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(401, "User no longer exists")
    return {"id": str(row["id"]), "email": row["email"], "role": row["role"]}


class CurrentPatient(BaseModel):
    id: int
    user_id: str
    name: str
    email: str


# token theke patient ber kori, client er patient_id ar trust kori na
async def get_current_patient(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> CurrentPatient:
    payload = decode_access_token(creds.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid authentication token")
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.id, p.name, u.email, u.id AS user_id
            FROM users u LEFT JOIN patients p ON p.user_id = u.id
            WHERE u.id = $1
            """,
            user_id,
        )
    if not row:
        raise HTTPException(401, "User no longer exists")
    if row["id"] is None:
        raise HTTPException(403, "This account is not a patient account")
    return CurrentPatient(id=row["id"], user_id=str(row["user_id"]), name=row["name"], email=row["email"])


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    role: str


class PatientOut(BaseModel):
    id: int
    name: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    patient: Optional[PatientOut] = None


async def _build_auth_response(conn, user_row) -> AuthResponse:
    patient_row = await conn.fetchrow("SELECT id, name FROM patients WHERE user_id = $1", user_row["id"])
    return AuthResponse(
        access_token=create_access_token(str(user_row["id"]), user_row["role"]),
        user=UserOut(id=str(user_row["id"]), email=user_row["email"], role=user_row["role"]),
        patient=PatientOut(id=patient_row["id"], name=patient_row["name"]) if patient_row else None,
    )


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    name = req.name.strip()
    email = req.email.strip().lower()

    if len(name) < 2:
        raise HTTPException(422, "Name must be at least 2 characters long.")
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Please enter a valid email address.")
    if err := validate_password(req.password):
        raise HTTPException(422, err)

    async with get_conn() as conn:
        if await conn.fetchrow("SELECT 1 FROM users WHERE email = $1", email):
            raise HTTPException(409, "An account with this email already exists.")
        async with conn.transaction():
            user_row = await conn.fetchrow(
                "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'Patient') RETURNING id, email, role",
                email, hash_password(req.password),
            )
            await conn.execute("INSERT INTO patients (user_id, name) VALUES ($1, $2)", user_row["id"], name)
        return await _build_auth_response(conn, user_row)


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    email = req.email.strip().lower()
    async with get_conn() as conn:
        user_row = await conn.fetchrow(
            "SELECT id, email, role, password_hash FROM users WHERE email = $1", email
        )
        if not user_row or not verify_password(req.password, user_row["password_hash"]):
            raise HTTPException(401, "Invalid email or password.")
        return await _build_auth_response(conn, user_row)


@router.get("/me", response_model=AuthResponse)
async def me(current_user: dict = Depends(get_current_user)):
    async with get_conn() as conn:
        user_row = await conn.fetchrow("SELECT id, email, role FROM users WHERE id = $1", current_user["id"])
        if not user_row:
            raise HTTPException(404, "User not found")
        return await _build_auth_response(conn, user_row)
