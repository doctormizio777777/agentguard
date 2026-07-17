from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

from app.ledger import verify_chain


ROOT = Path(__file__).resolve().parents[2]


def test_dashboard_seed_creates_flagship_hijack_and_pending_gift_card(tmp_path: Path) -> None:
    database_path = tmp_path / "dashboard-seed.db"
    environment = os.environ.copy()
    environment["AGENT_GUARDRAIL_DB"] = str(database_path)

    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "seed_dashboard.py")],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row

    hijack = connection.execute(
        """SELECT actions.*, missions.mission_text
           FROM actions
           JOIN missions ON missions.agent_id = actions.agent_id AND missions.active = 1
           WHERE actions.counterparty = 'unknown-vendor.xyz'"""
    ).fetchone()
    assert hijack is not None
    hijack_verdict = json.loads(hijack["intent_verdict"])
    assert hijack["action_type"] == "payment"
    assert hijack["amount_cents"] == 500_000
    assert hijack["status"] == "blocked"
    assert hijack_verdict["verdict"] == "hijack_suspected"
    assert hijack_verdict["confidence"] == 0.97
    reasoning = hijack_verdict["reasoning"].lower()
    assert "beneficiary change" in reasoning
    assert "urgency language" in reasoning
    assert "unknown counterparty" in reasoning
    assert hijack["mission_text"] == "Buy API credits from approved vendors, max budget 2000 EUR/day"

    gift_card = connection.execute(
        "SELECT * FROM actions WHERE counterparty = 'gift-card-store.example'"
    ).fetchone()
    assert gift_card is not None
    gift_card_verdict = json.loads(gift_card["intent_verdict"])
    assert gift_card["action_type"] == "payment"
    assert gift_card["amount_cents"] == 30_000
    assert gift_card["status"] == "pending_approval"
    assert gift_card_verdict["verdict"] == "suspicious"
    assert gift_card_verdict["confidence"] == 0.84

    assert verify_chain(connection) == {
        "valid": True,
        "entries_checked": 15,
        "first_broken_seq": None,
        "reason": None,
    }
    connection.close()

