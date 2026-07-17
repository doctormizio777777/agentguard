# AgentGuard Verification

Run `scripts/verify_all.py` against the running compose stack to reproduce every claim below.

From the repository root:

```bash
docker-compose up -d
python scripts/verify_all.py
```

The runner uses the public HTTP API for every product-level check. Its only direct database access is the deliberately destructive tamper probe, executed inside the backend container and restored before the script exits.

## 1. Money is never floats

### CLAIM

Payment values are persisted and evaluated only as integer minor units. Decimal EUR exists only at the HTTP boundary.

Relevant commit: [`1d8072f`](../../../commit/1d8072f) (`feat: add deterministic policy floor`).

### HOW WE PROVE IT

- [`backend/app/database.py`](../backend/app/database.py#L56) declares `actions.amount_cents INTEGER`.
- [`backend/app/main.py`](../backend/app/main.py#L283) converts the incoming decimal amount to cents and rejects fractions smaller than one cent.
- [`backend/app/policy.py`](../backend/app/policy.py#L30) reads `amount_cents`; every cap, threshold, and daily-total comparison is integer math.
- The live verifier reads the flagship ledger snapshot and requires `amount_cents == 500000`.

### REAL OUTPUT

```text
$ docker-compose exec -T backend python -c "import json, os, sqlite3; connection=sqlite3.connect(os.environ['AGENT_GUARDRAIL_DB']); row=next(item for item in connection.execute('PRAGMA table_info(actions)').fetchall() if item[1]=='amount_cents'); print(json.dumps({'column': row[1], 'type': row[2], 'not_float': row[2].upper() == 'INTEGER'}))"
{"column": "amount_cents", "type": "INTEGER", "not_float": true}

MATCH flagship: action_id=15 amount_cents=500000 counterparty=unknown-vendor.xyz confidence=0.97
PASS c. flagship 500000-cent hijack action
```

The HTTP response renders the same value as a decimal string, never a binary float:

```json
{
  "amount": "5000.00",
  "counterparty": "unknown-vendor.xyz",
  "status": "blocked"
}
```

## 2. Every decision is audited atomically

### CLAIM

An action state change and its ledger event commit together or roll back together.

Relevant commit: [`79364a2`](../../../commit/79364a2) (`feat: add tamper-evident audit ledger`).

### HOW WE PROVE IT

1. [`backend/app/service.py`](../backend/app/service.py#L84) begins each action write with `BEGIN IMMEDIATE`, taking SQLite's write reservation before reading the current chain head.
2. The same connection persists the action and calls `append_entry`; approvals and rejections use the same pattern at [`service.py`](../backend/app/service.py#L158).
3. The connection context commits only after both operations succeed. Any exception exits the transaction with a rollback, so an action cannot advance without its matching ledger event.

### REAL OUTPUT

The live approval test starts at 16 entries, adds one evaluation and one approval, and ends at 18 with a valid chain:

```text
GET http://localhost:8000/ledger/verify
HTTP 200
{
  "entries_checked": 16,
  "first_broken_seq": null,
  "reason": null,
  "valid": true
}

POST http://localhost:8000/actions
HTTP 201
{
  "action_type": "payment",
  "agent_id": 1,
  "amount": "700.00",
  "counterparty": "stripe.com",
  "created_at": "2026-07-17 20:08:25",
  "currency": "EUR",
  "decision": "PENDING_APPROVAL",
  "id": 17,
  "intent_error": "intent firewall unavailable — human review required",
  "intent_latency_ms": null,
  "intent_model": null,
  "intent_verdict": null,
  "mission_text": "Buy API credits from approved vendors, max budget 2000 EUR/day",
  "payload": {
    "verification": "approval-loop-live-test"
  },
  "policy_reason": "amount 700.00 EUR exceeds approval_threshold 500.00 EUR; intent firewall unavailable — human review required",
  "reasons": [
    "amount 700.00 EUR exceeds approval_threshold 500.00 EUR",
    "intent firewall unavailable — human review required"
  ],
  "status": "pending_approval"
}

POST http://localhost:8000/actions/17/approve
HTTP 200
{
  "action_type": "payment",
  "agent_id": 1,
  "amount": "700.00",
  "counterparty": "stripe.com",
  "created_at": "2026-07-17 20:08:25",
  "currency": "EUR",
  "decision": null,
  "id": 17,
  "intent_error": "intent firewall unavailable — human review required",
  "intent_latency_ms": null,
  "intent_model": null,
  "intent_verdict": null,
  "mission_text": "Buy API credits from approved vendors, max budget 2000 EUR/day",
  "payload": {
    "verification": "approval-loop-live-test"
  },
  "policy_reason": "amount 700.00 EUR exceeds approval_threshold 500.00 EUR; intent firewall unavailable — human review required; human decision: approved",
  "reasons": [
    "amount 700.00 EUR exceeds approval_threshold 500.00 EUR; intent firewall unavailable — human review required; human decision: approved"
  ],
  "status": "allowed"
}

GET http://localhost:8000/ledger/verify
HTTP 200
{
  "entries_checked": 18,
  "first_broken_seq": null,
  "reason": null,
  "valid": true
}
PASS e. pending approval transitions to allowed
```

## 3. The chain detects tampering

### CLAIM

Changing a historical snapshot without recomputing the chain is detected at the first modified sequence.

Relevant commit: [`79364a2`](../../../commit/79364a2) (`feat: add tamper-evident audit ledger`).

### HOW WE PROVE IT

[`scripts/verify_all.py`](../scripts/verify_all.py) saves the exact snapshot bytes for sequence 2, performs a direct SQLite `UPDATE`, calls `/ledger/verify`, then restores the original bytes in a `finally` block and verifies the clean chain again. The app itself still has no ledger update or delete endpoint.

### REAL OUTPUT

This is the complete before, tamper, after, and restore transcript from the clean-stack run:

```text
GET http://localhost:8000/ledger/verify
HTTP 200
{
  "entries_checked": 18,
  "first_broken_seq": null,
  "reason": null,
  "valid": true
}
SQL UPDATE ledger_entries SET snapshot = <tampered JSON> WHERE seq = 2
tampered ledger snapshot at seq 2

GET http://localhost:8000/ledger/verify
HTTP 200
{
  "entries_checked": 1,
  "first_broken_seq": 2,
  "reason": "entry_hash mismatch at seq 2",
  "valid": false
}
SQL RESTORE ledger_entries.snapshot WHERE seq = 2
restored ledger snapshot at seq 2

GET http://localhost:8000/ledger/verify
HTTP 200
{
  "entries_checked": 18,
  "first_broken_seq": null,
  "reason": null,
  "valid": true
}
PASS f. ledger detects and recovers from direct SQL tampering
```

## 4. Fail-closed by design

### CLAIM

Intent analysis can make a deterministic policy result stricter, never weaker. An unavailable intent layer cannot silently allow an action.

Relevant commit: [`2482036`](../../../commit/2482036) (`feat: add fail-closed intent firewall and agent risk`).

### HOW WE PROVE IT

[`backend/app/service.py`](../backend/app/service.py#L305) owns the fusion function. `BLOCK` dominates every intent result; `hijack_suspected` always blocks; `suspicious` always requires approval; unavailable intent or a missing mission converts only policy `ALLOW` to approval.

| Policy result | `aligned` | `suspicious` | `hijack_suspected` | unavailable / no mission |
|---|---|---|---|---|
| `ALLOW` | allowed | pending approval | blocked | pending approval |
| `PENDING_APPROVAL` | pending approval | pending approval | blocked | pending approval |
| `BLOCK` | blocked | blocked | blocked | blocked |

### REAL OUTPUT

The keyless Compose stack deliberately has no live intent credential. The policy block remains blocked and reports every deterministic reason plus the unavailable-intent reason:

```text
POST http://localhost:8000/actions
HTTP 201
{
  "action_type": "payment",
  "agent_id": 1,
  "amount": "9999.99",
  "counterparty": "nowhere.example",
  "created_at": "2026-07-17 20:08:25",
  "currency": "EUR",
  "decision": "BLOCK",
  "id": 16,
  "intent_error": "intent firewall unavailable — human review required",
  "intent_latency_ms": null,
  "intent_model": null,
  "intent_verdict": null,
  "mission_text": "Buy API credits from approved vendors, max budget 2000 EUR/day",
  "payload": {
    "verification": "policy-floor-live-test"
  },
  "policy_reason": "counterparty nowhere.example is not in merchant_allowlist; amount 9999.99 EUR exceeds per_transaction_cap 1000.00 EUR; daily total 1,019,999 cents exceeds daily_cap 1,000,000 cents; amount 9999.99 EUR exceeds approval_threshold 500.00 EUR; intent firewall unavailable — human review required",
  "reasons": [
    "counterparty nowhere.example is not in merchant_allowlist",
    "amount 9999.99 EUR exceeds per_transaction_cap 1000.00 EUR",
    "daily total 1,019,999 cents exceeds daily_cap 1,000,000 cents",
    "amount 9999.99 EUR exceeds approval_threshold 500.00 EUR",
    "intent firewall unavailable — human review required"
  ],
  "status": "blocked"
}

GET http://localhost:8000/ledger?limit=1&offset=0
HTTP 200
[
  {
    "action_id": 16,
    "created_at": "2026-07-17T20:08:25.339002Z",
    "entry_hash": "8bab9fa1a8cea563f15ab7a7651557091d072d72c674e6fd1221a98fcc24371d",
    "event_type": "action_evaluated",
    "id": 16,
    "prev_hash": "72a06bf19325758b6ddaf44ee338a5be8cd12974db36ce83ff12ded0eea9bbbd",
    "seq": 16,
    "snapshot": {
      "action_type": "payment",
      "agent_id": 1,
      "amount_cents": 999999,
      "counterparty": "nowhere.example",
      "currency": "EUR",
      "decision": "BLOCK",
      "intent_error": "intent firewall unavailable — human review required",
      "intent_verdict": null,
      "mission_text": "Buy API credits from approved vendors, max budget 2000 EUR/day",
      "reasons": [
        "counterparty nowhere.example is not in merchant_allowlist",
        "amount 9999.99 EUR exceeds per_transaction_cap 1000.00 EUR",
        "daily total 1,019,999 cents exceeds daily_cap 1,000,000 cents",
        "amount 9999.99 EUR exceeds approval_threshold 500.00 EUR",
        "intent firewall unavailable — human review required"
      ]
    }
  }
]
PASS d. deterministic policy floor blocks live action
```

## 5. One code path for HTTP and MCP

### CLAIM

HTTP and MCP adapt their input formats but call the same action service. There is no duplicated policy, fusion, persistence, or ledger implementation.

Relevant commit: [`9a92623`](../../../commit/9a92623) (`feat: expose AgentGuard through MCP`).

### HOW WE PROVE IT

- [`backend/app/main.py`](../backend/app/main.py#L17) imports `create_action` from the shared service as `service_create_action` and calls it at line 152.
- [`backend/app/mcp_server.py`](../backend/app/mcp_server.py#L8) imports and calls the same `app.service.create_action` function.
- [`backend/tests/test_mcp.py`](../backend/tests/test_mcp.py#L21) sends the same logical payment through HTTP and MCP and asserts identical status and reasons.

### REAL OUTPUT

```text
$ pytest tests/test_mcp.py::test_mcp_request_action_matches_http_result -q
.                                                                        [100%]
1 passed, 1 warning in 0.25s
```

## 6. 64 backend + 3 frontend tests

### CLAIM

The project passed the requested 64-backend/3-frontend checkpoint. The current suite is stronger: it contains 85 backend tests and 3 frontend tests because the README-verdict regression and final-verification contracts were added after that checkpoint.

Relevant commits: [`1d8072f`](../../../commit/1d8072f), [`79364a2`](../../../commit/79364a2), [`9a92623`](../../../commit/9a92623), [`2482036`](../../../commit/2482036), [`ef286c5`](../../../commit/ef286c5), and [`2946938`](../../../commit/2946938).

### HOW WE PROVE IT

Run the complete backend suite, the Node test suite, and the production Next.js build. These commands exercise real policy and ledger code; policy logic is not mocked.

### REAL OUTPUT

```text
$ pytest -q
........................................................................ [ 84%]
.............                                                            [100%]
85 passed, 1 warning

$ pnpm test
tests 3
pass 3
fail 0

$ pnpm build
✓ Compiled successfully
✓ Generating static pages (4/4)
```

## Reproduction result

The complete runner ends with:

```text
PASS g. all checks passed; exit code 0
RESULT: 6 passed, 0 failed
```

If the script is interrupted after the direct SQL update and before its `finally` restoration completes, reset the demo database with:

```bash
docker-compose down -v
docker-compose up -d
```
