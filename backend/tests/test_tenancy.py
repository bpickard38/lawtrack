"""Attorneys must never see or touch another attorney's (or firm's) data."""
from datetime import datetime, timedelta

from conftest import register, login


def second_attorney(client):
    reg = register(client, "mallory@firm-b.com", firm_name="Firm B", full_name="Mallory")
    return login(client, "mallory@firm-b.com"), reg["agent_api_key"]


def make_case(client, headers, name):
    attorney_id = client.get("/api/auth/attorney", headers=headers).json()["id"]
    return client.post("/api/cases", headers=headers, json={"name": name, "attorney_id": attorney_id}).json()["id"]


def agent_activity(client, api_key, **fields):
    end = datetime(2026, 1, 5, 12, 0)
    payload = {"type": "document", "start_time": (end - timedelta(minutes=10)).isoformat() + "Z",
               "end_time": end.isoformat() + "Z", **fields}
    return client.post("/api/agent/activities", headers={"X-API-Key": api_key}, json=payload).json()


def test_cannot_read_other_attorneys_case(client, attorney):
    alice, _ = attorney
    mallory, _ = second_attorney(client)
    case_id = make_case(client, alice, "Secret matter")
    assert client.get(f"/api/cases/{case_id}", headers=mallory).status_code == 403
    assert client.get("/api/cases", headers=mallory).json() == []


def test_cannot_edit_other_attorneys_activity(client, attorney):
    _, alice_key = attorney
    mallory, _ = second_attorney(client)
    act = agent_activity(client, alice_key, document_name="Alice brief.docx")
    assert client.patch(f"/api/activities/{act['id']}", headers=mallory, json={"description": "changed"}).status_code == 403
    assert client.delete(f"/api/activities/{act['id']}", headers=mallory).status_code == 403


def test_cannot_assign_activity_to_other_attorneys_case(client, attorney):
    alice, _ = attorney
    mallory, mallory_key = second_attorney(client)
    alice_case = make_case(client, alice, "Alice matter")
    act = agent_activity(client, mallory_key, document_name="x")
    resp = client.patch(f"/api/activities/{act['id']}", headers=mallory, json={"case_id": alice_case})
    assert resp.status_code == 403


def test_attorney_list_is_scoped_to_firm(client, attorney):
    alice, _ = attorney
    mallory, _ = second_attorney(client)
    emails = [a["email"] for a in client.get("/api/attorneys", headers=mallory).json()]
    assert emails == ["mallory@firm-b.com"]
    alice_id = client.get("/api/auth/attorney", headers=alice).json()["id"]
    assert client.get(f"/api/attorneys/{alice_id}", headers=mallory).status_code == 404
