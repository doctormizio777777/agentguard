# Fintech Safety Review — Phase 8 Public Demo Deployment

## Scope

Review of configurable public deployment, protected demo reset, periodic reseed, and the live video runner. Phase 8 still records simulated authorization decisions only: it does not execute payments, maintain balances, or integrate a payment provider.

## Reviewer(s)

Codex, 2026-07-17

## Results

| Section | Status | Notes |
|---|---|---|
| A. Money representation | PASS | SQLite and policy math remain integer `amount_cents`. The HTTP/video boundary converts cents to a decimal string; display formatting never feeds persistence. |
| B. Idempotency | FAIL | `POST /actions`, approve/reject, and reset do not accept idempotency keys. Duplicate action requests remain possible and block production use. |
| C. Ledger correctness | FAIL | Action events remain atomic and hash-chained within one demo epoch, but `POST /demo/reset` intentionally deletes the demo ledger before creating a new valid chain. There is no double-entry money ledger because no funds move. |
| D. State machine | PASS | Existing approve/reject guards remain unchanged: only pending actions can transition, and every transition appends an event in the same transaction. Reset is a separate demo administration operation. |
| E. Authentication & authorization | FAIL | Reset has a constant-time compared secret header, but approve/reject and reads remain unauthenticated by explicit public-demo design. This blocks real-data or production exposure. |
| F. External system reconciliation | N/A | No PSP, bank, balance, or settlement system exists in this demo. |
| G. Webhooks | N/A | No inbound financial webhooks exist. |
| H. Crypto-specific | N/A | No crypto custody or transfer path exists. |
| I. Credit / BNPL-specific | N/A | No underwriting, credit, installments, interest, or collections exist. |
| J. Audit log | FAIL | Every action/transition is audited atomically within an epoch, but reset intentionally destroys prior demo history. Actor identity, request ID, IP, retention, and audit-log access logging are absent. |
| K. Observability & alerts | FAIL | Health and chain integrity are visible, but there are no production request IDs, structured security logs, alerts, or reset-failure monitoring. |
| L. Secrets & access | PASS | `.env` remains ignored; Render receives `DEMO_RESET_KEY` via `sync:false`; the runner reads `backend/.env` without printing credentials. Secret rotation is not production-grade. |
| M. Runbooks | FAIL | Deployment/reset instructions exist, but production incident, key compromise, reconciliation, and outage runbooks do not. |
| N. Compliance / regulatory | N/A | The demo executes no regulated payment, custody, credit, KYC, AML, or sanctions workflow. |

## Required before deploy

- [ ] Before any production or real-data deployment, add authentication, authorization, ownership checks, and step-up approval controls.
- [ ] Add idempotency keys and replay-safe responses to all action and transition endpoints.
- [ ] Replace destructive demo reset with retained audit epochs or immutable external archival.
- [ ] Add request IDs, actor/IP metadata, structured logs, alerts, retention policy, and incident runbooks.
- [ ] Add a real double-entry ledger and reconciliation before integrating any payment provider.

## Accepted risks (with sign-off)

- Public judges can approve/reject simulated actions — founder scope decision — use only canned or synthetic data and never connect payment execution.
- Reset starts a new audit epoch and destroys the previous demo-only chain — founder scope decision — protect it with a high-entropy Render secret and reseed only deterministic synthetic data.
- No idempotency or production observability — founder scope decision — acceptable for the hackathon demo, explicitly blocking real-money deployment.
- Ephemeral SQLite is single-instance and resets on Render redeploy — founder scope decision — desirable for this public demonstration, unsuitable for production.

## Sign-off

Phase 8 is acceptable for a synthetic public hackathon demo only. Production and any real-money deployment remain blocked by sections B, C, E, J, K, and M.
