import json

from app.database import get_connection


def test_mission_declaration_supersedes_active_mission(client):
    agent = client.post(
        "/agents", json={"name": "Mission Agent", "declared_mission": "Initial mission"}
    ).json()
    first = client.post(f"/agents/{agent['id']}/mission", json={"mission": "Buy approved credits"})
    second = client.post(f"/agents/{agent['id']}/mission", json={"mission": "Buy only within daily budget"})

    assert first.status_code == 201
    assert second.status_code == 201
    assert client.get(f"/agents/{agent['id']}/mission").json()["mission_text"] == "Buy only within daily budget"

    with get_connection() as connection:
        rows = connection.execute(
            "SELECT mission_text, active FROM missions WHERE agent_id = ? ORDER BY id",
            (agent["id"],),
        ).fetchall()
    assert [(row[0], row[1]) for row in rows] == [
        ("Buy approved credits", 0),
        ("Buy only within daily budget", 1),
    ]


def test_active_mission_is_embedded_in_action_ledger_snapshot(client, agent):
    client.post(f"/agents/{agent['id']}/mission", json={"mission": "Purchase approved API credits"})
    action = client.post(
        "/actions",
        json={"agent_id": agent["id"], "action_type": "payment", "amount": 200.00, "counterparty": "openai.com"},
    )

    assert action.status_code == 201
    entries = client.get("/ledger").json()
    assert entries[0]["snapshot"]["mission_text"] == "Purchase approved API credits"
    assert entries[0]["snapshot"]["intent_verdict"]["verdict"] == "aligned"
    assert entries[0]["snapshot"]["intent_verdict"]["model"] == "test-model"
