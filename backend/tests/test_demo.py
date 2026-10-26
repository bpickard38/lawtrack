from datetime import datetime, timedelta

import demo
from database import SessionLocal
from models import Firm, User


def demo_login(client):
    resp = client.post("/api/auth/login", data={"username": demo.DEMO_EMAIL, "password": demo.DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_demo_login_creates_populated_account(client):
    headers = demo_login(client)
    assert len(client.get("/api/cases", headers=headers).json()) == len(demo.CASES)
    assert len(client.get("/api/case-rules", headers=headers).json()) == len(demo.RULES)
    activities = client.get("/api/activities", headers=headers).json()
    assert len(activities) > 30
    assert any(a["confidence"] == "high" for a in activities)
    assert {a["status"] for a in activities} >= {"approved", "invoiced"}


def test_demo_account_is_protected(client):
    headers = demo_login(client)
    assert client.delete("/api/auth/me", headers=headers).status_code == 403
    assert client.post("/api/auth/change-password", headers=headers,
                       json={"current_password": demo.DEMO_PASSWORD, "new_password": "hijacked"}).status_code == 403
    assert client.patch("/api/auth/me", headers=headers, json={"email": "mine@example.com"}).status_code == 403


def test_stale_demo_is_rebuilt_on_login(client):
    headers = demo_login(client)
    activity_id = client.get("/api/activities", headers=headers).json()[0]["id"]
    client.patch(f"/api/activities/{activity_id}", headers=headers, json={"description": "visitor edit"})

    db = SessionLocal()
    user = db.query(User).filter(User.email == demo.DEMO_EMAIL).first()
    firm = db.query(Firm).filter(Firm.id == user.firm_id).first()
    firm.created_at = datetime.utcnow() - demo.DEMO_REFRESH_AFTER - timedelta(minutes=1)
    db.commit()
    db.close()

    headers = demo_login(client)
    descriptions = [a["description"] for a in client.get("/api/activities", headers=headers).json()]
    assert "visitor edit" not in descriptions


def test_demo_seed_is_idempotent():
    db = SessionLocal()
    demo.seed_demo(db)
    demo.seed_demo(db)
    assert db.query(User).filter(User.email == demo.DEMO_EMAIL).count() == 1
    assert db.query(Firm).count() == 1
    db.close()
