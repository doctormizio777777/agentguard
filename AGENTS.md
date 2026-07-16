# Agent Payment Guardrail — AGENTS.md

## What this is
A safety + audit layer that lets any AI agent (using GPT-5.6) make autonomous payments without going rogue. Components: an MCP server, a policy engine (per-transaction + daily spend limits, merchant allowlist, human-in-the-loop approval threshold), a tamper-evident hash-chained audit ledger, and a Next.js dashboard. Built for OpenAI Build Week — Developer Tools track.

## Stack (do not deviate without asking)
- Backend: Python 3.11+, FastAPI, SQLite. MCP server via the official MCP Python SDK.
- Frontend: Next.js 15 (App Router), TypeScript, Tailwind. CSS variables/design tokens only — no hardcoded hex in components.
- LLM: GPT-5.6 via the OpenAI API for agent reasoning + natural-language risk explanations.
- Package mgmt: pip + requirements.txt (backend), pnpm (frontend).

## How to work
- Implement ONE component at a time. After each, prove it works and STOP for review.
- Never report a task complete without pasting real proof: actual command output, curl responses with HTTP status, test results, file tree.
- Clean, readable git history with clear commit messages — it's part of how this project is judged.
- Small, well-named functions. Type everything (Python type hints, TS strict).

## GPT-5.6 usage (central, not decorative)
GPT-5.6 must be genuinely core:
- A demo agent that reasons about purchases and calls the payment tools.
- A natural-language explanation for every policy decision (why blocked / why approved).
- Optional transaction risk-scoring.
Log GPT-5.6 prompts/decisions so they can be shown in the demo and README.

## Security / correctness (this is the whole point)
- The ledger is append-only. Each entry stores the hash of the previous entry. Tampering with any row MUST break the chain — include a verify function and a test proving a modified row is detected.
- Policy checks run BEFORE any payment is recorded as executed.
- Payments above the approval threshold go to "pending_approval", never auto-execute.

## README (judged heavily)
Keep README.md with: Overview, Architecture, Setup/run, Demo steps, and a "How I built this with Codex + GPT-5.6" section describing where Codex accelerated the work and where I (the human) made the key decisions.

## Don't
- Don't ask me clarifying questions for reasonable defaults — decide, proceed, and note the assumption.
- Don't add auth, real payment-provider integrations, or extra infra beyond the MVP unless I ask.
- No secrets in code. Use a gitignored .env.
