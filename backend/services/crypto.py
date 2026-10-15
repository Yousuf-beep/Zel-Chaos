"""Field-level encryption for health data at rest: chat text, conversation titles, reports and the onboarding profile.
AES-256-GCM with a random 96-bit nonce per value; stored as "enc1:" + urlsafe base64(nonce + ciphertext + tag).
Values without the prefix are legacy plaintext and are returned as-is, so old rows stay readable.
Without DATA_ENCRYPTION_KEY (tests, offline SQLite development) values are stored as plaintext."""
import base64
import json
import logging
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import config

log = logging.getLogger("sakhi.crypto")
PREFIX = "enc1:"


class CryptoError(RuntimeError):
    pass


def _load_key(raw: str) -> AESGCM | None:
    if not raw:
        return None
    try:
        key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    except ValueError as e:
        raise CryptoError("DATA_ENCRYPTION_KEY is not valid base64.") from e
    if len(key) != 32:
        raise CryptoError("DATA_ENCRYPTION_KEY must decode to 32 bytes.")
    return AESGCM(key)


_aes = _load_key(config.DATA_ENCRYPTION_KEY)


def enabled() -> bool:
    return _aes is not None


def require_key_for_postgres(is_postgres: bool) -> None:
    """Refuse to store real users' health data in plaintext."""
    if is_postgres and not enabled():
        raise CryptoError("DATA_ENCRYPTION_KEY is required when DATABASE_URL is set. Generate one with: "
                          "python -c \"import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())\"")
    if not enabled():
        log.warning("crypto: DATA_ENCRYPTION_KEY not set; chat data is stored unencrypted (local development only)")


def seal(plain: str) -> str:
    if _aes is None or not plain:
        return plain
    nonce = os.urandom(12)
    return PREFIX + base64.urlsafe_b64encode(nonce + _aes.encrypt(nonce, plain.encode(), None)).decode()


def unseal(stored: str | None) -> str:
    if not stored or not stored.startswith(PREFIX):
        return stored or ""
    if _aes is None:
        raise CryptoError("Encrypted data found but DATA_ENCRYPTION_KEY is not set.")
    blob = base64.urlsafe_b64decode(stored[len(PREFIX):])
    return _aes.decrypt(blob[:12], blob[12:], None).decode()


def seal_json(value: Any) -> str:
    return seal(json.dumps(value, ensure_ascii=False, default=str))


def unseal_json(stored: str | None, default: Any = None) -> Any:
    text = unseal(stored)
    return json.loads(text) if text else default
