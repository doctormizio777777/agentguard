# Fintech Safety Review — Phase 10.5 Public Tamper Test

## Scope

The demo-only, reversible corruption of one audit-ledger snapshot and its console controls. This review does not reclassify AgentGuard as a production payment processor and does not expand the accepted public-demo surface.

## Reviewer

Codex, 2026-07-18.

## Results

| Section | Status | Notes |
| --- | --- | --- |
| A. Money representation | PASS | The feature does not change action amounts or policy math. Existing integer `amount_cents` storage remains intact. |
| B. Idempotency | PASS | A second tamper is a no-op, and restore without active tamper is also a safe no-op. |
| C. Ledger correctness | ACCEPTED RISK | Core application writes remain append-only. This explicitly requested `DEMO_MODE` exception performs one reversible snapshot `UPDATE` solely to demonstrate hash-chain detection. |
| D. State machine | PASS | States are singular and explicit: clean, tampered, restored. A DB row guards duplicate corruption. |
| E. Authentication and authorization | ACCEPTED RISK | The endpoint is intentionally public in demo mode and returns 404 otherwise. This matches the documented public-demo scope; it must not be enabled in a production money environment. |
| F. External reconciliation | N/A | No PSP, bank, wallet, or external money system is touched. |
| G. Webhooks | N/A | No webhook path is added or changed. |
| H. Crypto-specific | N/A | No crypto asset or custody path exists in this feature. |
| I. Credit / BNPL-specific | N/A | No credit decision, disbursement, or repayment path exists in this feature. |
| J. Audit log | PASS | The test proves historical mutation is detected at the exact sequence. The original bytes are retained until restore; the chain is valid again only after exact restoration. |
| K. Observability and alerts | PASS | The API and UI expose `valid`, `first_broken_seq`, and the verification reason immediately. |
| L. Secrets and access | PASS | No key is accepted, returned, logged, or committed. The route is gated only by the non-secret `DEMO_MODE` deployment flag as required. |
| M. Runbooks | PASS | Restore is available in the same widget; manual reset and periodic auto-reseed atomically clear both the corrupted ledger and its backup state. |
| N. Compliance / regulatory | N/A | This is a seeded hackathon demo with no real funds, customer identity, or regulated transaction. |

## Required before deploy

- [x] Prove tamper returns `valid: false` at the exact modified sequence.
- [x] Prove restore returns `valid: true`.
- [x] Prove repeated tamper is a no-op.
- [x] Prove manual reset and auto-reseed clear tamper state transactionally.
- [x] Keep both routes unavailable when `DEMO_MODE` is false.

## Accepted risks

- Any anonymous visitor can temporarily break the shared demo chain. This is the feature's intended proof; RESTORE and periodic reseed are the mitigations.
- `ledger_entries` is intentionally updated by one isolated demo module. A production deployment must keep `DEMO_MODE` disabled.

## Sign-off

PASS for the public demo deployment. Not approved as a production payment-ledger mutation path.
