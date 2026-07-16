# Fintech Safety Review — Phase 2 Policy Floor

## Scope

This phase adds deterministic pre-action policy evaluation, SQLite action persistence, and human approval transitions. It does not execute payments, call a PSP, maintain balances, or write the Phase 3 hash-chained ledger.

## Reviewer(s)

Codex — 2026-07-17

## Results

| Section | Status | Notes |
|---|---|---|
| A. Money representation | PASS | Money is accepted as Decimal at the API boundary, converted to integer `amount_cents`, compared as integers, and persisted as SQLite `INTEGER`. Currency is explicit and defaults to EUR. |
| B. Idempotency | N/A — accepted risk | Phase 2 creates policy records and does not move funds. Add idempotency before any real money-moving endpoint. |
| C. Ledger correctness | N/A — Phase 3 | No balance or ledger mutation is implemented in this phase. |
| D. State machine | PASS | New actions map to `allowed`, `pending_approval`, or `blocked`; approval/rejection is permitted only from `pending_approval`, with a tested 409 for invalid transitions. |
| E. Authentication & authorization | N/A — accepted risk | Authentication is explicitly out of MVP scope. Add ownership and authorization before exposing this API beyond local demo use. |
| F. External system reconciliation | N/A | No external payment or bank system exists in this phase. |
| G. Webhooks | N/A | No webhook receiver exists. |
| H. Crypto-specific | N/A | No crypto path exists. |
| I. Credit / BNPL-specific | N/A | No credit product exists. |
| J. Audit log | N/A — Phase 3 | Policy reasons are stored with actions; append-only hash chaining is explicitly deferred to Phase 3. |
| K. Observability & alerts | N/A — accepted risk | Local Uvicorn logs and pytest evidence exist; production structured logging and alerts are deferred. |
| L. Secrets & access | PASS | No provider credentials or secrets were added. |
| M. Runbooks | N/A — accepted risk | No production payment operations exist yet. |
| N. Compliance / regulatory | N/A — accepted risk | No real money movement or customer onboarding exists yet. |

## Required before deploy

- [ ] Add idempotency keys before any endpoint can execute or retry a real payment.
- [ ] Add authentication, authorization, and agent ownership checks before non-local exposure.
- [ ] Add the append-only hash-chained ledger and tamper verification in Phase 3.
- [ ] Add structured money-path logs, alerts, reconciliation, and operational runbooks before production payment use.

## Accepted risks

- Phase 2 has no authentication or idempotency because both are outside the approved MVP scope; owner: product human; mitigation: block production deployment until the required checklist items are implemented.
- The policy engine stores human-readable reasons but not a tamper-evident audit chain; owner: product human; mitigation: Phase 3 ledger must record policy decisions before execution.

## Evidence

- Full pytest: 24 passed.
- SQLite inspection: `amount_cents` has type `INTEGER`; a €5,000 action is stored as `(500000, 'integer')`.
- Real HTTP flows: €5,000 payment BLOCK, `rm -rf /data` BLOCK, €700 payment PENDING_APPROVAL then approve → allowed.
