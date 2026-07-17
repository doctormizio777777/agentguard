# Phase 7 Ship Design

## Scope

Package the existing AgentGuard backend and Next.js Mission Control dashboard for a clean, one-command local demo. Docker startup will create the SQLite schema and seed the canned dashboard dataset only when the database has no ledger entries. No live model call, authentication, payments integration, or new product behavior is added.

## Runtime design

- `docker-compose.yml` defines `backend` on port 8000 and `frontend` on port 3000.
- The backend image runs an entrypoint that initializes the schema and invokes the existing deterministic seed only for an empty ledger, then starts Uvicorn.
- The frontend image uses a multi-stage Next.js production build and receives `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` at build/runtime.
- The seed keeps the existing canned intent verdicts, so Compose has no required API key.

## Documentation and hygiene

The root README is rewritten around the requested eight-section story, including exact phase commit references, runtime GPT-5.6 behavior, accepted demo risks, and clean-start commands. MIT licensing, Docker ignore files, and a tracked `.env.example` are added or corrected. Verification covers Docker clean state, HTTP health/summary/actions, pytest, frontend build, secret scan, and clean Git status.

