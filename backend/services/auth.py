import asyncio
import hashlib
import hmac
import re
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import config
from services.db import Database, db as default_db

# Accounts hold only a display name, an email and a password hash (nola.users). Health data lives elsewhere.
# New accounts are email-only; logins still accept the 10-digit phone handles of accounts made before that.
# Sessions are an httpOnly cookie holding a random token; only its SHA-256 is stored. They slide: any visit in the
# second half of the lifetime renews it, so a regular user stays signed in and an abandoned session expires.

_EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$")
MIN_PASSWORD = 8


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


def normalise_email(raw: str) -> str:
    s = raw.strip().lower()
    if len(s) > 120 or not _EMAIL.match(s):
        raise AuthError(422, "Enter a valid email address.")
    return s


def normalise_handle(raw: str) -> str:
    """Email (lower-cased) or, for older accounts, an Indian mobile number (last 10 digits)."""
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


class LoginThrottle:
    """Failed logins per email and per IP in a sliding window (in process; enough for one backend instance)."""

    def __init__(self, limit: int = config.LOGIN_MAX_FAILURES, window_s: int = config.LOGIN_WINDOW_MIN * 60):
        self.limit, self.window = limit, window_s
        self._fails: dict[str, deque] = defaultdict(deque)

    def _recent(self, key: str) -> deque:
        q, cutoff = self._fails[key], time.monotonic() - self.window
        while q and q[0] < cutoff:
            q.popleft()
        return q

    def check(self, *keys: str) -> None:
        if any(len(self._recent(k)) >= self.limit for k in keys if k):
            raise AuthError(429, "Too many attempts. Please wait a few minutes and try again.")

    def fail(self, *keys: str) -> None:
        for k in keys:
            if k:
                self._recent(k).append(time.monotonic())

    def clear(self, key: str) -> None:
        self._fails.pop(key, None)


class AuthStore:
    def __init__(self, database: Database | None = None, ttl_days: int = config.AUTH_TTL_DAYS):
        self.db = database or default_db
        self.ttl = timedelta(days=ttl_days)
        self.throttle = LoginThrottle()

    async def signup(self, name: str, handle: str, password: str) -> tuple[User, str]:
        name = name.strip()
        if not name or len(name) > 60:
            raise AuthError(422, "Tell us what to call you.")
        handle = normalise_email(handle)
        if len(password) < MIN_PASSWORD:
            raise AuthError(422, f"Use at least {MIN_PASSWORD} characters for your password.")
        salt = secrets.token_bytes(16)
        user = User(id=secrets.token_hex(12), name=name, handle=handle)
        inserted = await self.db.execute(
            "INSERT INTO nola.users (id, name, handle, pw_hash, salt) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (handle) DO NOTHING",
            user.id, name, handle, await asyncio.to_thread(_hash, password, salt), salt)
        if not inserted:
            raise AuthError(409, "An account with this email already exists. Log in instead.")
        return user, await self._issue(user.id)

    async def login(self, handle: str, password: str, ip: str = "") -> tuple[User, str]:
        wrong = AuthError(401, "That email and password don't match.")
        try:
            handle = normalise_handle(handle)
        except AuthError:
            raise wrong
        keys = (f"h:{handle}", f"ip:{ip}" if ip else "")
        self.throttle.check(*keys)
        row = await self.db.fetchone("SELECT id, name, handle, pw_hash, salt FROM nola.users WHERE handle = %s", handle)
        # scrypt is deliberately slow; run it off the event loop.
        if not row or not hmac.compare_digest(bytes(row[3]), await asyncio.to_thread(_hash, password, bytes(row[4]))):
            self.throttle.fail(*keys)
            raise wrong
        self.throttle.clear(keys[0])
        return User(row[0], row[1], row[2]), await self._issue(row[0])

    async def _issue(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        await self.db.execute("DELETE FROM nola.auth_tokens WHERE expires_at < %s", now)
        await self.db.execute("INSERT INTO nola.auth_tokens (token_hash, user_id, expires_at) VALUES (%s, %s, %s)",
                              _token_hash(token), user_id, now + self.ttl)
        return token

    async def user_for(self, token: Optional[str]) -> Optional[User]:
        if not token:
            return None
        row = await self.db.fetchone(
            "SELECT u.id, u.name, u.handle FROM nola.auth_tokens t JOIN nola.users u ON u.id = t.user_id "
            "WHERE t.token_hash = %s AND t.expires_at > %s",
            _token_hash(token), datetime.now(timezone.utc))
        return User(*row) if row else None

    async def renew(self, token: Optional[str]) -> bool:
        """Slides the session forward once it is past half its lifetime. True when the cookie should be re-sent."""
        if not token:
            return False
        now = datetime.now(timezone.utc)
        return bool(await self.db.execute(
            "UPDATE nola.auth_tokens SET expires_at = %s WHERE token_hash = %s AND expires_at > %s AND expires_at < %s",
            now + self.ttl, _token_hash(token), now, now + self.ttl / 2))

    async def logout(self, token: Optional[str]) -> None:
        if token:
            await self.db.execute("DELETE FROM nola.auth_tokens WHERE token_hash = %s", _token_hash(token))


auth = AuthStore()
