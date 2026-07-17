import json

from app.risk import compute_risk, risk_components


def test_fresh_agent_has_low_risk(client, agent):
    assert compute_risk(agent["id"]) == 0
    assert risk_components(agent["id"])["total_actions"] == 0


def test_hijack_and_blocked_history_produce_high_risk(client, agent):
    from app.database import get_connection

    with get_connection() as connection:
        connection.execute(
            """INSERT INTO actions
               (agent_id, action_type, amount_cents, counterparty, payload, status, policy_reason, intent_verdict)
               VALUES (?, 'payment', 500000, 'unknown-vendor.xyz', '{}', 'blocked', 'blocked', ?)""",
            (agent["id"], json.dumps({"verdict": "hijack_suspected", "confidence": 0.99, "reasoning": "injection"})),
        )
        connection.execute(
            """INSERT INTO actions
               (agent_id, action_type, amount_cents, counterparty, payload, status, policy_reason, intent_verdict)
               VALUES (?, 'payment', 20000, 'openai.com', '{}', 'allowed', '', ?)""",
            (agent["id"], json.dumps({"verdict": "aligned", "confidence": 0.9, "reasoning": "ok"})),
        )
        connection.commit()

    assert compute_risk(agent["id"]) == 63
    components = risk_components(agent["id"])
    assert components["hijack_suspected"] == 1
    assert components["blocked_actions"] == 1


def test_risk_endpoints_return_score_and_components(client, agent):
    response = client.get(f"/agents/{agent['id']}/risk")
    assert response.status_code == 200
    assert response.json()["agent_id"] == agent["id"]
    assert response.json()["risk_score"] == 0

    agents = client.get("/agents")
    assert agents.status_code == 200
    assert agents.json()[0]["risk_score"] == 0
