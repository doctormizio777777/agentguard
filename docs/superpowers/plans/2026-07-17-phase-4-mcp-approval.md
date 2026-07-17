# Phase 4 MCP Server and Approval Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose AgentGuard's shared policy and ledger service through MCP with mission storage and a human approval loop.

**Architecture:** A service module owns all state-changing and read operations. FastAPI routes and official MCP FastMCP tools are thin adapters over that service. The MCP server uses streamable HTTP on port 8001 and the existing HTTP app remains on port 8000.

**Tech Stack:** Python 3.11+, FastAPI, SQLite, official MCP Python SDK, pytest.

## Global Constraints

- Backend only; do not touch frontend files.
- No LLM in Phase 4.
- Every action still passes through Phase 2 policy and Phase 3 ledger code.
- Integer `amount_cents` remains the only persisted money representation.
- Pending actions remain pending until the existing HTTP approval endpoint changes them.

### Task 1: Mission and shared service

**Files:** Create `backend/app/service.py`; modify `backend/app/database.py`, `backend/app/main.py`; test `backend/tests/test_missions.py`.

- Write failing mission and mission-snapshot tests.
- Run focused tests and observe missing schema/service failure.
- Add `missions(active)` schema, mission supersession, service action creation/status/policy functions, and route delegation.
- Run mission/API tests.

### Task 2: Official MCP server and tools

**Files:** Create `backend/app/mcp_server.py`, `backend/tests/test_mcp.py`; modify `backend/requirements.txt`.

- Write failing tests for all four tools, HTTP/MCP parity, and pending approval polling.
- Run focused tests and observe missing module/tool failure.
- Implement FastMCP tools with LLM-facing descriptions and streamable HTTP runner.
- Run all backend tests.

### Task 3: Demo and safety review

**Files:** Create `scripts/demo_mcp_client.py`, `docs/reviews/2026-07-17-phase-4-mcp-approval.md`.

- Write the official MCP client demo with 2-second polling and readable output.
- Run full pytest, start both servers, execute the demo, approve its pending ID through HTTP, verify ledger, inspect mission snapshot, and run `git diff --check`.
- Commit small conventional changes and capture `git log --oneline`.
