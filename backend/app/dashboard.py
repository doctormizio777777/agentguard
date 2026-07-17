from __future__ import annotations

from typing import Any

from .database import get_connection
from .ledger import verify_chain


def get_dashboard_summary() -> dict[str, Any]:
    """Return the dashboard aggregate from one backend query layer."""
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM actions WHERE date(created_at) = date('now')) AS actions_today,
                (SELECT COALESCE(SUM(amount_cents), 0) FROM actions
                 WHERE date(created_at) = date('now') AND action_type = 'payment' AND status = 'allowed')
                    AS spend_today_cents,
                (SELECT COUNT(*) FROM actions WHERE status = 'pending_approval') AS pending_count,
                (SELECT COUNT(*) FROM actions WHERE status = 'blocked') AS blocked_count,
                (SELECT COUNT(*) FROM agents) AS agents_online,
                (SELECT COUNT(*) FROM actions
                 WHERE status = 'blocked' AND json_extract(intent_verdict, '$.verdict') = 'hijack_suspected')
                    AS threats_blocked,
                (SELECT COUNT(*) FROM ledger_entries) AS ledger_entries
            """
        ).fetchone()
        chain = verify_chain(connection)
    return {
        "actions_today": row["actions_today"],
        "spend_today_cents": row["spend_today_cents"],
        "pending_count": row["pending_count"],
        "blocked_count": row["blocked_count"],
        "agents_online": row["agents_online"],
        "threats_blocked": row["threats_blocked"],
        "ledger": {"entries": row["ledger_entries"], "valid": chain["valid"]},
    }
