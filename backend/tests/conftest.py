import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.intent import IntentVerdict


@pytest.fixture(autouse=True)
def fake_intent_judge(monkeypatch):
    def judge(_mission_text, _action):
        return IntentVerdict(verdict="aligned", confidence=0.98, reasoning="The action serves the declared mission.", model="test-model", latency_ms=1)

    monkeypatch.setattr("app.service.judge_intent", judge)
    return judge


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
    mission = client.post(
        f"/agents/{response.json()['id']}/mission",
        json={"mission": "Buy approved infrastructure only"},
    )
    assert mission.status_code == 201
    return response.json()
