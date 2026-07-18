from __future__ import annotations

import json
import sqlite3
from typing import Any

from .database import get_connection


def risk_components(agent_id: int, connection: sqlite3.Connection | None = None) -> dict[str, Any]:
    """Return deterministic counts and weighted contributions for one agent's history."""
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        rows = connection.execute(
            """SELECT status, intent_verdict FROM actions
               WHERE agent_id = ? AND (scenario_tag IS NULL OR scenario_active = 1)
               ORDER BY id ASC""",
            (agent_id,),
        ).fetchall()
        blocked = pending = allowed = hijack = suspicious = unavailable = 0
        for row in rows:
            if row["status"] == "blocked":
                blocked += 1
            elif row["status"] == "pending_approval":
                pending += 1
            elif row["status"] == "allowed":
                allowed += 1
            if row["intent_verdict"]:
                verdict = json.loads(row["intent_verdict"]).get("verdict")
                if verdict == "hijack_suspected":
                    hijack += 1
                elif verdict == "suspicious":
                    suspicious += 1
            else:
                unavailable += 1
        return {
            "total_actions": len(rows),
            "blocked_actions": blocked,
            "pending_actions": pending,
            "allowed_actions": allowed,
            "hijack_suspected": hijack,
            "suspicious": suspicious,
            "intent_unavailable": unavailable,
            "weighted_score": blocked * 25 + pending * 12 + hijack * 40 + suspicious * 20 + unavailable * 8 - allowed * 2,
        }
    finally:
        if owns_connection:
            connection.close()


def compute_risk(agent_id: int, connection: sqlite3.Connection | None = None) -> int:
    """Compute 0–100 risk: blocked +25, pending +12, hijack +40, suspicious +20, unavailable +8, allowed −2."""
    return max(0, min(100, int(risk_components(agent_id, connection)["weighted_score"])))
