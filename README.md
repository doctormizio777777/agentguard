# AgentGuard — the intelligent firewall for AI agents. It knows if your agent is still yours.

**Live demo — start here:** [AgentGuard landing](https://agentguard-dusky.vercel.app) · [Mission Control console](https://agentguard-dusky.vercel.app/console) · [Run locally with Docker](#3-try-it-in-60-seconds)

## 1. The problem

AI agents act autonomously across payments, email, data, APIs, and system tools. Prompt injection can hijack that autonomy and make a legitimate agent serve an attacker. Static spend rules can cap money, but they cannot see whether the agent's intent still matches its mission. Gartner projects that 1 in 4 enterprise breaches will be traced back to AI agent abuse by 2028 ([source](https://www.gartner.com/en/newsroom/press-releases/2024-10-22-gartner-unveils-top-predictions-for-it-organizations-and-users-in-2025-and-beyond)).

## 2. What it does (the two-layer model)

**Deterministic policy floor.** Every high-risk action goes through integer-cent policy checks: transaction and daily caps, allowlists, approval thresholds, rate limits, export limits, and blocked command tokens. The floor is pure, testable, and deterministic.

**GPT-5.6 intent firewall.** When an agent has a mission, `gpt-5.6-sol` acts as a security analyst. It returns a structured `aligned`, `suspicious`, or `hijack_suspected` verdict with confidence and reasoning. Fusion fails closed: a hijack blocks, suspicious intent requires approval, and an unavailable intent layer never silently allows an action.

**Hash-chained tamper-evident ledger.** Every evaluation and human status transition is appended with canonical JSON, SHA-256, a previous hash, and a monotonic sequence. `GET /ledger/verify` recomputes the chain and reports the first broken entry.

**MCP server.** Agents can declare a mission, request an action, poll its status, and read the active policy through the official MCP Python SDK. MCP calls share the same service layer as HTTP; there is no second policy implementation.

**Mission Control dashboard.** The Next.js dashboard polls live actions, approvals, agent risk, blocked threats, and ledger integrity. A hijack-suspected event is expanded in red so the judge can see the failure mode immediately.

## 3. Try it in 60 seconds

Docker is the intended path. No `.env` file or OpenAI/OpenRouter key is required for the canned dashboard demo.

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) for the product story and live proof, then launch [Mission Control](http://localhost:3000/console). You will see:

1. Mission Control with the seeded agents and live KPI cards.
2. A red `HIJACK SUSPECTED` payment event expanded in the action feed.
3. Its mission, policy reasons, intent verdict, and confidence.
4. Pending actions in the human approval queue.
5. A verified SHA-256 audit chain.

The backend creates the SQLite schema on startup and seeds the canned dataset only when the ledger is empty. Restarting the service does not reset or duplicate an existing chain.

### Verify every claim

With the Compose stack running, execute [`scripts/verify_all.py`](scripts/verify_all.py):

```bash
python scripts/verify_all.py
```

It exercises health, seeded hijack evidence, a live policy block, the approval loop, and a reversible direct-SQL ledger tamper. The complete claim-by-claim transcript and code pointers are in [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

For the optional live hijack demo, copy `.env.example` to `backend/.env`, fill the OpenRouter credentials and model settings, then run:

```bash
python scripts/demo_hijack.py
```

The live demo is optional. Compose remains keyless because its seed verdicts are deterministic canned data.

## 4. Architecture

```text
AI agent
   |
   v
 MCP server -----> shared service layer
                         |
                         v
                 deterministic policy floor
                         |
                         v
                 GPT-5.6 intent firewall
                         |
                         v
              SQLite hash-chained ledger
                         |
                         v
                 Mission Control dashboard
```

Tech stack:

- Backend: Python 3.11, FastAPI, SQLite, Uvicorn.
- Safety: integer minor units, pure policy evaluation, fail-closed fusion, canonical JSON, SHA-256 chain.
- Agent access: official MCP Python SDK.
- Intent: OpenAI-compatible API, configured for `gpt-5.6-sol` when live credentials are supplied.
- Frontend: Next.js 15 App Router, TypeScript, Tailwind, CSS design tokens.
- Operations: Docker Compose, pip, pnpm.

## 5. How Codex and GPT-5.6 were used

Codex built the project gate-by-gate with TDD and real acceptance artifacts. The phase commits are:

- Phase 2 policy floor: `1d8072f`, spec `b08bdfe`.
- Phase 3 ledger: `79364a2`.
- Phase 4 MCP approval loop: `9a92623`, safety review `edd036c`.
- Phase 5 intent firewall: `2482036`, demo hardening `2565542`, safety review `98b0a83`.
- Phase 6 Mission Control: `9eabe76` backend and `ef286c5` frontend.

Codex accelerated the scaffolding, the real test suites (59 tests before the Phase 7 packaging checks), the transactional ledger design using `BEGIN IMMEDIATE`, and the MCP wiring over the shared service layer.

Human decisions were explicit: money is stored as integer minor units rather than floats; fusion is fail-closed; every phase is gated by real HTTP, test, build, and ledger artifacts; and the demo makes the poisoned action visible without requiring a live key.

At runtime, GPT-5.6 is the intent-firewall security analyst. It receives the declared mission and one proposed action, then returns structured verdict, confidence, and reasoning that are persisted with the action and ledger snapshot. A real firewall verdict exercised by the Phase 5 tests is:

```json
{
  "verdict": "hijack_suspected",
  "confidence": 0.99,
  "reasoning": "The proposed 5,000 EUR payment exceeds the 2,000 EUR daily budget and targets an unknown vendor rather than an approved API-credit vendor."
}
```

The demo agent also runs on GPT-5.6 in the optional live path. The no-key Compose path uses the same response shape with explicitly labelled `seed-canned-verdict` values.

## 6. Security posture

The fintech safety reviews are tracked in [`docs/reviews/`](docs/reviews/): [Phase 2](docs/reviews/2026-07-17-phase-2-policy-floor.md), [Phase 3](docs/reviews/2026-07-17-phase-3-ledger.md), [Phase 4](docs/reviews/2026-07-17-phase-4-mcp-approval.md), [Phase 5](docs/reviews/2026-07-17-phase-5-intent-firewall.md), and [Phase 6](docs/reviews/2026-07-17-phase-6-fintech-safety.md).

Accepted risks for this demo are deliberately visible:

- No authentication or authorization on approve/reject: the public demo is intentionally interactive and must never contain real actions or data.
- No idempotency keys yet: duplicate client submissions remain a known integration risk.
- Demo reset starts a new ledger epoch and discards prior synthetic history; append-only guarantees apply within each epoch.
- Fail-closed by design: an unavailable intent firewall moves an otherwise allowable action to human review.
- SQLite and local Docker volume: suitable for the demo, not a production deployment topology.

## 7. License

MIT. See [`LICENSE`](LICENSE).
