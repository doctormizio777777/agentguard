from __future__ import annotations

import json
import sqlite3
from typing import Any

from .database import get_connection
from .ledger import canonical_json, verify_chain


class DemoTamperUnavailableError(RuntimeError):
    pass


def tamper_demo_ledger() -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            "SELECT tampered_seq FROM demo_tamper_state WHERE id = 1"
        ).fetchone()
        if existing is not None:
            return {
                "tampered_seq": int(existing["tampered_seq"]),
                "already_tampered": True,
                "verification": verify_chain(connection),
            }

        verification = verify_chain(connection)
        if not verification["valid"]:
            raise DemoTamperUnavailableError("ledger must be valid before running the tamper test")

        rows = connection.execute(
            "SELECT seq, snapshot FROM ledger_entries ORDER BY seq ASC"
        ).fetchall()
        if len(rows) < 3:
            raise DemoTamperUnavailableError("ledger needs at least three entries for a mid-chain tamper test")

        row = rows[len(rows) // 2]
        tampered_seq = int(row["seq"])
        original_snapshot = str(row["snapshot"])
        tampered_snapshot = json.loads(original_snapshot)
        tampered_snapshot["demo_public_tamper"] = 1

        connection.execute(
            "INSERT INTO demo_tamper_state (id, tampered_seq, original_snapshot) VALUES (1, ?, ?)",
            (tampered_seq, original_snapshot),
        )
        connection.execute(
            "UPDATE ledger_entries SET snapshot = ? WHERE seq = ?",
            (canonical_json(tampered_snapshot), tampered_seq),
        )
        return {
            "tampered_seq": tampered_seq,
            "already_tampered": False,
            "verification": verify_chain(connection),
        }


def restore_demo_ledger() -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        state = connection.execute(
            "SELECT tampered_seq, original_snapshot FROM demo_tamper_state WHERE id = 1"
        ).fetchone()
        if state is None:
            return {
                "restored_seq": None,
                "already_restored": True,
                "verification": verify_chain(connection),
            }

        restored_seq = int(state["tampered_seq"])
        connection.execute(
            "UPDATE ledger_entries SET snapshot = ? WHERE seq = ?",
            (state["original_snapshot"], restored_seq),
        )
        connection.execute("DELETE FROM demo_tamper_state WHERE id = 1")
        return {
            "restored_seq": restored_seq,
            "already_restored": False,
            "verification": verify_chain(connection),
        }
