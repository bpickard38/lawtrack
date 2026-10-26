from conftest import register, login


def test_register_login_and_me(client):
    reg = register(client, "bob@example.com", firm_name="Bob LLP", full_name="Bob")
    assert reg["agent_api_key"].startswith("lt_")
    headers = login(client, "bob@example.com")
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "bob@example.com"


def test_duplicate_registration_rejected(client):
    register(client, "bob@example.com")
    resp = client.post("/api/auth/register", json={"email": "bob@example.com", "password": "password123", "full_name": "B"})
    assert resp.status_code == 400


def test_wrong_password_rejected(client):
    register(client, "bob@example.com")
    resp = client.post("/api/auth/login", data={"username": "bob@example.com", "password": "nope"})
    assert resp.status_code == 401


def test_protected_routes_require_token(client):
    assert client.get("/api/cases").status_code == 401
    assert client.get("/api/activities", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_change_password(client, attorney):
    headers, _ = attorney
    resp = client.post("/api/auth/change-password", headers=headers,
                       json={"current_password": "password123", "new_password": "newpass456"})
    assert resp.status_code == 200
    login(client, "alice@firm-a.com", password="newpass456")
