import asyncio
import secrets
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from main import app
from services.auth import AuthStore, _hash, _token_hash, auth

client = TestClient(app)


def test_signup_me_logout_login():
    r = client.post("/api/auth/signup", json={"name": "Asha", "handle": " Asha@Example.com ", "password": "secret12"})
    assert r.status_code == 200
    u = r.json()["user"]
    assert u["handle"] == "asha@example.com" and u["onboarded"] is False
    assert client.get("/api/auth/me").json()["user"]["name"] == "Asha"

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json()["user"] is None

    assert client.post("/api/auth/login", json={"handle": "asha@example.com", "password": "nope"}).status_code == 401
    r = client.post("/api/auth/login", json={"handle": "ASHA@example.com", "password": "secret12"})
    assert r.status_code == 200 and client.get("/api/auth/me").json()["user"]["name"] == "Asha"


def test_signup_is_email_only_with_strong_enough_password():
    client.post("/api/auth/signup", json={"name": "Meera", "handle": "Meera@Example.com", "password": "secret12"})
    assert client.post("/api/auth/signup", json={"name": "M", "handle": "meera@example.com", "password": "secret12"}).status_code == 409
    for handle in ("+91 98765 43210", "not-an-email", "a@b", "x y@z.in"):
        assert client.post("/api/auth/signup", json={"name": "M", "handle": handle, "password": "secret12"}).status_code == 422
    assert client.post("/api/auth/signup", json={"name": "M", "handle": "x@y.in", "password": "1234567"}).status_code == 422


def test_older_phone_accounts_can_still_log_in():
    store = AuthStore()
    salt = secrets.token_bytes(16)
    asyncio.run(store.db.execute("INSERT INTO nola.users (id, name, handle, pw_hash, salt) VALUES (%s, %s, %s, %s, %s)",
                                 "legacy1", "Old", "9876543210", _hash("secret1", salt), salt))
    r = client.post("/api/auth/login", json={"handle": "+91 98765 43210", "password": "secret1"})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Old"


def test_repeated_wrong_passwords_are_throttled():
    auth.throttle._fails.clear()  # other tests share the test client's IP
    client.post("/api/auth/signup", json={"name": "Tara", "handle": "tara@example.com", "password": "secret12"})
    codes = [client.post("/api/auth/login", json={"handle": "tara@example.com", "password": "wrong"}).status_code for _ in range(9)]
    assert codes[:8] == [401] * 8 and codes[8] == 429
    # Even the right password waits until the window passes.
    assert client.post("/api/auth/login", json={"handle": "tara@example.com", "password": "secret12"}).status_code == 429


def test_session_slides_forward_when_past_half_its_life():
    store = AuthStore()
    user, token = asyncio.run(store.signup("Riya", "riya@example.com", "secret12"))
    assert asyncio.run(store.renew(token)) is False  # fresh token: nothing to do
    soon = datetime.now(timezone.utc) + timedelta(days=2)
    asyncio.run(store.db.execute("UPDATE nola.auth_tokens SET expires_at = %s WHERE token_hash = %s", soon, _token_hash(token)))
    assert asyncio.run(store.renew(token)) is True
    assert asyncio.run(store.user_for(token)).id == user.id


def test_sessions_from_before_the_rename_carry_over():
    _, token = asyncio.run(AuthStore().signup("Lata", "lata@example.com", "secret12"))
    c = TestClient(app)
    c.cookies.set("sakhi_auth", token)
    r = c.get("/api/auth/me")
    assert r.json()["user"]["name"] == "Lata"
    assert r.cookies.get("nola_auth") == token  # moved to the new cookie name
