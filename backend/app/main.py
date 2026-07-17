from __future__ import annotations

import asyncio
import json
import logging
import secrets
from contextlib import asynccontextmanager, suppress
from decimal import Decimal
from typing import Annotated, Any, Callable, Literal

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .database import initialize_database, get_connection
from .dashboard import get_dashboard_summary
from .demo_seed import reset_demo_database
from .ledger import verify_chain
from .policy import Decision
from .risk import compute_risk, risk_components
from .settings import allowed_origins, auto_reseed_seconds, demo_mode_enabled, demo_reset_key
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
LOGGER = logging.getLogger(__name__)


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
    reasons: list[str] = Field(default_factory=list)
    created_at: str
    intent_verdict: dict[str, Any] | None = None
    intent_model: str | None = None
    intent_latency_ms: int | None = None
    intent_error: str | None = None
    mission_text: str | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    with get_connection() as connection:
        initialize_database(connection)
    interval_seconds = auto_reseed_seconds()
    reseed_task = (
        asyncio.create_task(run_auto_reseed(interval_seconds, reset_demo_database))
        if interval_seconds is not None
        else None
    )
    try:
        yield
    finally:
        if reseed_task is not None:
            reseed_task.cancel()
            with suppress(asyncio.CancelledError):
                await reseed_task


async def run_auto_reseed(interval_seconds: float, resetter: Callable[[], Any]) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await asyncio.to_thread(resetter)
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("automatic demo reseed failed")


app = FastAPI(title="Agent Payment Guardrail", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
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
    return ActionResponse(**result)


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
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[ActionResponse]:
    clauses: list[str] = []
    values: list[Any] = []
    if agent_id is not None:
        clauses.append("a.agent_id = ?")
        values.append(agent_id)
    if status is not None:
        clauses.append("a.status = ?")
        values.append(status)
    if action_type is not None:
        clauses.append("a.action_type = ?")
        values.append(action_type)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with get_connection() as connection:
        rows = connection.execute(
            f"""SELECT a.*,
                (SELECT mission_text FROM missions m
                 WHERE m.agent_id = a.agent_id AND m.active = 1 ORDER BY m.id DESC LIMIT 1) AS mission_text
                FROM actions a {where} ORDER BY a.id DESC LIMIT ?""",
            [*values, limit],
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
    return ActionResponse(**result)


@app.post("/actions/{action_id}/reject", response_model=ActionResponse)
def reject_action(action_id: int) -> ActionResponse:
    try:
        result = transition_action(action_id, approve=False)
    except ActionNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ActionNotPendingError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return ActionResponse(**result)


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


@app.get("/dashboard/summary")
def dashboard_summary() -> dict[str, Any]:
    summary = get_dashboard_summary()
    if demo_mode_enabled():
        summary["demo"] = True
    return summary


@app.post("/demo/reset")
def demo_reset(
    x_demo_key: Annotated[str | None, Header(alias="X-Demo-Key")] = None,
) -> dict[str, Any]:
    configured_key = demo_reset_key()
    if configured_key is None:
        raise HTTPException(status_code=503, detail="demo reset is not configured")
    if not secrets.compare_digest(x_demo_key or "", configured_key):
        raise HTTPException(status_code=403, detail="invalid demo reset key")
    result = reset_demo_database()
    return {"status": "reset", **result}


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
        reasons=[] if not row["policy_reason"] else [reason.strip() for reason in row["policy_reason"].split(";")],
        created_at=row["created_at"],
        intent_verdict=None if row["intent_verdict"] is None else json.loads(row["intent_verdict"]),
        intent_model=row["intent_model"],
        intent_latency_ms=row["intent_latency_ms"],
        intent_error=row["intent_error"],
        mission_text=row["mission_text"] if "mission_text" in row.keys() else None,
    )
