# Fintech Safety Review — Phase 6 Dashboard Approval Controls

## Scope

Review of the dashboard's approve/reject controls and their existing backend transitions. No payment provider, balance, or execution integration is added in Phase 6.

## Reviewer(s)

Codex, 2026-07-17

## Results

| Section | Status | Notes |
|---|---|---|
| A. Money representation | PASS | Amounts remain integer `amount_cents` in SQLite and policy math; EUR formatting is display-only. |
| B. Idempotency | FAIL | Approval/rejection endpoints have no idempotency key; a retry after a successful response returns a conflict, but request replay is not explicitly deduplicated. |
| C. Ledger correctness | N/A | Phase 6 does not move funds or add double-entry balances; the existing append-only hash chain records transitions. |
| D. State machine | PASS | Approve/reject require `pending_approval`; transitions append the corresponding ledger event and cannot be repeated. |
| E. Authentication & authorization | FAIL | MVP endpoints have no authentication or ownership model. This is out of Phase 6 scope and blocks production deployment. |
| J. Audit log | PASS | Approve/reject update the action and append an immutable approval/rejection event in the same transaction. |
| K. Observability & alerts | FAIL | Dashboard shows state and chain health, but production request IDs, structured approval logs, and alerts are not implemented. |
| L. Secrets & access | PASS | No secrets are added; the frontend calls local HTTP endpoints only. |

## Required before deploy

- [ ] Add authenticated, authorized human approval with ownership checks.
- [ ] Add idempotency keys and replay-safe responses to approval/rejection endpoints.
- [ ] Add request IDs, structured audit access logs, and operational alerts.

## Accepted risks (with sign-off)

- MVP has no auth, real execution, or provider integration — founder scope decision — keep deployment local/demo-only.
- Approval controls are intentionally manual and conflict on repeated transitions — acceptable for the demo, replace with explicit idempotency before production.

## Sign-off

Phase 6 dashboard change reviewed for the approve/reject path; production deployment blocked until the listed controls are addressed.
