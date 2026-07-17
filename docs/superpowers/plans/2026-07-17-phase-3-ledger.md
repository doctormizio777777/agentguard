# Phase 3 Tamper-Evident Audit Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a tamper-evident, append-only audit chain to the Phase 2 backend without changing the frontend.

**Architecture:** SQLite stores immutable ledger rows. A pure Python module canonicalizes snapshots and hashes entries; its append and verification functions receive an explicit connection. FastAPI wraps action persistence plus ledger append in one transaction and exposes read/verify endpoints.

**Tech Stack:** Python 3.11+, FastAPI, SQLite, hashlib, canonical JSON, pytest.

## Global Constraints

- Backend only; do not modify frontend files.
- Amounts remain integer minor units (`amount_cents`) in persistence and policy logic.
- Ledger writes use `append_entry` only; no UPDATE or DELETE application path exists.
- Every state-changing action event and human transition is audited.
- Hashes use sorted-key compact UTF-8 JSON.

### Task 1: Ledger schema and pure hashing

**Files:** Create `backend/app/ledger.py`; modify `backend/app/database.py`; test `backend/tests/test_ledger.py`.

- Write failing tests for canonical determinism, append sequence/genesis, valid verification, snapshot tamper, prev-hash tamper, and deleted sequence gap.
- Run `pytest backend/tests/test_ledger.py -q` and confirm missing ledger implementation failure.
- Implement `canonical_json`, `compute_entry_hash`, `append_entry`, `verify_chain`, and schema creation with constrained event types and action FK.
- Run the focused ledger tests, then full tests.

### Task 2: Transactional API integration

**Files:** Modify `backend/app/main.py`; modify `backend/tests/test_api.py`; test `backend/tests/test_ledger.py`.

- Add failing tests asserting action evaluation/approval ledger event ordering and verify endpoint behavior.
- Run the focused tests and confirm the expected missing endpoint/integration failure.
- Add explicit transaction handling, action snapshots, approval/rejection append events, list endpoint, and verification endpoint.
- Run all tests and inspect direct SQLite rows to prove integer amounts and event snapshots.

### Task 3: Safety note and acceptance proof

**Files:** Create `docs/reviews/2026-07-17-phase-3-ledger.md`.

- Record sections C and J results plus accepted MVP risks.
- Run full pytest, real HTTP verify-before/tamper/verify-after flow, `git diff --check`, and `git status`.
- Commit the implementation with a clear message and capture `git log --oneline`.
