import demo
from test_demo import demo_login


def test_demo_email_cannot_be_registered(client):
    resp = client.post("/api/auth/register", json={"email": demo.DEMO_EMAIL, "password": "password123", "full_name": "X"})
    assert resp.status_code == 400


def test_demo_account_cannot_mint_agent_keys(client):
    headers = demo_login(client)
    assert client.post("/api/auth/agent-key", headers=headers, json={}).status_code == 403
    resp = client.post("/api/auth/agent-key/from-login",
                       json={"email": demo.DEMO_EMAIL, "password": demo.DEMO_PASSWORD})
    assert resp.status_code == 403


def test_disabled_demo_rejects_login(client, monkeypatch):
    demo_login(client)  # account exists
    monkeypatch.setenv("DEMO_ACCOUNT_ENABLED", "false")
    resp = client.post("/api/auth/login", data={"username": demo.DEMO_EMAIL, "password": demo.DEMO_PASSWORD})
    assert resp.status_code == 401


def test_disabled_demo_cannot_get_agent_key(client, monkeypatch):
    demo_login(client)
    monkeypatch.setenv("DEMO_ACCOUNT_ENABLED", "false")
    resp = client.post("/api/auth/agent-key/from-login",
                       json={"email": demo.DEMO_EMAIL, "password": demo.DEMO_PASSWORD})
    assert resp.status_code == 403
