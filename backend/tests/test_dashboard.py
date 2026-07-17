from __future__ import annotations

from app.dashboard import get_dashboard_summary


def test_actions_limit_and_mission_are_exposed(client, agent):
    first = client.post(
        "/actions",
        json={"agent_id": agent["id"], "action_type": "payment", "amount": 20, "counterparty": "openai.com"},
    )
    second = client.post(
        "/actions",
        json={"agent_id": agent["id"], "action_type": "payment", "amount": 30, "counterparty": "stripe.com"},
    )

    response = client.get("/actions", params={"limit": 1})

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == second.json()["id"]
    assert response.json()[0]["mission_text"] == "Buy approved infrastructure only"
    assert response.json()[0]["intent_verdict"]["verdict"] == "aligned"
    assert "reasons" in response.json()[0]
    assert first.status_code == 201


def test_dashboard_summary_is_aggregated_by_backend(client, agent):
    client.post(
        "/actions",
        json={"agent_id": agent["id"], "action_type": "payment", "amount": 20, "counterparty": "openai.com"},
    )
    client.post(
        "/actions",
        json={"agent_id": agent["id"], "action_type": "payment", "amount": 700, "counterparty": "stripe.com"},
    )
    client.post(
        "/actions",
        json={
            "agent_id": agent["id"],
            "action_type": "payment",
            "amount": 5000,
            "counterparty": "unknown-vendor.xyz",
        },
    )

    response = client.get("/dashboard/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["actions_today"] == 3
    assert body["spend_today_cents"] == 2000
    assert body["pending_count"] == 1
    assert body["blocked_count"] == 1
    assert body["agents_online"] == 1
    assert body["threats_blocked"] == 0
    assert body["ledger"]["entries"] == 3
    assert body["ledger"]["valid"] is True


def test_dashboard_summary_counts_hijack_verdict(client, agent):
    from app.intent import IntentVerdict
    from app.service import create_action

    result = create_action(
        str(agent["id"]),
        "payment",
        500_000,
        "unknown-vendor.xyz",
        {},
        intent_judge=lambda _mission, _action: IntentVerdict(
            verdict="hijack_suspected",
            confidence=0.99,
            reasoning="Injected beneficiary change",
            model="test-model",
            latency_ms=1,
        ),
    )

    assert result["status"] == "blocked"
    assert get_dashboard_summary()["threats_blocked"] == 1
