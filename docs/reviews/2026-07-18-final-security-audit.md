# Final Security & Exposure Audit — Public Hackathon Submission

Date: 2026-07-18

Reviewer: Codex

Scope: public GitHub history, live Render backend, live Vercel frontend, and a report-only backend code review.

## Executive verdict

No exposed secret and no new high-impact vulnerability were found. The deployment is acceptable only as the existing synthetic public hackathon demo. It remains explicitly unsuitable for real money, private data, or production use because anonymous state changes, missing idempotency/rate limiting, destructive demo reseeds, and incomplete production observability are accepted demo risks.

No application code was changed during this audit. The only repository change is this report.

## 1. Secret exposure — complete public Git history

### Coverage

- Fetched and pruned every public remote ref before scanning. GitHub exposed only `refs/heads/main` at `a21ae677aefe0e1332c7d48c7271006e152fe97e`.
- Scanned all 33 commits reachable from `origin/main` and all local refs. The old phase branch is fully merged into `main`.
- Used both tree scans (`git grep` at every commit) and full patch-history scans (`git log --all -p --full-history`).
- High-confidence detectors covered OpenAI/OpenRouter, GitHub, Render, AWS, Google, Stripe, Slack, JWT, bearer token, private-key, credential-bearing URL, database-credential URL, and sensitive query-string formats.
- Compared the current local `OPENAI_API_KEY` value against every historical tree without printing the value. It was absent from history.
- Searched every historical path and reachable object for real `.env`, `data/`, `*.db`, `*.sqlite`, and `*.sqlite3` files.

### Real output

```text
Commits scanned with git grep: 33
PASS [OpenRouter/OpenAI key]: 0 matches
PASS [GitHub PAT]: 0 matches
PASS [Render token]: 0 matches
PASS [Bearer token]: 0 matches
PASS [Credential-bearing URL]: 0 matches
PASS [Private key material]: 0 matches
High-confidence commit/path matches total: 0
PASS git log -p [OpenRouter/OpenAI key]: 0 matches
PASS git log -p [GitHub PAT]: 0 matches
PASS git log -p [Render token]: 0 matches
PASS git log -p [Bearer token]: 0 matches
PASS git log -p [Credential-bearing URL]: 0 matches
PASS git log -p [Private key material]: 0 matches
PASS exact local value absent from Git history for variable OPENAI_API_KEY
Exact local-secret matches total: 0
```

```text
Extended detectors across 33 commits:
PASS [AWS access key]: 0 matches
PASS [Google API key]: 0 matches
PASS [Stripe live secret]: 0 matches
PASS [Slack token]: 0 matches
PASS [GitHub token family]: 0 matches
PASS [JWT]: 0 matches
PASS [Sensitive URL query]: 0 matches
PASS [Database URL credentials]: 0 matches
Extended detector total matches: 0
```

```text
PASS .env.example OPENAI_API_KEY uses placeholder/empty value
PASS .env.example contains no real-looking secret values
PASS backend/.env.example OPENAI_API_KEY uses placeholder/empty value
PASS backend/.env.example DEMO_RESET_KEY uses placeholder/empty value
PASS backend/.env.example contains no real-looking secret values
PASS: backend/.env, all real .env files, data/, and *.db/*.sqlite were never committed in reachable history
```

The only historical files named like environment files are `.env.example` and `backend/.env.example`. Both contain placeholders. Historical `DEMO_RESET_KEY` references are limited to placeholder configuration, runtime reads, tests, and documentation; no real `.env` was ever committed. The live reset secret was neither retrieved nor printed.

## 2. Public surface — Render backend

Live origin: `https://agentguard-api-0xz1.onrender.com`

### Endpoint inventory and anonymous impact

FastAPI exposes 14 application routes plus four default documentation routes. CORS middleware also handles `OPTIONS` preflight requests; those are not independent business operations.

