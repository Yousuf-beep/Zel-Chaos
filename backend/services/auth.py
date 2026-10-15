import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import config

# Accounts hold only a display name, a login handle and a password hash. Conversations are never stored here.
_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  pw_hash BLOB NOT NULL,
  salt BLOB NOT NULL,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at REAL NOT NULL
);
"""

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
    def __init__(self, path: Path | str = config.AUTH_DB_PATH, ttl_days: int = config.AUTH_TTL_DAYS):
        self.ttl = ttl_days * 86400
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.execute("PRAGMA foreign_keys = ON")
        self._db.executescript(_SCHEMA)
        self._lock = threading.Lock()

    def signup(self, name: str, handle: str, password: str) -> tuple[User, str]:
        name = name.strip()
        if not name or len(name) > 60:
            raise AuthError(422, "Tell us what to call you.")
        if len(password) < 6:
            raise AuthError(422, "Use at least 6 characters for your password.")
        handle = normalise_handle(handle)
        salt = secrets.token_bytes(16)
        user = User(id=secrets.token_hex(12), name=name, handle=handle)
        with self._lock:
            try:
                self._db.execute(
                    "INSERT INTO users (id, name, handle, pw_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (user.id, name, handle, _hash(password, salt), salt, time.time()),
                )
                self._db.commit()
            except sqlite3.IntegrityError:
                raise AuthError(409, "An account with this email or phone already exists. Log in instead.")
        return user, self._issue(user.id)

    def login(self, handle: str, password: str) -> tuple[User, str]:
        try:
            handle = normalise_handle(handle)
        except AuthError:
            raise AuthError(401, "That email/phone and password don't match.")
        with self._lock:
            row = self._db.execute("SELECT id, name, handle, pw_hash, salt FROM users WHERE handle = ?", (handle,)).fetchone()
        if not row or not hmac.compare_digest(row[3], _hash(password, row[4])):
            raise AuthError(401, "That email/phone and password don't match.")
        return User(row[0], row[1], row[2]), self._issue(row[0])

    def _issue(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._db.execute("DELETE FROM tokens WHERE expires_at < ?", (time.time(),))
            self._db.execute("INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                             (_token_hash(token), user_id, time.time() + self.ttl))
            self._db.commit()
        return token

    def user_for(self, token: Optional[str]) -> Optional[User]:
        if not token:
            return None
        with self._lock:
            row = self._db.execute(
                "SELECT u.id, u.name, u.handle FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.expires_at > ?",
                (_token_hash(token), time.time()),
            ).fetchone()
        return User(*row) if row else None

    def logout(self, token: Optional[str]) -> None:
        if not token:
            return
        with self._lock:
            self._db.execute("DELETE FROM tokens WHERE token_hash = ?", (_token_hash(token),))
            self._db.commit()


auth = AuthStore()
