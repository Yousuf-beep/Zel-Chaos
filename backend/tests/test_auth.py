from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_signup_me_logout_login():
    r = client.post("/api/auth/signup", json={"name": "Asha", "handle": "+91 98765 43210", "password": "secret1"})
    assert r.status_code == 200 and r.json()["user"]["handle"] == "9876543210"
    assert client.get("/api/auth/me").json()["user"]["name"] == "Asha"

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json()["user"] is None

    assert client.post("/api/auth/login", json={"handle": "9876543210", "password": "nope"}).status_code == 401
    r = client.post("/api/auth/login", json={"handle": "098765 43210", "password": "secret1"})
    assert r.status_code == 200 and client.get("/api/auth/me").json()["user"]["name"] == "Asha"


def test_duplicate_and_validation():
    client.post("/api/auth/signup", json={"name": "Meera", "handle": "Meera@Example.com", "password": "secret1"})
    assert client.post("/api/auth/signup", json={"name": "M", "handle": "meera@example.com", "password": "secret1"}).status_code == 409
    assert client.post("/api/auth/signup", json={"name": "M", "handle": "not-a-handle", "password": "secret1"}).status_code == 422
    assert client.post("/api/auth/signup", json={"name": "M", "handle": "x@y.in", "password": "123"}).status_code == 422
