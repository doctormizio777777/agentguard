# Fintech Safety Review — Phase 9 Guided Demo

## Scope

Review of the ordered public scenario endpoint and its use of the existing policy, intent-fusion, action-state, and hash-chained audit paths. The scenario records synthetic authorization decisions only; it does not execute payments, maintain balances, or call a payment provider.

## Reviewer(s)

Codex, 2026-07-18

## Results

| Section | Status | Notes |
|---|---|---|
| A. Money representation | PASS | Scenario amounts enter the shared service as integer `amount_cents`; policy math and SQLite persistence remain integer-only. Decimal strings are response/display formatting only. |
| B. Idempotency | PASS | Steps 1–5 advance scenario state in the same `BEGIN IMMEDIATE` transaction as action and ledger writes. A retry after a committed step is rejected with 409 instead of creating a duplicate action. The general action API still has the previously accepted idempotency risk. |
| C. Ledger correctness | PASS | Every scenario action uses `create_action_in_transaction`; action persistence and `append_entry` commit or roll back together. Scenario restart archives tagged actions but never updates or deletes ledger entries. Double-entry accounting is not applicable because no funds move. |
| D. State machine | PASS | The endpoint enforces 0→5 ordering. Scenario actions use the existing deterministic decision-to-status mapping, and archived pending actions cannot transition. |
| E. Authentication & authorization | N/A | The endpoint is intentionally public for judges and can affect synthetic demo data only. Existing public approve/reject exposure remains an accepted demo-only risk. |
| F. External system reconciliation | N/A | No PSP, bank, balance, settlement, or execution system exists. |
| G. Webhooks | N/A | No inbound webhooks exist. |
| H. Crypto-specific | N/A | No crypto custody or transfer path exists. |
| I. Credit / BNPL-specific | N/A | No credit, underwriting, installment, or collections path exists. |
| J. Audit log | PASS | All three action decisions append normal hash-chained ledger events, including mission and canned intent snapshots. Full-arc and surgical-reset tests verify the chain remains valid. |
| K. Observability & alerts | N/A | This change adds no production money execution. Existing demo health, risk, and chain-integrity surfaces are unchanged. |
| L. Secrets & access | PASS | The scenario makes no LLM call, reads no API key, and stores only fixed synthetic content. No secret or environment handling changed. |
| M. Runbooks | N/A | Existing public-demo deployment/reset documentation applies; there is no operational payment incident path. |
| N. Compliance / regulatory | N/A | The demo performs no regulated payment, custody, credit, KYC, AML, or sanctions activity. |

## Required before deploy

- [x] Prove integer cents, ordered execution, atomic ledger writes, fail-closed fusion, and surgical restart through automated tests.
- [x] Run the complete six-step scenario against a real SQLite database and verify the chain.
- [x] Confirm the frontend exposes no execution path outside the existing shared service endpoint.

## Accepted risks (with sign-off)

- General action endpoints still lack production idempotency keys and authentication — founder-approved hackathon scope — never connect this public deployment to payment execution or real data.
- Scenario restart archives action rows rather than erasing audit evidence — deliberate design — old scenario rows are hidden from dashboard/risk/policy context while ledger history remains verifiable.
- Canned intent verdicts are deterministic demo fixtures, not security analysis — explicit UI label — the optional live demo remains the only LLM-backed path.

## Sign-off

Phase 9 is acceptable for the synthetic public hackathon demo. Any real-money or real-data deployment remains blocked on the production controls documented in the earlier safety reviews.
