# Phase 3 Tamper-Evident Audit Ledger Design

## Scope

Add a backend-only, append-only SQLite ledger for every action evaluation and every human approval or rejection. The ledger is an audit chain, not a payment execution ledger: it records the policy decision and action snapshot at each event.

## Data model

Create `ledger_entries` with `id`, unique strictly increasing `seq`, `action_id`, constrained `event_type`, canonical JSON `snapshot`, `prev_hash`, `entry_hash`, and ISO 8601 UTC `created_at`. `action_id` references `actions` and deletes are restricted. Existing Phase 2 tables and frontend remain unchanged.

## Hashing and append contract

`backend/app/ledger.py` owns canonical serialization, entry hashing, atomic append, and chain verification. Canonical JSON uses sorted keys, compact separators, and UTF-8. Genesis uses 64 zeroes. `append_entry(connection, action_id, event_type, snapshot, created_at=None)` runs inside the caller's transaction, locks the write transaction, derives the next sequence and previous hash, computes the hash, and inserts exactly one row. No application update/delete path exists for ledger rows.

## Transaction integration

Action creation and ledger append share one explicit SQLite transaction. Approval and rejection update the action and append the corresponding ledger event in the same transaction. Any ledger failure rolls back the action state change.

## API and verification

`GET /ledger` returns newest-first entries with hashes and decoded snapshots. `GET /ledger/verify` recomputes all hashes, checks sequence continuity and prev-hash links, and returns the full verification result.

## Testing and safety

Tests cover deterministic hashes, valid append chains, snapshot tampering, prev-hash tampering, sequence gaps, and the complete action/approval flow. The phase safety note records append-only audit coverage and remaining MVP risks such as authentication and retention.
