import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_GUARDRAIL_DB", str(tmp_path / "test.db"))
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def agent(client):
    response = client.post(
        "/agents",
        json={"name": "Demo Agent", "declared_mission": "Buy approved infrastructure only"},
    )
    assert response.status_code == 201
    return response.json()
