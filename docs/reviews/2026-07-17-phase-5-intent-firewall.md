# Fintech Safety Review — Phase 5 GPT-5.6 Intent Firewall

## Scope

This review covers the mission-alignment intent check, fail-closed decision fusion, persisted intent verdicts, per-agent risk scoring, and the live demo client. Tests inject a fake intent judge and never call a provider. No payment execution, provider settlement, authentication, or frontend change is included.

## Results

| Section | Status | Notes |
|---|---|---|
| A. Money representation | PASS | Action and intent inputs use integer `amount_cents`; the OpenAI prompt serializes the integer and never performs money math. |
| B. Idempotency | Accepted risk | Existing action/MCP requests still lack idempotency keys; no real payment execution exists. |
| C. Ledger correctness | PASS / scoped | Intent verdict and mission are embedded in the existing append-only hash chain; no ledger update/delete path was added. This remains an audit chain, not double-entry accounting. |
| D. State machine | PASS | Policy BLOCK remains terminal; hijack becomes BLOCK; suspicious/unavailable/no-mission ALLOW becomes pending; human approval remains the only pending transition. |
| E. Authentication & authorization | Accepted risk | Local HTTP/MCP services remain unauthenticated and are demo-only. Remote deployment requires identity, ownership, and approval authorization. |
| F. External system reconciliation | N/A | No PSP, bank, or settlement source is connected. |
| G. Webhooks | N/A | No webhooks are implemented. |
| H. Crypto-specific | N/A | No crypto custody or transfer exists. |
| I. Credit / BNPL-specific | N/A | No credit product exists. |
| J. Audit log | PASS / scoped | Verdict, model, latency, mission, decision, and reasons are persisted and hashed with action events. Actor identity, request ID, IP, retention, and access logging remain pre-deploy requirements. |
| K. Observability & alerts | Accepted risk | Local failures become fail-closed pending actions; production metrics and alerts for provider outages, stale approvals, and risk spikes are not yet implemented. |
| L. Secrets & access | PASS / scoped | `.env` is ignored and no key is tracked. The live demo requires a local key; production secret storage and rotation remain future work. |
| M. Runbooks | Accepted risk | No production execution path exists; provider outage, model drift, and stuck approval runbooks are required before deployment. |
| N. Compliance / regulatory | Accepted risk | No regulated funds movement or customer onboarding exists; retention and compliance controls remain future work. |

## Required before deploy

- [ ] Add authentication, authorization, and agent ownership checks to HTTP and MCP.
- [ ] Add idempotency keys and durable deduplication before any real execution path.
- [ ] Monitor provider availability, model/version changes, latency, and verdict drift.
- [ ] Define human-review SLAs and alerts for pending actions.
- [ ] Add audit actor/request metadata, access logging, retention, backup, and restore controls.
- [ ] Maintain a versioned verdict evaluation set to detect prompt/model regressions.
- [ ] Design balanced double-entry accounting before recording executed funds movement.

## Accepted risks

- A missing or unavailable intent provider fails closed to human review; owner: product; mitigation: policy BLOCK remains absolute and no execution path exists.
- The local demo uses a deliberately naive agent prompt to demonstrate detection of poisoned instructions; owner: product; mitigation: the firewall judges the concrete action independently of the agent's narrative.
- No real provider smoke test could run in this workspace because `backend/.env` contains only the requested placeholder key; owner: developer; mitigation: the script fails explicitly until a real key is supplied.

## Sign-off

2026-07-17 — Phase 5 implementation review.