| Method | Path | Anonymous effect | Assessment |
|---|---|---|---|
| GET | `/health` | Returns a fixed health object. | No state change or sensitive data. |
| GET | `/agents` | Returns synthetic agent identities, missions, and risk scores used by the public dashboard. | Public demo data only. Do not place private missions here. |
| POST | `/agents` | Creates a synthetic agent row. | Anonymous demo mutation; can add noise until the periodic reset. No payment executes. |
| POST | `/actions` | Evaluates policy/intent, persists an action, and appends a ledger event. | Intended `request_action` interaction. It never executes a payment, but anonymous volume can consume demo storage; do not add a live LLM key without auth/rate limits. |
| POST | `/agents/{agent_id}/mission` | Supersedes the active mission while retaining mission history. | Intended mission-declaration interaction, but an anonymous visitor can alter a known demo agent until reset. |
| GET | `/agents/{agent_id}/mission` | Reads the active synthetic mission. | Public demo data only. |
| GET | `/agents/{agent_id}/risk` | Reads deterministic risk telemetry. | No state change. |
| GET | `/actions` | Reads action status, reasons, payload, mission, and intent verdict. | Required by the public dashboard. Visitor-submitted payloads become public; never submit secrets or private data. |
| POST | `/actions/{action_id}/approve` | Changes only a pending synthetic action to `allowed` and appends `action_approved`. | Explicitly intended demo interaction; no provider or money execution exists. |
| POST | `/actions/{action_id}/reject` | Changes only a pending synthetic action to `blocked` and appends `action_rejected`. | Explicitly intended demo interaction; no provider or money execution exists. |
| GET | `/ledger` | Returns the public hash-chain entries and snapshots. | Synthetic audit data only. |
| GET | `/ledger/verify` | Recomputes chain integrity. | CPU/read-only; current chain is valid. |
| GET | `/dashboard/summary` | Returns public aggregate demo metrics. | No state change. |
| POST | `/demo/reset` | Replaces the current synthetic demo epoch when the correct secret is supplied. | Destructive by design, but guarded by a high-entropy header and constant-time comparison. Wrong-key test returned 403. |
| GET | `/openapi.json` | Publishes the API schema. | Intentional discoverability; no secret values. |
| GET | `/docs` | Publishes Swagger UI. | Intentional public demo documentation. |
| GET | `/docs/oauth2-redirect` | FastAPI documentation helper. | No business state change. |
| GET | `/redoc` | Publishes ReDoc. | Intentional public demo documentation. |

### Live reset protection

Only a deliberately wrong key was sent. The real value was never read or logged.

```text
POST /demo/reset
HTTP 403
{"detail":"invalid demo reset key"}
```

The implementation uses `secrets.compare_digest` at `backend/app/main.py:309` and returns `503` when no reset key is configured.

### Error handling and response exposure

A malformed POST body forced a validation error without creating state:

```text
POST /actions
HTTP 422
{"detail":[{"type":"json_invalid","loc":["body",1],"msg":"JSON decode error","input":{},"ctx":{"error":"Expecting property name enclosed in double quotes"}}]}
PASS: no secret names, stack trace, .env marker, or internal path in error response
```

The audit also sampled `/health`, `/agents`, `/actions?limit=1000`, `/ledger?limit=1000`, `/ledger/verify`, `/dashboard/summary`, `/openapi.json`, `/docs`, `/redoc`, and an unknown route. No response contained an API-key pattern, `OPENAI_API_KEY`, `DEMO_RESET_KEY`, a stack trace, `.env` marker, Windows path, or container workspace path.

```text
GET /health -> HTTP 200 bytes=15
GET /agents -> HTTP 200 bytes=494
GET /actions?limit=1000 -> HTTP 200 bytes=10692
GET /ledger?limit=1000 -> HTTP 200 bytes=11493
GET /ledger/verify -> HTTP 200 bytes=73
GET /dashboard/summary -> HTTP 200 bytes=169
GET /openapi.json -> HTTP 200 bytes=11190
GET /docs -> HTTP 200 bytes=1022
GET /redoc -> HTTP 200 bytes=904
GET /definitely-not-a-route -> HTTP 404 bytes=22
PASS: no secret, env-name, stack-trace, or internal-path markers in sampled public responses
```

