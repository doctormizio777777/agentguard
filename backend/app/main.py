from __future__ import annotations

import json
from contextlib import asynccontextmanager
from decimal import Decimal
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .database import initialize_database, get_connection
from .ledger import verify_chain
from .policy import Decision
from .risk import compute_risk, risk_components
from .service import (
    ActionNotFoundError,
    ActionNotPendingError,
    AgentNotFoundError,
    create_action as service_create_action,
    declare_mission as service_declare_mission,
    transition_action,
)


ActionType = Literal[
    "payment",
    "email_send",
    "data_delete",
    "data_export",
    "external_api_call",
    "system_command",
]
ActionStatus = Literal["allowed", "pending_approval", "blocked"]


class AgentCreate(BaseModel):
    name: str = Field(min_length=1)
    declared_mission: str = Field(min_length=1)


class AgentResponse(AgentCreate):
    id: int
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class MissionCreate(BaseModel):
    mission: str = Field(min_length=1)


class MissionResponse(BaseModel):
    id: int
    agent_id: int
    mission_text: str
    active: bool
    created_at: str


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
    intent_verdict: dict[str, Any] | None = None
    intent_model: str | None = None
    intent_latency_ms: int | None = None
    intent_error: str | None = None


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


@app.get("/agents")
def list_agents() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute("SELECT id, name, declared_mission, created_at FROM agents ORDER BY id DESC").fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "declared_mission": row["declared_mission"],
            "created_at": row["created_at"],
            "risk_score": compute_risk(row["id"]),
        }
        for row in rows
    ]


@app.post("/actions", response_model=ActionResponse, status_code=201)
def create_action(request: ActionCreate) -> ActionResponse:
    amount_cents = _amount_to_cents(request.amount)
    try:
        result = service_create_action(
            str(request.agent_id), request.action_type, amount_cents, request.counterparty, request.payload
        )
    except AgentNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return ActionResponse(**{key: value for key, value in result.items() if key != "reasons"})


@app.post("/agents/{agent_id}/mission", response_model=MissionResponse, status_code=201)
def create_mission(agent_id: int, request: MissionCreate) -> MissionResponse:
    try:
        result = service_declare_mission(str(agent_id), request.mission)
    except AgentNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return MissionResponse(**result)


@app.get("/agents/{agent_id}/mission", response_model=MissionResponse)
def get_mission(agent_id: int) -> MissionResponse:
    from .service import get_active_mission

    try:
        result = get_active_mission(str(agent_id))
    except AgentNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return MissionResponse(**result)


@app.get("/agents/{agent_id}/risk")
def get_agent_risk(agent_id: int) -> dict[str, Any]:
    with get_connection() as connection:
        if connection.execute("SELECT 1 FROM agents WHERE id = ?", (agent_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="agent not found")
    return {"agent_id": agent_id, "risk_score": compute_risk(agent_id), "components": risk_components(agent_id)}


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
    try:
        result = transition_action(action_id, approve=True)
    except ActionNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ActionNotPendingError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return ActionResponse(**{key: value for key, value in result.items() if key != "reasons"})


@app.post("/actions/{action_id}/reject", response_model=ActionResponse)
def reject_action(action_id: int) -> ActionResponse:
    try:
        result = transition_action(action_id, approve=False)
    except ActionNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ActionNotPendingError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return ActionResponse(**{key: value for key, value in result.items() if key != "reasons"})


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
        intent_verdict=None if row["intent_verdict"] is None else json.loads(row["intent_verdict"]),
        intent_model=row["intent_model"],
        intent_latency_ms=row["intent_latency_ms"],
        intent_error=row["intent_error"],
    )
