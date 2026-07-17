# Fintech Safety Review — Phase 4 MCP Server and Approval Loop

## Scope

This review covers mission storage, MCP exposure of the existing policy floor, shared action service code, and the human approval loop. MCP can create policy-evaluated actions and read their status; it cannot execute payments or approve pending actions. The frontend, LLM layer, authentication, real payment providers, and production operations remain out of scope.

## Results

| Section | Status | Notes |
|---|---|---|
| A. Money representation | PASS | MCP accepts integer `amount_cents`; the shared service validates non-negative integers; SQLite and policy math remain integer-only. |
| B. Idempotency | Accepted risk | MCP and HTTP action requests still have no idempotency key. No external money movement exists in this phase; add deduplication before execution. |
| C. Ledger correctness | PASS / scoped | HTTP and MCP use the same transactional action service and Phase 3 append-only hash chain. This remains an audit chain, not balanced double-entry accounting. |
| D. State machine | PASS | Pending actions can transition only through existing HTTP approve/reject endpoints; MCP can poll but cannot approve. Every transition appends a ledger event atomically. |
| E. Authentication & authorization | Accepted risk | Local MCP and HTTP servers are unauthenticated. Streamable HTTP is bound to loopback for the demo; authentication and agent ownership are required before remote deployment. |
| F. External system reconciliation | N/A | No PSP, bank, or external money source is connected. |
| G. Webhooks | N/A | No webhooks are implemented. |
| H. Crypto-specific | N/A | No crypto custody or transfer exists. |
| I. Credit / BNPL-specific | N/A | No credit product exists. |
| J. Audit log | PASS / scoped | Mission text is embedded in every action snapshot; evaluations and human transitions are hash-chained. Access logging, retention, actor identity, request ID, and IP metadata remain pre-deploy work. |
| K. Observability & alerts | Accepted risk | Demo logs and HTTP errors exist; production alerts for failed writes, pending-age, and invalid chains are not implemented. |
| L. Secrets & access | PASS / scoped | No secrets or provider credentials were added. Production access controls are not implemented. |
| M. Runbooks | Accepted risk | No production payment operations are enabled; incident and stuck-approval runbooks remain required before deployment. |
| N. Compliance / regulatory | Accepted risk | No regulated funds movement or customer onboarding exists; retention and compliance ownership remain future work. |

## Required before deploy

- [ ] Add authentication, authorization, and agent ownership checks for HTTP and MCP.
- [ ] Add idempotency keys and durable deduplication before any execution path.
- [ ] Keep MCP approval read-only; approvals must remain a separately authenticated human action.
- [ ] Add actor, request ID, access logging, retention, backup, and restore controls to the audit ledger.
- [ ] Add alerts for invalid chains, failed ledger writes, and stale pending actions.
- [ ] Design balanced double-entry accounting before recording executed funds movement.

## Accepted risks

- Unauthenticated loopback MCP is acceptable for the local demo only; owner: product; mitigation: bind loopback and require auth before remote exposure.
- Missing idempotency is acceptable while actions are policy simulations only; owner: product; mitigation: block payment execution until deduplication is implemented.

## Sign-off

2026-07-17 — Phase 4 implementation review.