Current live state:

```json
{"status":"ok"}
{"actions_today":15,"spend_today_cents":20000,"pending_count":7,"blocked_count":1,"agents_online":3,"threats_blocked":1,"ledger":{"entries":15,"valid":true},"demo":true}
{"valid":true,"entries_checked":15,"first_broken_seq":null,"reason":null}
```

### CORS

Production is stricter than the requested Vercel-plus-localhost set: only the exact production Vercel origin is allowed. Localhost and an unrelated origin receive no `Access-Control-Allow-Origin`; there is no wildcard.

```text
Origin=https://agentguard-dusky.vercel.app HTTP=200 ACAO=access-control-allow-origin: https://agentguard-dusky.vercel.app
Origin=http://localhost:3000 HTTP=200 ACAO=(absent)
Origin=https://evil.example HTTP=200 ACAO=(absent)

OPTIONS /actions Origin=https://agentguard-dusky.vercel.app -> HTTP 200 ACAO=access-control-allow-origin: https://agentguard-dusky.vercel.app
OPTIONS /actions Origin=http://localhost:3000 -> HTTP 400 ACAO=(absent)
OPTIONS /actions Origin=https://evil.example -> HTTP 400 ACAO=(absent)
```

CORS is not authentication: direct HTTP clients can still call public POST routes. That exposure is deliberate for this synthetic demo and is covered under accepted risks.

## 3. Public surface — Vercel frontend

Live origin: `https://agentguard-dusky.vercel.app`

### Fresh local production build

```text
▲ Next.js 15.5.9
Creating an optimized production build ...
✓ Compiled successfully in 678ms
✓ Generating static pages (4/4)
Route (app)                                 Size  First Load JS
┌ ○ /                                    5.12 kB         107 kB
└ ○ /_not-found                            994 B         103 kB
```

The public `.next/static` tree contained 24 files, zero `.map` files, zero `sourceMappingURL` references, and no high-confidence secret pattern. Frontend source references only `NEXT_PUBLIC_API_URL`; no backend-only environment variable is read by frontend code.

### Live client-bundle scan

The live HTML and all six referenced JavaScript chunks were downloaded and scanned with `rg`. The expected Render origin appeared only in the page chunk. No environment identifier or secret marker was present.

```text
Assets scanned with rg: 7 (HTML + 6 JS chunks)
PASS [OpenAI/OpenRouter key]: 0 assets
PASS [GitHub token]: 0 assets
PASS [Render token]: 0 assets
PASS [Credential URL]: 0 assets
PASS [Private key]: 0 assets
PASS [Backend-only env name]: 0 assets
PASS [Public env identifier]: 0 assets
Expected public Render URL assets=1: /_next/static/chunks/app/page-496463c1338702b8.js
sourceMappingURL assets=0
PASS: deterministic rg scan found only the expected public API URL and no sensitive markers
```

Direct requests for `<chunk>.js.map` returned no HTTP 200 responses for all six chunks. No frontend source file contains a hardcoded secret.

## 4. Backend code review

### SQL injection

PASS. Request-derived values are bound with SQLite parameters. The only SQL string construction is structurally constrained:

- `backend/app/main.py:241-247` assembles filter clauses from three fixed strings; all values and `limit` remain parameters.
- `backend/app/database.py:112` interpolates migration column names and definitions from a fixed in-code tuple.
- `backend/app/demo_seed.py:146-150` interpolates table names from a fixed in-code tuple used only by the key-protected/automatic demo reset.

No request value is interpolated into SQL identifiers or statements.

