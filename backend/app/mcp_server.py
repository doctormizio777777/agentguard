from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from .database import get_connection, initialize_database
from .service import (
    ACTION_TYPES,
    create_action,
    declare_mission as service_declare_mission,
    get_action_status,
    get_policies as service_get_policies,
)


mcp = FastMCP(
    "agentguard",
    instructions=(
        "AgentGuard governs high-risk actions. You MUST call request_action before performing "
        "any high-risk action, and you MUST NOT proceed unless status is allowed."
    ),
    host="127.0.0.1",
    port=8001,
)


@mcp.tool(
    description=(
        "Declare or replace the mission for an agent. Use this before requesting actions so "
        "the mission is included in the audit ledger. You MUST call request_action before "
        "performing any high-risk action, and you MUST NOT proceed unless status is allowed."
    )
)
def declare_mission(agent_id: str, mission: str) -> dict[str, Any]:
    return service_declare_mission(agent_id, mission)


@mcp.tool(
    description=(
        "Request authorization for one high-risk action. You MUST call this before performing "
        "any high-risk action, and you MUST NOT proceed unless status is allowed. If status is "
        "pending, wait for human approval and poll check_action_status. Payload MUST contain "
        "counterparty and, for payments, integer amount_cents."
    )
)
def request_action(agent_id: str, action_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    if action_type not in ACTION_TYPES:
        raise ValueError(f"unsupported action_type: {action_type}")
    if "counterparty" not in payload:
        raise ValueError("payload must include counterparty")
    counterparty = str(payload["counterparty"])
    amount_cents = payload.get("amount_cents")
    action_payload = {key: value for key, value in payload.items() if key not in {"counterparty", "amount_cents"}}
    result = create_action(agent_id, action_type, amount_cents, counterparty, action_payload)
    return {"action_id": result["id"], "status": _mcp_status(result["status"]), "reasons": result["reasons"]}


@mcp.tool(
    description=(
        "Poll the current status of a requested action after human review. Do not perform the "
        "action unless the returned status is allowed."
    )
)
def check_action_status(action_id: str) -> dict[str, Any]:
    result = get_action_status(_parse_action_id(action_id))
    result["status"] = _mcp_status(result["status"])
    return result


@mcp.tool(
    description=(
        "Read the active policy constraints for an agent, including caps, thresholds, and "
        "allowlists. Treat these constraints as hard boundaries. You MUST call request_action "
        "before performing any high-risk action, and you MUST NOT proceed unless status is allowed."
    )
)
def get_policies(agent_id: str) -> dict[str, Any]:
    return service_get_policies(agent_id)


def _parse_action_id(action_id: str) -> int:
    if not action_id.isdigit():
        raise ValueError("action_id must be an integer")
    return int(action_id)


def _mcp_status(status: str) -> str:
    return {"allowed": "allowed", "pending_approval": "pending", "blocked": "blocked"}[status]


def main() -> None:
    with get_connection() as connection:
        initialize_database(connection)
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
