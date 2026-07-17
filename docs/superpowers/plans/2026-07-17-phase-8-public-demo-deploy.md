# Phase 8 Public Demo Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AgentGuard deployable as a public seeded demo and add a paced live GPT-5.6 video runner.

**Architecture:** Environment parsing stays at application boundaries; initial seed and reset share an importable demo-seed module and one transactional service path. The frontend consumes one API base, while the video runner reuses the existing live-agent primitives and submits through HTTP.

**Tech Stack:** Python 3.11, FastAPI, SQLite, pytest, Next.js 15, TypeScript, Node test runner, Docker, Render Blueprint, Vercel.

## Global Constraints

- Backend only adds demo hardening; no general authentication or payment integration.
- Money remains integer minor units in persistence and policy math.
- Reset must commit the action state and hash-chained ledger together or roll back both.
- Frontend component colors use existing CSS variables only.
- Compose remains keyless and works without `.env`.
- Tests precede implementation for every behavior change.
- Do not print or commit secrets.

---

### Task 1: Transactional demo seed and reset

**Files:**
- Create: `backend/app/demo_seed.py`
- Modify: `backend/app/database.py`
- Modify: `backend/app/service.py`
- Modify: `scripts/seed_dashboard.py`
- Test: `backend/tests/test_demo_seed.py`
- Test: `backend/tests/test_dashboard_seed.py`

**Interfaces:**
- Produces: `seed_dashboard(connection: sqlite3.Connection, *, reset: bool) -> dict[str, Any]`
- Produces: service transaction helpers that accept an existing SQLite connection.

- [ ] **Step 1: Write failing tests for initial seed, reset, exact flagship data, valid chain, and rollback on injected failure.**
- [ ] **Step 2: Run `pytest backend/tests/test_demo_seed.py backend/tests/test_dashboard_seed.py -q` and confirm failures are caused by the missing module/API.**
- [ ] **Step 3: Extract canned data into `app.demo_seed`, add connection-aware service helpers, and implement reset under `BEGIN IMMEDIATE`.**
- [ ] **Step 4: Keep `scripts/seed_dashboard.py` as a thin wrapper and run the focused tests green.**
- [ ] **Step 5: Commit `feat: add transactional public demo reset foundation`.**

### Task 2: FastAPI production-demo settings

**Files:**
- Create: `backend/app/settings.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/dashboard.py`
- Test: `backend/tests/test_demo_api.py`
- Test: `backend/tests/test_dashboard.py`

**Interfaces:**
- Produces: `allowed_origins() -> list[str]`, `demo_mode_enabled() -> bool`, and `auto_reseed_seconds() -> float | None`.
- Produces: `POST /demo/reset` and optional lifespan reseeding.

- [ ] **Step 1: Write failing tests for default/custom CORS parsing, demo summary shape, reset 503/403/success responses, and background invocation.**
- [ ] **Step 2: Run the focused tests and confirm expected RED failures.**
- [ ] **Step 3: Implement settings helpers, app factory middleware configuration, constant-time reset-key validation, and the lifespan task.**
- [ ] **Step 4: Run focused tests and the existing API/ledger suite green.**
- [ ] **Step 5: Commit `feat: harden backend for public demo deployment`.**

### Task 3: Configurable frontend and demo intro band

**Files:**
- Create: `frontend/app/api-config.ts`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/tests/dashboard-utils.test.mjs`
- Modify: `frontend/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: `apiBaseUrl(environmentValue?: string) -> string` and demo-link metadata.
- Consumes: optional `demo` boolean from dashboard summary.

- [ ] **Step 1: Add failing Node tests for API URL fallback/normalization and exact demo links.**
- [ ] **Step 2: Run `pnpm test` and confirm RED failures.**
- [ ] **Step 3: Centralize all fetch URLs, extend the summary type, render the conditional intro band, and style only with CSS tokens.**
- [ ] **Step 4: Rename Docker build/runtime configuration to `NEXT_PUBLIC_API_URL`; run frontend tests and TypeScript/build checks.**
- [ ] **Step 5: Commit `feat: add configurable public demo frontend`.**

### Task 4: Render and Vercel deployment artifacts

**Files:**
- Create: `render.yaml`
- Create: `docs/DEPLOY.md`
- Modify: `backend/Dockerfile`
- Modify: `backend/docker-entrypoint.sh`
- Modify: `backend/.env.example`
- Modify: `README.md`
- Modify: `backend/tests/test_phase7_packaging.py`

**Interfaces:**
- Produces: backend-root Docker build and judge-facing deployment procedure.

- [ ] **Step 1: Add failing packaging tests for Render service configuration, backend-root Docker context, env declarations, deploy guide steps, and README placeholder.**
- [ ] **Step 2: Run the packaging tests and confirm RED failures.**
- [ ] **Step 3: Add the blueprint and documentation, update the container entrypoint to `python -m app.demo_seed`, and retain Compose compatibility.**
- [ ] **Step 4: Build both Docker services and run packaging tests green.**
- [ ] **Step 5: Commit `build: add Render and Vercel deployment artifacts`.**

### Task 5: Recording-friendly video runner

**Files:**
- Create: `scripts/demo_video.py`
- Create: `docs/VIDEO.md`
- Modify: `scripts/demo_hijack.py`
- Create: `backend/tests/test_demo_video.py`

**Interfaces:**
- Consumes: `build_agent_client`, `agent_turn`, and tool schema from `demo_hijack.py`.
- Produces: HTTP action requester, six-section runner, configurable pacing, and shot list.

- [ ] **Step 1: Write failing tests for default/custom pause, exact banner sequence, amount conversion, and API URL selection.**
- [ ] **Step 2: Run the focused tests and confirm RED failures.**
- [ ] **Step 3: Generalize the existing agent turn around an action callback, then implement the HTTP runner and bullet-only shot list.**
- [ ] **Step 4: Run script tests and existing intent/MCP tests green.**
- [ ] **Step 5: Commit `feat: add paced live video demo runner`.**

### Task 6: Full verification and safety review

**Files:**
- Create: `docs/reviews/2026-07-17-phase-8-public-demo.md`

**Interfaces:**
- Produces: acceptance evidence only; no new behavior.

- [ ] **Step 1: Run full `pytest` and `pnpm test`.**
- [ ] **Step 2: Run `pnpm build` with no API env and with `NEXT_PUBLIC_API_URL=https://api.example.invalid`.**
- [ ] **Step 3: Start a fresh local backend and capture wrong-key, right-key, summary, and ledger verification HTTP responses.**
- [ ] **Step 4: Run `scripts/demo_video.py` against the local backend with real configured GPT-5.6 credentials and capture all six sections.**
- [ ] **Step 5: Complete every fintech safety checklist section as PASS/FAIL/N/A with accepted demo risks.**
- [ ] **Step 6: Request independent code review, fix all Critical/Important findings, rerun impacted and full verification, then commit the review/documentation.**
- [ ] **Step 7: Confirm secret scan, clean Git status, and final conventional Git log.**
