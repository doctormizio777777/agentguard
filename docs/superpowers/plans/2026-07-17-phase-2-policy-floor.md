# Phase 2 Policy Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend-only SQLite data model, deterministic policy engine, and action approval API for AgentGuard.

**Architecture:** Keep `policy.py` pure and deterministic. Keep SQLite access in the database helper and FastAPI orchestration in `main.py`; all persisted action statuses come from one `decision_to_status` mapping. Convert decimal API money to integer cents at the request boundary and back to decimal values in responses.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, SQLite, pytest, pytest-httpx/TestClient-compatible FastAPI testing.

## Global Constraints

- Backend only; do not modify frontend files.
- Store money as integer `amount_cents`; no float money in DB or policy math.
- `evaluate(action, policy, context)` remains a pure function with no hidden globals.
- Decision precedence is BLOCK > PENDING_APPROVAL > ALLOW and all triggered reasons are returned.
- Use one `decision_to_status` function for ALLOW/allowed, PENDING_APPROVAL/pending_approval, BLOCK/blocked.
- Policy evaluation runs before action persistence.
- No ledger, MCP, GPT-5.6, authentication, or provider integration in this phase.

---

### Task 1: Pure policy engine

**Files:**
- Create: `backend/app/policy.py`
- Create: `backend/tests/test_policy.py`

**Interfaces:**
- Consumes action dictionaries with `action_type`, `amount_cents`, `counterparty`, and JSON-like `payload` values; policy rules dictionary; context dictionary.
- Produces `{"decision": "ALLOW"|"PENDING_APPROVAL"|"BLOCK", "reasons": list[str]}`.

- [ ] Write failing tests for all requested policy cases, including BLOCK precedence and all reasons.
- [ ] Run `pytest backend/tests/test_policy.py -q`; expected failure because `policy.py` is missing.
- [ ] Implement typed helpers and pure `evaluate` with integer-cent comparisons.
- [ ] Run the policy tests; expected all pass.
- [ ] Refactor only after green to keep rule helpers small and deterministic.

### Task 2: SQLite schema and seeded policy

**Files:**
- Modify: `backend/app/database.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_database.py`

**Interfaces:**
- `get_connection()` returns a SQLite connection with foreign keys enabled.
- `initialize_database(connection)` creates tables and idempotently seeds one active default policy.

- [ ] Write failing schema/seed tests for columns, constraints, foreign keys, and cent-valued seed rules.
- [ ] Run `pytest backend/tests/test_database.py -q`; expected failure for missing schema initializer.
- [ ] Implement schema creation and seed using parameterized SQL and JSON serialization.
- [ ] Run database tests; expected all pass.

### Task 3: FastAPI agents and actions

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/database.py`
- Create: `backend/tests/test_api.py`

**Interfaces:**
- `POST /agents` accepts `{name, declared_mission}`.
- `POST /actions` accepts `{agent_id, action_type, amount?, counterparty, payload?}` and returns uppercase decision plus persisted action details.
- `GET /actions` supports `agent_id`, `status`, and `action_type`, newest first.
- `POST /actions/{id}/approve` and `/reject` enforce pending-only transitions.

- [ ] Write failing API tests for validation, payment BLOCK/PENDING, command BLOCK, and approval transition.
- [ ] Run the focused API tests; expected failure because routes/models are missing.
- [ ] Implement Pydantic models, Decimal-to-cents boundary conversion, context queries, policy evaluation, persistence, filters, and response conversion.
- [ ] Run focused API tests; expected all pass.

### Task 4: Full verification and commit

**Files:**
- Modify only implementation/test files from Tasks 1-3.

- [ ] Run full `pytest -q` and record the complete output.
- [ ] Start backend and run real curl flows for 5000 BLOCK, `rm -rf` BLOCK, and 700 PENDING → approve.
- [ ] Run `git diff --check`, inspect `git status`, and run the fintech checklist for the changed money path.
- [ ] Commit with `feat: add deterministic policy floor`.
- [ ] Re-run acceptance commands after commit and report actual output.

