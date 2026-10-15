import asyncio
import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import config
from services.db import Database, db as default_db

# Accounts hold only a display name, a login handle and a password hash (sakhi.users). Health data lives elsewhere.

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@dataclass
class User:
    id: str
    name: str
    handle: str

    def public(self) -> dict:
        return {"id": self.id, "name": self.name, "handle": self.handle}


def normalise_handle(raw: str) -> str:
    """Email (lower-cased) or Indian mobile number (last 10 digits)."""
    s = raw.strip()
    if _EMAIL.match(s):
        return s.lower()
    digits = re.sub(r"\D", "", s)
    if len(digits) >= 10 and len(digits) <= 13:
        return digits[-10:]
    raise AuthError(422, "Enter a valid email or 10-digit phone number.")


def _hash(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AuthStore:
    def __init__(self, database: Database | None = None, ttl_days: int = config.AUTH_TTL_DAYS):
        self.db = database or default_db
        self.ttl = timedelta(days=ttl_days)

    async def signup(self, name: str, handle: str, password: str) -> tuple[User, str]:
        name = name.strip()
        if not name or len(name) > 60:
            raise AuthError(422, "Tell us what to call you.")
        if len(password) < 6:
            raise AuthError(422, "Use at least 6 characters for your password.")
        handle = normalise_handle(handle)
        salt = secrets.token_bytes(16)
        user = User(id=secrets.token_hex(12), name=name, handle=handle)
        inserted = await self.db.execute(
            "INSERT INTO sakhi.users (id, name, handle, pw_hash, salt) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (handle) DO NOTHING",
            user.id, name, handle, await asyncio.to_thread(_hash, password, salt), salt)
        if not inserted:
            raise AuthError(409, "An account with this email or phone already exists. Log in instead.")
        return user, await self._issue(user.id)

    async def login(self, handle: str, password: str) -> tuple[User, str]:
        try:
            handle = normalise_handle(handle)
        except AuthError:
            raise AuthError(401, "That email/phone and password don't match.")
        row = await self.db.fetchone("SELECT id, name, handle, pw_hash, salt FROM sakhi.users WHERE handle = %s", handle)
        # scrypt is deliberately slow; run it off the event loop.
        if not row or not hmac.compare_digest(bytes(row[3]), await asyncio.to_thread(_hash, password, bytes(row[4]))):
            raise AuthError(401, "That email/phone and password don't match.")
        return User(row[0], row[1], row[2]), await self._issue(row[0])

    async def _issue(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        await self.db.execute("DELETE FROM sakhi.auth_tokens WHERE expires_at < %s", now)
        await self.db.execute("INSERT INTO sakhi.auth_tokens (token_hash, user_id, expires_at) VALUES (%s, %s, %s)",
                              _token_hash(token), user_id, now + self.ttl)
        return token

    async def user_for(self, token: Optional[str]) -> Optional[User]:
        if not token:
            return None
        row = await self.db.fetchone(
            "SELECT u.id, u.name, u.handle FROM sakhi.auth_tokens t JOIN sakhi.users u ON u.id = t.user_id "
            "WHERE t.token_hash = %s AND t.expires_at > %s",
            _token_hash(token), datetime.now(timezone.utc))
        return User(*row) if row else None

    async def logout(self, token: Optional[str]) -> None:
        if token:
            await self.db.execute("DELETE FROM sakhi.auth_tokens WHERE token_hash = %s", _token_hash(token))


auth = AuthStore()
