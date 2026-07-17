import pytest

from app.mcp_server import check_action_status, declare_mission, get_policies, request_action


def test_mcp_tools_cover_mission_policy_actions_and_status(client):
    mission = declare_mission("procurement-bot", "Buy approved API credits")
    assert mission["mission_text"] == "Buy approved API credits"
    agent_id = mission["agent_id"]

    policies = get_policies(str(agent_id))
    assert policies["per_transaction_cap"] == 100_000

    allowed = request_action(
        str(agent_id), "payment", {"amount_cents": 20_000, "counterparty": "openai.com"}
    )
    assert allowed["status"] == "allowed"
    assert check_action_status(str(allowed["action_id"]))["status"] == "allowed"


def test_mcp_request_action_matches_http_result(client, agent):
    http_response = client.post(
        "/actions",
        json={"agent_id": agent["id"], "action_type": "payment", "amount": 200.00, "counterparty": "openai.com"},
    )
    mcp_response = request_action(
        str(agent["id"]), "payment", {"amount_cents": 20_000, "counterparty": "openai.com"}
    )

    assert http_response.status_code == 201
    assert mcp_response["status"] == http_response.json()["status"]
    assert mcp_response["reasons"] == []


def test_mcp_pending_action_becomes_allowed_after_http_approval(client):
    mission = declare_mission("pending-bot", "Buy API credits")
    pending = request_action(
        str(mission["agent_id"]), "payment", {"amount_cents": 70_000, "counterparty": "stripe.com"}
    )
    assert pending["status"] == "pending"

    approved = client.post(f"/actions/{pending['action_id']}/approve")
    assert approved.status_code == 200
    assert check_action_status(str(pending["action_id"]))["status"] == "allowed"


def test_mcp_unknown_agent_and_invalid_payload_are_errors(client):
    with pytest.raises(ValueError, match="agent not found"):
        get_policies("999999")
    with pytest.raises(ValueError, match="counterparty"):
        request_action("999999", "payment", {"amount_cents": 20_000})
