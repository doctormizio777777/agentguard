# Phase 8 Public Demo Deploy Design

## Objective

Prepare AgentGuard for a public demo with a Vercel-hosted frontend, a Render-hosted Docker backend, a protected deterministic reset path, and a paced live-video runner. Local Docker behavior remains keyless and reproducible.

## Chosen approach

Configuration is centralized at process boundaries. The frontend reads one `NEXT_PUBLIC_API_URL` value with a localhost fallback. The backend parses CORS, demo mode, reset key, and auto-reseed settings from environment variables through small typed helpers.

The dashboard seed becomes an importable backend module. The existing root seed script remains a thin CLI wrapper, and the container starts the importable module directly. This lets Render build from `backend/` without copying files from outside its Docker context.

Reset and initial seed both use the existing policy, intent-fusion, and ledger service path. A reset acquires `BEGIN IMMEDIATE`, clears demo rows in foreign-key order, restores the default policy, recreates missions and actions, verifies the resulting chain, and commits only if verification succeeds. Requests either observe the old complete dataset or the new complete dataset; a partial reseed never commits.

The auto-reseed task is optional and owned by the FastAPI lifespan. It sleeps for the configured interval, runs the same reset function in a worker thread, and is cancelled cleanly at shutdown. The default is off.

## Alternatives considered

1. Run `scripts/seed_dashboard.py` as a subprocess from the API. Rejected because Render's requested `backend/` Docker context cannot include the root script cleanly, and subprocess reseeding cannot share one atomic transaction.
2. Delete rows, then call the current seed script action by action. Rejected because a mid-seed failure would leave a partially reset public demo.
3. Replace the SQLite file with a temporary seeded file. Rejected because file swapping while concurrent connections are active is more operationally fragile than SQLite's native serialized writer transaction.

## Backend behavior

- `ALLOWED_ORIGINS` is a comma-separated list. Its default is `http://localhost:3000,http://localhost:3001`.
- `DEMO_RESET_KEY` is required for reset. If it is unconfigured, `POST /demo/reset` returns 503. A missing or mismatched `X-Demo-Key` returns 403. Comparison uses `secrets.compare_digest`.
- A successful `POST /demo/reset` returns the seed counts plus the complete ledger verification result.
- `AUTO_RESEED_MINUTES` accepts a positive number and defaults to disabled. Invalid or non-positive values fail startup rather than silently changing behavior.
- `DEMO_MODE=true` adds `"demo": true` to `GET /dashboard/summary`; otherwise the field is omitted.
- The reset endpoint does not add general authentication. Existing approve/reject behavior remains unchanged by design.

## Frontend behavior

All dashboard requests use a single exported API base derived from `NEXT_PUBLIC_API_URL`, falling back to `http://localhost:8000`. When summary data contains `demo: true`, a compact band appears below the header with the specified tagline, one explanatory sentence, and links to the repository, verification document, and local-run README section.

The visual treatment extends the existing security-room design: restrained accent border, existing surface tokens, compact uppercase link chips, no new dependency, no new font, and no layout restructure. The band is absent outside demo mode and remains below 90px at desktop widths.

## Deployment artifacts

`render.yaml` defines one Docker web service rooted at `backend/`, exposes health checking on `/health`, and declares public configuration plus non-synchronized secrets. `docs/DEPLOY.md` documents backend-first deployment, frontend deployment, the final CORS update, reset use, and expected verification payloads. The README gets a live-demo placeholder without inventing deployment URLs.

## Video runner

`scripts/demo_video.py` imports the OpenAI client and agent-turn primitives from `scripts/demo_hijack.py`, but sends authorized actions to the HTTP API selected by `API_URL`. The runner ensures `procurement-bot` exists, declares the mission, and performs the six required sections. ANSI banners, explicit amount/counterparty lines, and `DEMO_PAUSE_SECONDS` make the transcript recordable. The default pause is four seconds; zero is valid for automated acceptance runs.

The runner never prints credentials. It prints the real policy reasons, structured intent verdict, full reasoning, ledger verification, and risk response returned by the backend.

## Testing and evidence

- Backend tests cover environment parsing, demo summary, reset authorization, atomic rollback, canonical reseed content, valid ledger, and auto-reseed invocation.
- Frontend tests cover API URL selection and demo-band link metadata; packaging tests prevent hardcoded legacy env names.
- Script tests exercise banner/pause formatting and HTTP payload conversion without mocking policy logic.
- Acceptance runs include full pytest, frontend tests, Next builds with and without a dummy `NEXT_PUBLIC_API_URL`, local reset curl proof, and a real GPT-5.6 video transcript.

## Safety boundaries

This is still a public demo, not a production money system. No payment is executed. No auth is added to approve/reject by explicit requirement. The reset key protects only destructive demo reseeding. Known risks remain documented: no general auth, no idempotency keys, and SQLite single-instance deployment.
