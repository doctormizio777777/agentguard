from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import sqlite3
from typing import Any, Mapping


GENESIS_HASH = "0" * 64
EVENT_TYPES = {"action_evaluated", "action_approved", "action_rejected"}


def canonical_json(value: Any) -> str:
    """Serialize JSON deterministically for hashing and persistence."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_entry_hash(
    seq: int,
    action_id: int,
    event_type: str,
    snapshot: Mapping[str, Any],
    prev_hash: str,
    created_at: str,
) -> str:
    payload = {
        "seq": seq,
        "action_id": action_id,
        "event_type": event_type,
        "snapshot": snapshot,
        "prev_hash": prev_hash,
        "created_at": created_at,
    }
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def append_entry(
    connection: sqlite3.Connection,
    action_id: int,
    event_type: str,
    snapshot: Mapping[str, Any],
    created_at: str | None = None,
) -> sqlite3.Row:
    """Append one immutable entry; the caller owns the surrounding transaction."""
    if event_type not in EVENT_TYPES:
        raise ValueError(f"unsupported ledger event_type: {event_type}")
    if not connection.in_transaction:
        connection.execute("BEGIN IMMEDIATE")

    latest = connection.execute(
        "SELECT seq, entry_hash FROM ledger_entries ORDER BY seq DESC LIMIT 1"
    ).fetchone()
    seq = 1 if latest is None else int(latest[0]) + 1
    prev_hash = GENESIS_HASH if latest is None else str(latest[1])
    timestamp = created_at or utc_now_iso()
    snapshot_json = canonical_json(dict(snapshot))
    entry_hash = compute_entry_hash(seq, action_id, event_type, dict(snapshot), prev_hash, timestamp)
    connection.execute(
        """INSERT INTO ledger_entries
           (seq, action_id, event_type, snapshot, prev_hash, entry_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (seq, action_id, event_type, snapshot_json, prev_hash, entry_hash, timestamp),
    )
    return connection.execute("SELECT * FROM ledger_entries WHERE seq = ?", (seq,)).fetchone()


def verify_chain(connection: sqlite3.Connection) -> dict[str, Any]:
    rows = connection.execute("SELECT * FROM ledger_entries ORDER BY seq ASC").fetchall()
    previous_hash = GENESIS_HASH
    expected_seq = 1
    for row in rows:
        seq = int(row["seq"])
        if seq != expected_seq:
            return {
                "valid": False,
                "entries_checked": expected_seq - 1,
                "first_broken_seq": seq,
                "reason": f"sequence gap: expected seq {expected_seq}, found {seq}",
            }
        if row["prev_hash"] != previous_hash:
            return {
                "valid": False,
                "entries_checked": expected_seq - 1,
                "first_broken_seq": seq,
                "reason": f"prev_hash linkage mismatch at seq {seq}",
            }
        snapshot = json.loads(row["snapshot"])
        expected_hash = compute_entry_hash(
            seq,
            int(row["action_id"]),
            row["event_type"],
            snapshot,
            row["prev_hash"],
            row["created_at"],
        )
        if row["entry_hash"] != expected_hash:
            return {
                "valid": False,
                "entries_checked": expected_seq - 1,
                "first_broken_seq": seq,
                "reason": f"entry_hash mismatch at seq {seq}",
            }
        previous_hash = row["entry_hash"]
        expected_seq += 1
    return {
        "valid": True,
        "entries_checked": len(rows),
        "first_broken_seq": None,
        "reason": None,
    }
