# Phase 6.5 Mission Control Visual Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while implementing each behavior and superpowers:verification-before-completion before reporting success.

**Goal:** Make the existing dashboard visually judge-ready with a deterministic flagship hijack and restrained live security-product motion.

**Architecture:** Preserve the existing page and API requests. Add a tested pure client utility module for hourly series and sparkline geometry, then consume it from the current dashboard component. Keep visual primitives and motion in the existing tokenized global stylesheet.

**Tech Stack:** Python 3.11, SQLite, pytest, Next.js 15, React 19, TypeScript 5.8, CSS variables, Node built-in test runner.

## Global Constraints

- Do not change dashboard layout, endpoints, request payloads, or approval logic.
- Do not add npm dependencies.
- Use CSS variables for every color, surface, shadow, and motion constant.
- Use Inter only and respect reduced-motion preferences.

---

### Task 1: Lock the deterministic seed contract

**Files:**
- Create: `backend/tests/test_dashboard_seed.py`
- Modify: `scripts/seed_dashboard.py`

- [ ] Write an integration test that runs `scripts/seed_dashboard.py` against a temporary database and asserts the blocked hijack, pending gift-card action, exact intent confidence values, required reasoning concepts, mission text, and a valid 15-entry ledger.
- [ ] Run `pytest tests/test_dashboard_seed.py -v` from `backend` and confirm it fails because the gift-card confidence/status and hijack reasoning do not match.
- [ ] Add a demo-only policy configurator, update both canned verdicts, and keep the production default policy untouched.
- [ ] Rerun the focused test and the full backend suite.

### Task 2: Build tested sparkline utilities

**Files:**
- Create: `frontend/app/dashboard-utils.ts`
- Create: `frontend/tests/dashboard-utils.test.mjs`
- Modify: `frontend/package.json`

- [ ] Write Node tests for twelve UTC hourly buckets, metric-specific aggregation, out-of-window exclusion, and deterministic SVG point output.
- [ ] Run `pnpm test` and confirm it fails because the utility module does not exist.
- [ ] Implement typed `buildHourlySeries` and `sparklinePoints` pure functions without dependencies.
- [ ] Rerun `pnpm test` and confirm all utility tests pass.

### Task 3: Elevate the existing dashboard

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/globals.css`

- [ ] Consume the tested hourly utilities for four inline SVG sparklines.
- [ ] Add first-load counters, visibility-aware LIVE/PAUSED state, initial/new-row animation state, and animated risk gauges with threshold ticks.
- [ ] Reshape only the content inside the existing hijack detail into verdict, confidence, reasoning, mission, and model-chip elements while preserving automatic expansion and all approval controls.
- [ ] Add the tokenized depth, hierarchy, danger treatment, and reduced-motion CSS.
- [ ] Run `pnpm test` and `pnpm build`.

### Task 4: Prove the rendered result

**Files:**
- Runtime only; no source file required.

- [ ] Reseed a clean local SQLite database and print the two target rows plus `verify_chain` output.
- [ ] Start backend and frontend, inspect the page in the browser at desktop and mobile widths, and confirm the expanded hijack is the visual focal point.
- [ ] Run the full pytest suite and final Next.js production build from a clean command.
- [ ] Review `git diff`, scan for hardcoded JSX colors, commit in one or two conventional commits, and print `git log --oneline`.