### Path traversal and command execution

PASS. No endpoint accepts, opens, serves, or executes a user-supplied filesystem path. The only application `Path` constructs the server-controlled default SQLite location at `backend/app/database.py:10`. There is no `FileResponse`, `StaticFiles`, upload handler, subprocess call, `shell=True`, `eval`, or `exec` in `backend/app`.

### POST-body validation

PASS for policy-critical types; ACCEPTED-RISK for abuse limits.

- `action_type` is a closed `Literal` union.
- HTTP money input is `Decimal`, rejects negatives, and rejects more than two decimal places.
- Service and MCP boundaries require `amount_cents` to be a non-negative Python `int`, explicitly rejecting booleans, and require payment amounts.
- `counterparty`, agent names, and mission strings reject empty values; query pagination has explicit limits.
- Per-action `payload` remains a generic JSON object, and strings/payloads do not have maximum lengths. There is no app-level request rate limit or body quota. On a public unauthenticated service, a visitor can create noise or temporary resource pressure until the hourly reset. This is part of the already accepted demo-only availability risk, not acceptable for production.

### Integer money handling

PASS. SQLite stores `actions.amount_cents` as `INTEGER` (`backend/app/database.py:58`). HTTP decimal EUR is multiplied by `Decimal(100)`, checked for integral cents, and converted to `int` at `backend/app/main.py:328-334`. The service rejects non-integer cents at `backend/app/service.py:110-113`. Policy totals and caps operate on integers. `Decimal` is used only at boundaries/reason formatting; frontend `Number` conversion is display/graph code and never feeds persistence or policy math.

### Atomic audit and ledger integrity

PASS inside each demo epoch. Action creation and approval/rejection begin `BEGIN IMMEDIATE`, mutate action state, and call `append_entry` through the same SQLite connection before context-manager commit (`backend/app/service.py:85-185`, `backend/app/service.py:193-210`). A ledger failure rolls the entire transaction back. The current live chain verifies as valid.

The key-protected periodic demo reset intentionally deletes the old synthetic epoch. This is an existing accepted risk, not an append-only production archive.

### Fail-closed intent fusion

PASS. There is no environment variable or configuration branch that disables the intent firewall into fail-open behavior.

- Missing provider configuration, timeout, malformed output, or any judge exception becomes a generic unavailable verdict (`backend/app/service.py:151-152`).
- If the policy would `ALLOW`, missing mission or unavailable intent escalates to `PENDING_APPROVAL` (`backend/app/service.py:350-357`).
- A policy `BLOCK` is absolute, and `hijack_suspected` also blocks (`backend/app/service.py:365-366`).
- The public Render manifest sets model/base URL metadata but does not provision `OPENAI_API_KEY`. The canned seed needs no key. Do not add a live model key to this anonymous service without authentication and rate limiting because public action volume could create model cost.

## 5. Fintech safety checklist delta

This audit re-ran every section of the fintech checklist. The full phase posture remains documented in `docs/reviews/2026-07-17-phase-8-public-demo.md`; no prior accepted risk was upgraded to safe. `FAIL` below means the system remains blocked for production/real-money use; the existing review accepts those items only for this synthetic hackathon deployment.

