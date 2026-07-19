# Fintech Safety Review — Phase 12 Public Live Intent Run

Date: 2026-07-19

Reviewer: Codex

## Scope

This review covers the demo-only `POST /demo/live-intent` path: four server-locked synthetic payment scenarios, one real intent-model evaluation, deterministic policy fusion, action persistence, and the tamper-evident audit entry. It does not execute payments or connect to a payment provider. Existing production blockers remain unchanged.

## Results

| Section | Status | Notes |
|---|---|---|
| A. Money representation | PASS | Locked scenarios use integer `amount_cents`; currency is explicit EUR; policy and persistence remain integer-only. |
| B. Idempotency | ACCEPTED RISK | A per-IP/scenario 60-second result cache suppresses duplicate model calls, but this is not a durable client idempotency contract. No money is executed. |
| C. Ledger correctness | ACCEPTED RISK | Action and audit entry commit atomically in one SQLite transaction and the audit chain is append-only. This is an evidence ledger, not double-entry accounting. |
| D. State machine | PASS | The shared fusion path maps the live verdict into existing `allowed`, `pending_approval`, or `blocked` states; provider failure can never produce `allowed`. |
| E. Authentication and authorization | ACCEPTED RISK | The endpoint is intentionally public in `DEMO_MODE`, accepts only four server-owned scenario IDs, and cannot receive free text. It must not be reused for real payments or private missions. |
| F. External reconciliation | N/A | No PSP, bank, custody, or settlement system is connected. |
| G. Webhooks | N/A | No webhook is added. |
| H. Crypto-specific | N/A | No crypto or custody path exists. |
| I. Credit / BNPL-specific | N/A | No credit path exists. |
| J. Audit log | PASS | Every completed live run creates a normal action and hash-chained `action_evaluated` entry, including live-run metadata and model provenance. Client IP is stored only as a SHA-256 fingerprint in the quota table. |
| K. Observability and alerts | ACCEPTED RISK | The response exposes bounded provenance and failures are generic. There is no external spend alert; the persisted global limit hard-stops requests at 100 per UTC day. |
| L. Secrets and access | PASS | The API key remains backend-only. The client sends only `scenario_id`; responses and errors never include provider exceptions or credentials. |
| M. Runbooks | ACCEPTED RISK | Existing demo reset/deploy documentation applies. There is no production model-cost incident runbook. |
| N. Compliance / regulatory | N/A | The feature evaluates synthetic requests and neither moves funds nor processes customer identity data. |

## Required before deploy

- [x] Restrict request bodies to the four server-owned scenario IDs.
- [x] Enforce a 15-second provider timeout and a 180-token output ceiling.
- [x] Strictly validate verdict type, confidence, reasoning, response ID, and timestamp.
- [x] Persist per-IP hourly and global daily quota reservations before the provider call.
- [x] Return cached results for identical per-IP scenarios within 60 seconds without a second provider call.
- [x] Convert provider timeout, error, or malformed output into `pending_approval` with `live intent unavailable` for an otherwise allowable action.
- [x] Commit action and ledger evidence atomically through the existing service path.
- [x] Keep credentials and raw provider errors out of frontend code, responses, and logs.

## Accepted risks

- Public model use can consume up to the configured global request ceiling. Mitigation: four immutable scenarios, six requests per IP per hour, 100 requests per UTC day, 60-second cache, 15-second timeout, and low output cap. Owner: project operator.
- IP-based limits depend on the deployment proxy supplying a trustworthy forwarding header. The global SQLite cap remains the cost backstop if per-IP attribution is degraded. Owner: project operator.
- SQLite counters are single-instance controls and are not suitable for a horizontally scaled deployment. The current Render demo is a single instance. Owner: project operator.
- This feature is a synthetic decision demo, not payment execution. All real-money production blockers in prior reviews remain in force. Owner: project operator.

## Sign-off

Approved for the public single-instance hackathon demo only. Not approved for real funds, private data, multi-instance scaling, or production financial use.
