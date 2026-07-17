# Final Verification Pass Design

## Scope

Add one judge-facing verification runner and evidence documentation. The runner verifies the already-running Docker Compose stack without adding application features or changing backend, frontend, policy, intent, ledger, or approval behavior.

## Considered approaches

1. **Python standard library runner plus `docker-compose exec` (selected).** `urllib` preserves real HTTP status and JSON bodies, while `subprocess` invokes Python's built-in `sqlite3` inside the backend container for the reversible tamper. This adds no dependency and works from the repository root.
2. **`requests` plus the Docker Python SDK.** The code would be shorter, but it would add judge-machine dependencies that are not needed by the application.
3. **Shell script around `curl` and `docker-compose`.** This would be concise on one platform but brittle across PowerShell, POSIX shells, JSON quoting, and response parsing.

## Runner design

`scripts/verify_all.py` owns orchestration and uses small pure validators for individual contracts. Every HTTP request prints the method, URL, status, and full JSON response before its assertion is evaluated. Each named check prints exactly one final `PASS` or `FAIL`, and the process exits zero only when all checks pass.

The runner discovers the seeded `procurement-bot` through `GET /agents`. HTTP payment requests use decimal EUR strings because the HTTP boundary intentionally converts to cents. Integer persistence is proved from the corresponding ledger snapshot, where `amount_cents` must equal `500000`.

The live policy check creates a `9999.99` EUR payment to `nowhere.example` and requires `blocked` plus at least two reasons. The approval check records the verified ledger count, creates a `700.00` EUR Stripe payment, approves it, confirms `allowed`, and requires exactly two additional ledger events.

## Reversible tamper protocol

The runner first requires a valid chain, then selects sequence `2`. An inline Python command invoked by `docker-compose exec -T backend` reads the original snapshot and returns it as base64. A second direct SQLite command updates only that row's snapshot with a deterministic `verification_tamper` field. `GET /ledger/verify` must then return `valid: false` and `first_broken_seq: 2`.

The original snapshot bytes are restored in a `finally` block. A final verify call must return `valid: true`; restoration failure makes the overall run fail. No application ledger update or delete path is introduced.

## Error handling and output

HTTP errors retain their response status and body in output. Transport, JSON, Docker, assertion, and restore errors are converted into named failures instead of tracebacks. The tamper section always attempts restoration once mutation has occurred.

Read-only checks may report independently, but mutating checks are gated: policy POST requires successful health, valid dashboard ledger, and flagship checks; approval additionally requires the policy check; direct tampering additionally requires the approval check. A failed prerequisite prints `FAIL` and skips the mutation.

## Testing

Backend tests import the script and exercise its pure validators, response formatting, result accounting, and tamper-command contract without mocking policy or ledger behavior. The full runner is then executed against a freshly rebuilt Compose stack as the real integration test. Existing backend, frontend, and Next.js build commands remain the final regression gate.

## Self-review

- No placeholders or deferred choices.
- No application behavior or schema changes.
- Amount boundaries and persisted integer units are explicit.
- Tamper restoration is mandatory and verified.
- The runner's zero exit status is conditional on every check passing.
