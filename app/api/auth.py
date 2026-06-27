import os
import re
import hashlib
import hmac
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
import asyncpg
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.database import DATABASE_URL

router = APIRouter()

# ── Config (read from env; dotenv already loaded by app.database) ──
JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# Sentinel stored in password_hash for OAuth-only accounts (never matches a password)
OAUTH_SENTINEL = "oauth$google"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

bearer_scheme = HTTPBearer(auto_error=True)


# ── Password hashing (stdlib PBKDF2-HMAC-SHA256) ──────────────────
PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if not stored or not stored.startswith("pbkdf2_sha256$"):
        return False
    try:
        _, iter_s, salt_hex, hash_hex = stored.split("$")
        iterations = int(iter_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError):
        return False


def validate_password(password: str) -> Optional[str]:
    """Return an error message if the password is too weak, else None."""
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


# ── JWT helpers ───────────────────────────────────────────────────
def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    payload = decode_access_token(creds.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        row = await conn.fetchrow(
            "SELECT id, email, role FROM users WHERE id = $1", user_id
        )
        if not row:
            raise HTTPException(status_code=401, detail="User no longer exists")
        return {"id": str(row["id"]), "email": row["email"], "role": row["role"]}
    finally:
        await conn.close()


# ── Request / response models ─────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleRequest(BaseModel):
    credential: str


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


# ── Shared helper: build the auth response for a user ─────────────
async def _build_auth_response(conn: asyncpg.Connection, user_row) -> AuthResponse:
    patient_row = await conn.fetchrow(
        "SELECT id, name FROM patients WHERE user_id = $1", user_row["id"]
    )
    patient = (
        PatientOut(id=patient_row["id"], name=patient_row["name"])
        if patient_row
        else None
    )
    token = create_access_token(str(user_row["id"]), user_row["role"])
    return AuthResponse(
        access_token=token,
        user=UserOut(id=str(user_row["id"]), email=user_row["email"], role=user_row["role"]),
        patient=patient,
    )


# ── Endpoints ─────────────────────────────────────────────────────
@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    name = req.name.strip()
    email = req.email.strip().lower()

    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Name must be at least 2 characters long.")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")
    pw_error = validate_password(req.password)
    if pw_error:
        raise HTTPException(status_code=422, detail=pw_error)

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")

        password_hash = hash_password(req.password)
        async with conn.transaction():
            user_row = await conn.fetchrow(
                """
                INSERT INTO users (email, password_hash, role)
                VALUES ($1, $2, 'Patient')
                RETURNING id, email, role
                """,
                email,
                password_hash,
            )
            await conn.execute(
                "INSERT INTO patients (user_id, name) VALUES ($1, $2)",
                user_row["id"],
                name,
            )
        return await _build_auth_response(conn, user_row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration error: {str(e)}")
    finally:
        await conn.close()


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    email = req.email.strip().lower()
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        user_row = await conn.fetchrow(
            "SELECT id, email, role, password_hash FROM users WHERE email = $1", email
        )
        if not user_row or not verify_password(req.password, user_row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        return await _build_auth_response(conn, user_row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login error: {str(e)}")
    finally:
        await conn.close()


@router.post("/google", response_model=AuthResponse)
async def google_login(req: GoogleRequest):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google Sign-In is not configured. Set GOOGLE_CLIENT_ID on the server.",
        )

    # Verify the Google ID token (google-auth is already installed)
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        idinfo = google_id_token.verify_oauth2_token(
            req.credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google credential.")

    email = (idinfo.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google account has no email.")
    name = idinfo.get("name") or email.split("@")[0]

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        user_row = await conn.fetchrow(
            "SELECT id, email, role FROM users WHERE email = $1", email
        )
        if not user_row:
            async with conn.transaction():
                user_row = await conn.fetchrow(
                    """
                    INSERT INTO users (email, password_hash, role)
                    VALUES ($1, $2, 'Patient')
                    RETURNING id, email, role
                    """,
                    email,
                    OAUTH_SENTINEL,
                )
                await conn.execute(
                    "INSERT INTO patients (user_id, name) VALUES ($1, $2)",
                    user_row["id"],
                    name,
                )
        return await _build_auth_response(conn, user_row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google login error: {str(e)}")
    finally:
        await conn.close()


@router.get("/me", response_model=AuthResponse)
async def me(current_user: dict = Depends(get_current_user)):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        user_row = await conn.fetchrow(
            "SELECT id, email, role FROM users WHERE id = $1", current_user["id"]
        )
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        return await _build_auth_response(conn, user_row)
    finally:
        await conn.close()
