from datetime import datetime, timedelta


def make_case(client, headers, name="Smith v. Jones"):
    attorney_id = client.get("/api/auth/attorney", headers=headers).json()["id"]
    resp = client.post("/api/cases", headers=headers, json={"name": name, "client_name": "Robert Smith", "attorney_id": attorney_id})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def agent_payload(**fields):
    end = datetime(2026, 1, 5, 15, 0)
    return {"type": "document", "start_time": (end - timedelta(minutes=42)).isoformat() + "Z",
            "end_time": end.isoformat() + "Z", **fields}


def test_agent_activity_auto_assigned_by_rule(client, attorney):
    headers, api_key = attorney
    case_id = make_case(client, headers)
    rule = client.post("/api/case-rules", headers=headers,
                       json={"case_id": case_id, "rule_type": "document_contains", "pattern": "smith v jones"})
    assert rule.status_code == 200, rule.text

    resp = client.post("/api/agent/activities", headers={"X-API-Key": api_key},
                       json=agent_payload(document_name="Smith v Jones - Motion.docx"))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["case_id"] == case_id
    assert body["confidence"] == "high"
    assert body["duration_minutes"] == 42


def test_agent_activity_without_matching_rule_is_unassigned(client, attorney):
    _, api_key = attorney
    resp = client.post("/api/agent/activities", headers={"X-API-Key": api_key},
                       json=agent_payload(document_name="Random notes.docx"))
    assert resp.status_code == 200
    assert resp.json()["case_id"] is None


def test_higher_priority_rule_wins(client, attorney):
    headers, api_key = attorney
    low = make_case(client, headers, "Low")
    high = make_case(client, headers, "High")
    client.post("/api/case-rules", headers=headers, json={"case_id": low, "rule_type": "document_contains", "pattern": "memo", "priority": 1})
    client.post("/api/case-rules", headers=headers, json={"case_id": high, "rule_type": "document_contains", "pattern": "memo", "priority": 9})
    resp = client.post("/api/agent/activities", headers={"X-API-Key": api_key}, json=agent_payload(document_name="memo.docx"))
    assert resp.json()["case_id"] == high


def test_excluded_keywords_are_never_captured(client, attorney):
    headers, api_key = attorney
    client.post("/api/settings/excluded-keywords", headers=headers, json={"excluded_keywords": "personal"})
    resp = client.post("/api/agent/activities", headers={"X-API-Key": api_key},
                       json=agent_payload(document_name="Personal budget.xlsx"))
    assert resp.json() == {"skipped": True, "reason": "excluded"}
    assert client.get("/api/activities", headers=headers).json() == []


def test_agent_rejects_bad_api_key(client, attorney):
    resp = client.post("/api/agent/activities", headers={"X-API-Key": "lt_not_a_real_key_123"}, json=agent_payload())
    assert resp.status_code == 401


def test_bulk_approve_skips_unassigned(client, attorney):
    headers, api_key = attorney
    case_id = make_case(client, headers)
    a = client.post("/api/agent/activities", headers={"X-API-Key": api_key}, json=agent_payload(document_name="a")).json()["id"]
    b = client.post("/api/agent/activities", headers={"X-API-Key": api_key}, json=agent_payload(document_name="b")).json()["id"]
    client.patch(f"/api/activities/{a}", headers=headers, json={"case_id": case_id})
    resp = client.post("/api/activities/bulk-approve", headers=headers, json={"activity_ids": [a, b]})
    assert resp.json() == {"approved": 1, "skipped": 1}
