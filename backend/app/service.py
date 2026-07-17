from __future__ import annotations

import json
import sqlite3
from decimal import Decimal
from typing import Any, Mapping

from .database import get_connection
from .intent import IntentUnavailableError, IntentVerdict, judge_intent
from .ledger import append_entry
from .policy import Decision, decision_to_status, evaluate


ACTION_TYPES = {
    "payment",
    "email_send",
    "data_delete",
    "data_export",
    "external_api_call",
    "system_command",
}
PENDING_STATUS = decision_to_status("PENDING_APPROVAL")
ALLOWED_STATUS = decision_to_status("ALLOW")
BLOCKED_STATUS = decision_to_status("BLOCK")


class AgentNotFoundError(ValueError):
    pass


class ActionNotFoundError(ValueError):
    pass


class ActionNotPendingError(ValueError):
    pass


def declare_mission(agent_identifier: str, mission: str) -> dict[str, Any]:
    if not mission.strip():
        raise ValueError("mission must not be empty")
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        agent_id = _resolve_agent_id(connection, agent_identifier, create_if_missing=True, mission=mission)
        connection.execute("UPDATE missions SET active = 0 WHERE agent_id = ? AND active = 1", (agent_id,))
        cursor = connection.execute(
            "INSERT INTO missions (agent_id, mission_text, active) VALUES (?, ?, 1)",
            (agent_id, mission),
        )
        row = connection.execute("SELECT * FROM missions WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return _mission_response(row)


def get_active_mission(agent_identifier: str) -> dict[str, Any]:
    with get_connection() as connection:
        agent_id = _resolve_agent_id(connection, agent_identifier)
        row = connection.execute(
            "SELECT * FROM missions WHERE agent_id = ? AND active = 1 ORDER BY id DESC LIMIT 1",
            (agent_id,),
        ).fetchone()
    if row is None:
        raise ValueError("active mission not found")
    return _mission_response(row)


def create_action(
    agent_identifier: str,
    action_type: str,
    amount_cents: int | None,
    counterparty: str,
    payload: Mapping[str, Any],
    intent_judge: Any | None = None,
) -> dict[str, Any]:
    if action_type not in ACTION_TYPES:
        raise ValueError("unsupported action_type")
    if not counterparty.strip():
        raise ValueError("counterparty must not be empty")
    if amount_cents is not None and (isinstance(amount_cents, bool) or not isinstance(amount_cents, int) or amount_cents < 0):
        raise ValueError("amount_cents must be a non-negative integer")
    if action_type == "payment" and amount_cents is None:
        raise ValueError("payment requires amount")

    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        agent_id = _resolve_agent_id(connection, agent_identifier)
        mission_row = connection.execute(
            "SELECT mission_text FROM missions WHERE agent_id = ? AND active = 1 ORDER BY id DESC LIMIT 1",
            (agent_id,),
        ).fetchone()
        policy_row = connection.execute(
            "SELECT name, rules FROM policies WHERE active = 1 ORDER BY id LIMIT 1"
        ).fetchone()
        if policy_row is None:
            raise ValueError("no active policy configured")
        policy = json.loads(policy_row["rules"])
        context = _policy_context(connection, agent_id, action_type)
        result = evaluate(
            {
                "action_type": action_type,
                "amount_cents": amount_cents,
                "counterparty": counterparty,
                "payload": payload,
            },
            policy,
            context,
        )
        intent_verdict: IntentVerdict | None = None
        intent_error: str | None = None
        if mission_row is not None:
            try:
                intent_verdict = (intent_judge or judge_intent)(
                    mission_row["mission_text"],
                    {
                        "action_type": action_type,
                        "amount_cents": amount_cents,
                        "currency": "EUR",
                        "counterparty": counterparty,
                        "payload": dict(payload),
                    },
                )
            except Exception:
                intent_error = "intent firewall unavailable — human review required"
        fused = fuse_decision(
            result["decision"],
            result["reasons"],
            None if intent_verdict is None else intent_verdict.model_dump(),
            mission_row is not None,
        )
        status = decision_to_status(fused["decision"])
        policy_reason = "; ".join(fused["reasons"])
        intent_json = None if intent_verdict is None else json.dumps(intent_verdict.model_dump(), sort_keys=True)
        cursor = connection.execute(
            """INSERT INTO actions
               (agent_id, action_type, amount_cents, counterparty, payload, status, policy_reason,
                intent_verdict, intent_model, intent_latency_ms, intent_error)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                agent_id,
                action_type,
                amount_cents,
                counterparty,
                json.dumps(payload),
                status,
                policy_reason,
                intent_json,
                None if intent_verdict is None else intent_verdict.model,
                None if intent_verdict is None else intent_verdict.latency_ms,
                intent_error,
            ),
        )
        row = connection.execute("SELECT * FROM actions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        append_entry(connection, row["id"], "action_evaluated", _ledger_snapshot(connection, row, fused["decision"], fused["reasons"]))
    return _action_response(row, fused["decision"], fused["reasons"])


def transition_action(action_id: int, approve: bool) -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
        if row is None:
            raise ActionNotFoundError("action not found")
        if row["status"] != PENDING_STATUS:
            raise ActionNotPendingError("action is not pending approval")
        status = ALLOWED_STATUS if approve else BLOCKED_STATUS
        decision = "ALLOW" if approve else "BLOCK"
        event_type = "action_approved" if approve else "action_rejected"
        decision_reason = "human decision: approved" if approve else "human decision: rejected"
        policy_reason = f"{row['policy_reason']}; {decision_reason}".strip("; ")
        connection.execute(
            "UPDATE actions SET status = ?, policy_reason = ? WHERE id = ?",
            (status, policy_reason, action_id),
        )
        updated = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
        append_entry(connection, action_id, event_type, _ledger_snapshot(connection, updated, decision, [policy_reason]))
    return _action_response(updated, None, [policy_reason])


def get_action_status(action_id: int) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
    if row is None:
        raise ActionNotFoundError("action not found")
    return {
        "action_id": row["id"],
        "status": row["status"],
        "reasons": _reasons(row["policy_reason"]),
        "policy_reason": row["policy_reason"],
        "intent_verdict": None if row["intent_verdict"] is None else json.loads(row["intent_verdict"]),
        "intent_error": row["intent_error"],
    }


def get_policies(agent_identifier: str) -> dict[str, Any]:
    with get_connection() as connection:
        agent_id = _resolve_agent_id(connection, agent_identifier)
        row = connection.execute(
            "SELECT name, rules FROM policies WHERE active = 1 ORDER BY id LIMIT 1"
        ).fetchone()
    if row is None:
        raise ValueError("no active policy configured")
    rules = json.loads(row["rules"])
    return {"agent_id": agent_id, "policy_name": row["name"], **rules}


def _resolve_agent_id(
    connection: sqlite3.Connection,
    identifier: str,
    create_if_missing: bool = False,
    mission: str | None = None,
) -> int:
    row = None
    if identifier.isdigit():
        row = connection.execute("SELECT id FROM agents WHERE id = ?", (int(identifier),)).fetchone()
    else:
        row = connection.execute("SELECT id FROM agents WHERE name = ?", (identifier,)).fetchone()
    if row is None and create_if_missing and not identifier.isdigit():
        cursor = connection.execute(
            "INSERT INTO agents (name, declared_mission) VALUES (?, ?)",
            (identifier, mission or identifier),
        )
        return int(cursor.lastrowid)
    if row is None:
        raise AgentNotFoundError("agent not found")
    return int(row["id"])


def _policy_context(connection: sqlite3.Connection, agent_id: int, action_type: str) -> dict[str, int]:
    context = {"daily_allowed_cents": 0, "emails_last_hour": 0}
    if action_type == "payment":
        context["daily_allowed_cents"] = connection.execute(
            """SELECT COALESCE(SUM(amount_cents), 0) FROM actions
               WHERE agent_id = ? AND action_type = 'payment' AND status = ?
                 AND created_at >= datetime('now', 'start of day')""",
            (agent_id, ALLOWED_STATUS),
        ).fetchone()[0]
    if action_type == "email_send":
        context["emails_last_hour"] = connection.execute(
            """SELECT COUNT(*) FROM actions
               WHERE agent_id = ? AND action_type = 'email_send' AND status = ?
                 AND created_at >= datetime('now', '-1 hour')""",
            (agent_id, ALLOWED_STATUS),
        ).fetchone()[0]
    return context


def _ledger_snapshot(connection: sqlite3.Connection, row: Any, decision: Decision, reasons: list[str]) -> dict[str, Any]:
    mission = connection.execute(
        "SELECT mission_text FROM missions WHERE agent_id = ? AND active = 1 ORDER BY id DESC LIMIT 1",
        (row["agent_id"],),
    ).fetchone()
    return {
        "agent_id": row["agent_id"],
        "action_type": row["action_type"],
        "amount_cents": row["amount_cents"],
        "currency": row["currency"],
        "counterparty": row["counterparty"],
        "decision": decision,
        "reasons": reasons,
        "mission_text": None if mission is None else mission["mission_text"],
        "intent_verdict": None if row["intent_verdict"] is None else json.loads(row["intent_verdict"]),
        "intent_error": row["intent_error"],
    }


def _action_response(row: Any, decision: Decision | None, reasons: list[str]) -> dict[str, Any]:
    amount = None if row["amount_cents"] is None else f"{Decimal(row['amount_cents']) / Decimal(100):.2f}"
    return {
        "id": row["id"],
        "agent_id": row["agent_id"],
        "action_type": row["action_type"],
        "amount": amount,
        "currency": row["currency"],
        "counterparty": row["counterparty"],
        "payload": json.loads(row["payload"]),
        "status": row["status"],
        "decision": decision,
        "policy_reason": row["policy_reason"],
        "created_at": row["created_at"],
        "reasons": reasons,
        "intent_verdict": None if row["intent_verdict"] is None else json.loads(row["intent_verdict"]),
        "intent_model": row["intent_model"],
        "intent_latency_ms": row["intent_latency_ms"],
        "intent_error": row["intent_error"],
        "mission_text": _mission_text_for_action(row),
    }


def _mission_text_for_action(row: Any) -> str | None:
    with get_connection() as connection:
        mission = connection.execute(
            "SELECT mission_text FROM missions WHERE agent_id = ? AND active = 1 ORDER BY id DESC LIMIT 1",
            (row["agent_id"],),
        ).fetchone()
    return None if mission is None else mission["mission_text"]


def _mission_response(row: Any) -> dict[str, Any]:
    return {"id": row["id"], "agent_id": row["agent_id"], "mission_text": row["mission_text"], "active": bool(row["active"]), "created_at": row["created_at"]}


def _reasons(policy_reason: str) -> list[str]:
    return [] if not policy_reason else [reason.strip() for reason in policy_reason.split(";")]


def fuse_decision(
    policy_decision: Decision,
    policy_reasons: list[str],
    intent_verdict: Mapping[str, Any] | None,
    mission_present: bool,
) -> dict[str, Any]:
    reasons = list(policy_reasons)
    if not mission_present:
        reasons.append("no mission declared — intent check skipped")
        return {"decision": "PENDING_APPROVAL" if policy_decision == "ALLOW" else policy_decision, "reasons": reasons}

    if intent_verdict is None:
        reasons.append("intent firewall unavailable — human review required")
        return {"decision": "PENDING_APPROVAL" if policy_decision == "ALLOW" else policy_decision, "reasons": reasons}

    verdict = intent_verdict["verdict"]
    if verdict in {"suspicious", "hijack_suspected"}:
        label = "hijack suspected" if verdict == "hijack_suspected" else "suspicious intent"
        reasons.append(
            f"intent firewall: {label} (confidence {float(intent_verdict['confidence']):.2f}): {intent_verdict['reasoning']}"
        )
    if policy_decision == "BLOCK" or verdict == "hijack_suspected":
        return {"decision": "BLOCK", "reasons": reasons}
    if verdict == "suspicious":
        return {"decision": "PENDING_APPROVAL", "reasons": reasons}
    return {"decision": policy_decision, "reasons": reasons}