| Section | Status | Audit conclusion |
|---|---|---|
| A. Money representation | PASS | Integer cents in storage and policy math; decimal/string only at boundaries. |
| B. Idempotency | FAIL | No idempotency keys; blocks real-money use. |
| C. Ledger correctness | FAIL | Atomic hash-chain per demo epoch; reset deliberately deletes old synthetic history; no double-entry money ledger. |
| D. State machine | PASS | Only pending actions transition; each transition appends a ledger event atomically. |
| E. Authentication & authorization | FAIL | Business endpoints are anonymous by public-demo design; no real provider or private data may be connected. |
| F. External reconciliation | N/A | No PSP, bank, or settlement source exists; reconciliation is required before adding one. |
| G. Webhooks | N/A | No inbound webhook surface exists. |
| H. Crypto | N/A | No custody or blockchain path exists. |
| I. Credit/BNPL | N/A | No credit path exists. |
| J. Audit log | FAIL | Action events are hash-chained, but actor/IP/request ID/access logging/retention and cross-reset history are absent. |
| K. Observability | FAIL | Health and chain status exist; no production security alerts, request IDs, or rate-limit telemetry. |
| L. Secrets & access | PASS | No secrets in Git history or client assets; reset uses a Render secret and constant-time comparison. |
| M. Runbooks | FAIL | Demo deployment/reset instructions exist; production incident and key-compromise runbooks do not. |
| N. Compliance | N/A | No regulated payment, custody, credit, onboarding, KYC, AML, or sanctions workflow exists. |

## 6. Final verdict

| AREA | STATUS | EVIDENCE |
|---|---|---|
| GitHub secret history | PASS | 33/33 commits scanned with tree and patch detectors; zero high-confidence secret matches; current local API key exact value absent. |
| Historical `.env`, data, and DB files | PASS | Only placeholder `.env.example` files exist; no real `.env`, `data/`, `*.db`, `*.sqlite`, or `*.sqlite3` object/path in reachable history. |
| Example environment files | PASS | Secret fields are placeholders; no usable credential. |
| Render reset secret | PASS | Wrong key returned HTTP 403; comparison is constant-time; real key was never retrieved or printed. |
| Render response leakage | PASS | Sampled all read surfaces plus validation and 404 errors; no key, env-name, stack, `.env`, or internal-path marker. |
| Render CORS | PASS | Exact Vercel origin allowed; localhost and hostile origin denied; no wildcard. Production is stricter than the requested set. |
| Anonymous demo mutations | ACCEPTED-RISK | Agents, missions, actions, approvals, and rejections are public by design. They affect synthetic SQLite state only and reset periodically. |
| Public payload visibility | ACCEPTED-RISK | `/actions` is intentionally public; submitted payload/mission data must be synthetic and non-secret. |
| Rate limiting / abuse resistance | ACCEPTED-RISK | No auth, rate limit, body quota, idempotency, or production alerting. Do not attach real money, private data, or a billable live LLM key. |
| Vercel client bundle | PASS | Fresh production build plus seven live assets scanned; only expected Render URL exposed; no secret/env marker. |
| Vercel source maps | PASS | Zero local public `.map` files, zero source-map references, and zero live chunk-map HTTP 200 responses. |
| SQL injection / path traversal | PASS | Request values parameterized; dynamic SQL identifiers are fixed tuples; no user-controlled filesystem or command surface. |
| POST validation | ACCEPTED-RISK | Policy-critical enum/decimal/integer checks are present; generic payload and string size/rate limits remain demo-only gaps. |
| Integer cents | PASS | SQLite `INTEGER`, Python `int`, `Decimal` boundary conversion; no float money enters DB/policy math. |
| Fail-closed fusion | PASS | No disable switch; missing mission/provider escalates ALLOW to pending; policy BLOCK and hijack remain BLOCK. |
| Ledger | ACCEPTED-RISK | Current live chain valid; action writes are atomic, but demo reset intentionally starts a new destructive epoch. |

## Submission constraints

1. Keep the Render service synthetic and public-demo-only.
2. Do not add `OPENAI_API_KEY` to the anonymous public backend without authentication, authorization, rate limiting, quotas, and cost alerts.
3. Never submit secrets, personal data, or customer data in agent names, missions, counterparties, or payloads because read endpoints are public.
4. Do not represent `allowed` as payment execution; there is no payment provider integration.
5. Before any real-money deployment, resolve the blocking controls already listed in `docs/reviews/2026-07-17-phase-8-public-demo.md`: auth/ownership, idempotency, retained audit history, observability, incident response, double-entry accounting, and reconciliation.
