"""
Test setup: runs the real FastAPI app against a throwaway SQLite database.
Env vars must be set before main/database are imported.
"""
import os
import sys
import tempfile
from pathlib import Path

# TEST_DATABASE_URL lets CI run the same suite against a real Postgres
# (which, unlike SQLite, enforces foreign keys).
_db_file = Path(tempfile.mkdtemp()) / "lawtrack_test.db"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_db_file.as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

import main
from database import engine
from models import Base

main.limiter.enabled = False


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def register(client, email, firm_name=None, password="password123", full_name="Test Attorney"):
    body = {"email": email, "password": password, "full_name": full_name}
    if firm_name:
        body["firm_name"] = firm_name
    resp = client.post("/api/auth/register", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def login(client, email, password="password123"):
    resp = client.post("/api/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def attorney(client):
    """A registered attorney: returns (auth headers, agent API key)."""
    reg = register(client, "alice@firm-a.com", firm_name="Firm A", full_name="Alice")
    return login(client, "alice@firm-a.com"), reg["agent_api_key"]
