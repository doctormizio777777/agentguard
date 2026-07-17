from __future__ import annotations

import json
from contextlib import asynccontextmanager
from decimal import Decimal
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .database import initialize_database, get_connection
from .ledger import append_entry, verify_chain
from .policy import Decision, decision_to_status, evaluate


ActionType = Literal[
    "payment",
    "email_send",
    "data_delete",
    "data_export",
    "external_api_call",
    "system_command",
]
ActionStatus = Literal["allowed", "pending_approval", "blocked"]
PENDING_STATUS = decision_to_status("PENDING_APPROVAL")
ALLOWED_STATUS = decision_to_status("ALLOW")
BLOCKED_STATUS = decision_to_status("BLOCK")


class AgentCreate(BaseModel):
    name: str = Field(min_length=1)
    declared_mission: str = Field(min_length=1)


class AgentResponse(AgentCreate):
    id: int
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class ActionCreate(BaseModel):
    agent_id: int
    action_type: ActionType
    amount: Decimal | None = None
    counterparty: str = Field(min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value < 0:
            raise ValueError("amount must be non-negative")
        return value


class ActionResponse(BaseModel):
    id: int
    agent_id: int
    action_type: ActionType
    amount: str | None
    currency: str
    counterparty: str
    payload: dict[str, Any]
    status: ActionStatus
    decision: Decision | None = None
    policy_reason: str
    created_at: str


@asynccontextmanager
async def lifespan(_: FastAPI):
    with get_connection() as connection:
        initialize_database(connection)
    yield


app = FastAPI(title="Agent Payment Guardrail", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/agents", response_model=AgentResponse, status_code=201)
def create_agent(request: AgentCreate) -> AgentResponse:
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO agents (name, declared_mission) VALUES (?, ?)",
            (request.name, request.declared_mission),
        )
        row = connection.execute(
            "SELECT id, name, declared_mission, created_at FROM agents WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return AgentResponse(id=row[0], name=row[1], declared_mission=row[2], created_at=row[3])


@app.post("/actions", response_model=ActionResponse, status_code=201)
def create_action(request: ActionCreate) -> ActionResponse:
    amount_cents = _amount_to_cents(request.amount)
    if request.action_type == "payment" and amount_cents is None:
        raise HTTPException(status_code=422, detail="payment requires amount")

    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if connection.execute("SELECT 1 FROM agents WHERE id = ?", (request.agent_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="agent not found")

        policy_row = connection.execute(
            "SELECT rules FROM policies WHERE active = 1 ORDER BY id LIMIT 1"
        ).fetchone()
        if policy_row is None:
            raise HTTPException(status_code=500, detail="no active policy configured")
        policy = json.loads(policy_row[0])
        context = _policy_context(connection, request.agent_id, request.action_type)
        result = evaluate(
            {
                "action_type": request.action_type,
                "amount_cents": amount_cents,
                "counterparty": request.counterparty,
                "payload": request.payload,
            },
            policy,
            context,
        )
        decision = result["decision"]
        status = decision_to_status(decision)
        policy_reason = "; ".join(result["reasons"])
        cursor = connection.execute(
            """
            INSERT INTO actions
                (agent_id, action_type, amount_cents, counterparty, payload, status, policy_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request.agent_id,
                request.action_type,
                amount_cents,
                request.counterparty,
                json.dumps(request.payload),
                status,
                policy_reason,
            ),
        )
        row = connection.execute("SELECT * FROM actions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        append_entry(
            connection,
            row["id"],
            "action_evaluated",
            _ledger_snapshot(row, decision, result["reasons"]),
        )
    return _action_response(row, decision)


@app.get("/actions", response_model=list[ActionResponse])
def list_actions(
    agent_id: int | None = None,
    status: ActionStatus | None = None,
    action_type: ActionType | None = None,
) -> list[ActionResponse]:
    clauses: list[str] = []
    values: list[Any] = []
    if agent_id is not None:
        clauses.append("agent_id = ?")
        values.append(agent_id)
    if status is not None:
        clauses.append("status = ?")
        values.append(status)
    if action_type is not None:
        clauses.append("action_type = ?")
        values.append(action_type)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with get_connection() as connection:
        rows = connection.execute(
            f"SELECT * FROM actions {where} ORDER BY id DESC", values
        ).fetchall()
    return [_action_response(row) for row in rows]


@app.post("/actions/{action_id}/approve", response_model=ActionResponse)
def approve_action(action_id: int) -> ActionResponse:
    return _decide_pending_action(action_id, ALLOWED_STATUS, "human decision: approved")


@app.post("/actions/{action_id}/reject", response_model=ActionResponse)
def reject_action(action_id: int) -> ActionResponse:
    return _decide_pending_action(action_id, BLOCKED_STATUS, "human decision: rejected")


def _decide_pending_action(action_id: int, status: ActionStatus, decision_reason: str) -> ActionResponse:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="action not found")
        if row["status"] != PENDING_STATUS:
            raise HTTPException(status_code=409, detail="action is not pending approval")
        policy_reason = f"{row['policy_reason']}; {decision_reason}".strip("; ")
        connection.execute(
            "UPDATE actions SET status = ?, policy_reason = ? WHERE id = ?",
            (status, policy_reason, action_id),
        )
        updated = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
        event_type = "action_approved" if status == ALLOWED_STATUS else "action_rejected"
        decision = "ALLOW" if status == ALLOWED_STATUS else "BLOCK"
        append_entry(
            connection,
            action_id,
            event_type,
            _ledger_snapshot(updated, decision, [policy_reason]),
        )
    return _action_response(updated)


@app.get("/ledger")
def list_ledger(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM ledger_entries ORDER BY seq DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [_ledger_response(row) for row in rows]


@app.get("/ledger/verify")
def ledger_verify() -> dict[str, Any]:
    with get_connection() as connection:
        return verify_chain(connection)


def _policy_context(connection: Any, agent_id: int, action_type: ActionType) -> dict[str, int]:
    context = {"daily_allowed_cents": 0, "emails_last_hour": 0}
    if action_type == "payment":
        context["daily_allowed_cents"] = connection.execute(
            """
            SELECT COALESCE(SUM(amount_cents), 0)
            FROM actions
            WHERE agent_id = ? AND action_type = 'payment' AND status = ?
              AND created_at >= datetime('now', 'start of day')
            """,
            (agent_id, ALLOWED_STATUS),
        ).fetchone()[0]
    if action_type == "email_send":
        context["emails_last_hour"] = connection.execute(
            """
            SELECT COUNT(*)
            FROM actions
            WHERE agent_id = ? AND action_type = 'email_send' AND status = ?
              AND created_at >= datetime('now', '-1 hour')
            """,
            (agent_id, ALLOWED_STATUS),
        ).fetchone()[0]
    return context


def _ledger_snapshot(row: Any, decision: Decision, reasons: list[str]) -> dict[str, Any]:
    return {
        "agent_id": row["agent_id"],
        "action_type": row["action_type"],
        "amount_cents": row["amount_cents"],
        "currency": row["currency"],
        "counterparty": row["counterparty"],
        "decision": decision,
        "reasons": reasons,
    }


def _ledger_response(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "seq": row["seq"],
        "action_id": row["action_id"],
        "event_type": row["event_type"],
        "snapshot": json.loads(row["snapshot"]),
        "prev_hash": row["prev_hash"],
        "entry_hash": row["entry_hash"],
        "created_at": row["created_at"],
    }


def _amount_to_cents(amount: Decimal | None) -> int | None:
    if amount is None:
        return None
    cents = amount * Decimal(100)
    if cents != cents.to_integral_value():
        raise HTTPException(status_code=422, detail="amount must have at most two decimal places")
    return int(cents)


def _action_response(row: Any, decision: Decision | None = None) -> ActionResponse:
    amount = None if row["amount_cents"] is None else f"{Decimal(row['amount_cents']) / Decimal(100):.2f}"
    return ActionResponse(
        id=row["id"],
        agent_id=row["agent_id"],
        action_type=row["action_type"],
        amount=amount,
        currency=row["currency"],
        counterparty=row["counterparty"],
        payload=json.loads(row["payload"]),
        status=row["status"],
        decision=decision,
        policy_reason=row["policy_reason"],
        created_at=row["created_at"],
    )
