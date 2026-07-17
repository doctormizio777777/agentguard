import json
import sqlite3

import pytest

from app.database import initialize_database
from app.ledger import append_entry, canonical_json, compute_entry_hash, verify_chain


def connection_with_action() -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    initialize_database(connection)
    agent_id = connection.execute(
        "INSERT INTO agents (name, declared_mission) VALUES (?, ?)",
        ("Ledger Agent", "Test ledger"),
    ).lastrowid
    action_id = connection.execute(
        """INSERT INTO actions
           (agent_id, action_type, amount_cents, counterparty, payload, status, policy_reason)
           VALUES (?, 'payment', 20000, 'openai.com', '{}', 'allowed', 'test')""",
        (agent_id,),
    ).lastrowid
    connection.commit()
    return connection


def test_canonical_serialization_and_hash_are_deterministic():
    first = {"b": 2, "a": {"z": True, "x": [1, 2]}}
    second = {"a": {"x": [1, 2], "z": True}, "b": 2}

    assert canonical_json(first) == '{"a":{"x":[1,2],"z":true},"b":2}'
    assert compute_entry_hash(1, 7, "action_evaluated", first, "0" * 64, "2026-07-17T00:00:00Z") == compute_entry_hash(
        1, 7, "action_evaluated", second, "0" * 64, "2026-07-17T00:00:00Z"
    )


def test_appending_entries_yields_valid_chain():
    connection = connection_with_action()

    append_entry(connection, 1, "action_evaluated", {"decision": "ALLOW", "reasons": []}, "2026-07-17T00:00:00Z")
    append_entry(connection, 1, "action_approved", {"decision": "ALLOW", "reasons": ["approved"]}, "2026-07-17T00:01:00Z")
    append_entry(connection, 1, "action_rejected", {"decision": "BLOCK", "reasons": ["rejected"]}, "2026-07-17T00:02:00Z")

    result = verify_chain(connection)
    assert result == {"valid": True, "entries_checked": 3, "first_broken_seq": None, "reason": None}
    first = connection.execute("SELECT prev_hash FROM ledger_entries WHERE seq = 1").fetchone()
    assert first[0] == "0" * 64


def test_snapshot_tampering_is_detected_at_tampered_sequence():
    connection = connection_with_action()
    for seq in range(1, 4):
        append_entry(connection, 1, "action_evaluated", {"decision": "BLOCK", "seq": seq}, f"2026-07-17T00:0{seq}:00Z")

    connection.execute(
        "UPDATE ledger_entries SET snapshot = ? WHERE seq = 2",
        (json.dumps({"decision": "ALLOW", "seq": 2}),),
    )
    connection.commit()

    result = verify_chain(connection)
    assert result["valid"] is False
    assert result["first_broken_seq"] == 2
    assert "entry_hash mismatch" in result["reason"]


def test_prev_hash_tampering_is_detected_at_tampered_sequence():
    connection = connection_with_action()
    append_entry(connection, 1, "action_evaluated", {"decision": "ALLOW"}, "2026-07-17T00:00:00Z")
    append_entry(connection, 1, "action_evaluated", {"decision": "ALLOW"}, "2026-07-17T00:01:00Z")
    connection.execute("UPDATE ledger_entries SET prev_hash = ? WHERE seq = 2", ("f" * 64,))
    connection.commit()

    result = verify_chain(connection)
    assert result["valid"] is False
    assert result["first_broken_seq"] == 2
    assert "prev_hash linkage mismatch" in result["reason"]


def test_deleted_middle_entry_is_detected_as_sequence_gap():
    connection = connection_with_action()
    for seq in range(1, 4):
        append_entry(connection, 1, "action_evaluated", {"seq": seq}, f"2026-07-17T00:0{seq}:00Z")
    connection.execute("DELETE FROM ledger_entries WHERE seq = 2")
    connection.commit()

    result = verify_chain(connection)
    assert result["valid"] is False
    assert result["first_broken_seq"] == 3
    assert "sequence gap" in result["reason"]

