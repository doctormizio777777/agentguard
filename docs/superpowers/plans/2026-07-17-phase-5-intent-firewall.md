# Phase 5 GPT-5.6 Intent Firewall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fail-closed GPT-5.6 mission-alignment layer and deterministic agent risk score above the existing policy floor.

**Architecture:** The shared service remains the single action write path. An injectable intent judge runs after policy evaluation; fusion maps policy plus intent to one persisted status and reason set. SQLite stores the intent verdict JSON and risk derives from immutable action history.

**Tech Stack:** Python 3.11+, FastAPI, SQLite, official OpenAI Python SDK, python-dotenv, pytest, mocked intent client in tests.

## Global Constraints

- Never call a real API in unit or integration tests.
- Read all provider configuration from environment; never hardcode model or base URL.
- Policy BLOCK is absolute and intent-unavailable is fail-closed.
- Persist integer `amount_cents`; no floats in money math or DB.
- Do not touch the frontend.

### Task 1: Intent schema and fusion tests

**Files:** Create `backend/app/intent.py`; modify `backend/app/service.py`; test `backend/tests/test_intent.py`.

- Write fake-client tests for verdict parsing, retry, timeout/unavailable, and the complete fusion matrix.
- Run focused tests and confirm RED because intent/fusion functions are absent.
- Implement typed verdict validation, injected client boundary, and deterministic fusion.
- Run focused tests.

### Task 2: Persistence, API, and risk

**Files:** Modify `backend/app/database.py`, `backend/app/service.py`, `backend/app/main.py`; create `backend/app/risk.py`; test `backend/tests/test_risk.py`, `backend/tests/test_api.py`.

- Write failing tests for stored verdict snapshots, risk components, and risk endpoints.
- Add schema columns, service integration, responses, and deterministic risk formula.
- Run all tests and verify existing behavior remains green.

### Task 3: Environment and live demo

**Files:** Create `backend/.env.example`, local ignored `backend/.env`, `scripts/demo_hijack.py`, and `docs/reviews/2026-07-17-phase-5-intent-firewall.md`.

- Install official SDK dependencies and run a minimal real smoke call without printing secrets.
- Run the live demo against real API only after the smoke call, capture actual verdicts, risk, and ledger verification.
- Run full pytest, `git check-ignore`, secret scan, diff check, and commit in small conventional commits.
