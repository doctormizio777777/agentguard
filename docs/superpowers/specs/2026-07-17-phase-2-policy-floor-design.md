# Phase 2 Policy Floor Design

## Goal

Create the backend data model and deterministic policy floor that evaluates every supported high-risk agent action before persistence.

## Scope

In scope: SQLite schema and default policy seed, a pure policy evaluator, agent/action CRUD endpoints required by the phase, approval transitions, and real pytest coverage. Out of scope: frontend changes, ledger/hash chaining, MCP, GPT-5.6, authentication, and payment-provider integrations.

## Data model

SQLite stores money only as integer minor units:

- `agents`: `id`, `name`, `declared_mission`, `created_at`.
- `actions`: `id`, `agent_id`, `action_type`, `amount_cents` nullable, `currency` default `EUR`, `counterparty`, `payload` JSON text, `status`, `policy_reason`, `created_at`.
- `policies`: `id`, `name`, `rules` JSON text, `active`, `created_at`.

`action_type` is constrained to `payment`, `email_send`, `data_delete`, `data_export`, `external_api_call`, and `system_command`. `status` is constrained to `allowed`, `pending_approval`, and `blocked`. Foreign keys are enabled.

The API accepts decimal EUR amounts at the boundary and converts them to cents before policy evaluation or persistence. Responses convert stored cents back to decimal EUR. No float participates in database writes or policy comparisons; conversion uses `Decimal` and rejects more than two fractional digits.

The seeded active policy stores cent values:

```json
{
  "per_transaction_cap": 100000,
  "daily_cap": 1000000,
  "merchant_allowlist": ["openai.com", "aws.amazon.com", "vercel.com", "github.com", "stripe.com"],
  "approval_threshold": 50000,
  "email_domain_allowlist": ["matteomisiani.studio"],
  "max_emails_per_hour": 20,
  "api_domain_allowlist": ["api.openai.com", "api.stripe.com", "api.github.com"],
  "export_max_records": 100,
  "blocked_commands": ["rm", "del", "drop", "shutdown", "format"]
}
```

## Policy engine

`backend/app/policy.py` exposes `evaluate(action, policy, context)`. It is a pure function: no database access, no globals, no clock reads, and no hidden state. The caller supplies current totals and counts through `context`.

It returns uppercase decisions (`ALLOW`, `PENDING_APPROVAL`, `BLOCK`) and every human-readable triggered reason. Decision precedence is `BLOCK` over `PENDING_APPROVAL` over `ALLOW`.

One shared function `decision_to_status` maps decisions to persisted statuses: `ALLOW` → `allowed`, `PENDING_APPROVAL` → `pending_approval`, `BLOCK` → `blocked`. Endpoint persistence and response logic use this function rather than duplicating literals.

## API

- `POST /agents` creates an agent.
- `POST /actions` converts the request amount to cents, builds context from SQLite, evaluates policy, persists the mapped status and reasons, and returns the decision.
- `GET /actions` filters by optional `agent_id`, `status`, and `action_type`, newest first.
- `POST /actions/{id}/approve` transitions only `pending_approval` to `allowed`.
- `POST /actions/{id}/reject` transitions only `pending_approval` to `blocked`.

Invalid input returns 4xx. Approval/rejection of a non-pending action returns `409`. Human decisions append to `policy_reason`.

## Testing

Tests use real policy logic and a temporary SQLite database. They cover all requested payment, email, deletion, export, external API, command, daily-cap, and approval cases. API tests assert HTTP statuses and persisted transitions.

