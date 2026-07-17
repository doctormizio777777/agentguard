from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.database import get_connection, initialize_database
from app.ledger import verify_chain


def _database_counts(database_path: Path) -> dict[str, int]:
    with get_connection(database_path) as connection:
        return {
            table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in ("agents", "missions", "actions", "ledger_entries")
        }


def test_seed_dashboard_populates_canonical_demo_in_one_valid_chain(tmp_path: Path) -> None:
    from app.demo_seed import seed_dashboard

    database_path = tmp_path / "seed.db"
    with get_connection(database_path) as connection:
        initialize_database(connection)
        result = seed_dashboard(connection)

    assert result == {
        "agents": 3,
        "actions": 15,
        "status_counts": {"allowed": 7, "blocked": 1, "pending_approval": 7},
        "ledger": {
            "valid": True,
            "entries_checked": 15,
            "first_broken_seq": None,
            "reason": None,
        },
    }
    assert _database_counts(database_path) == {
        "agents": 3,
        "missions": 3,
        "actions": 15,
        "ledger_entries": 15,
    }

    with get_connection(database_path) as connection:
        hijack = connection.execute(
            "SELECT amount_cents, counterparty, status, intent_verdict FROM actions ORDER BY id DESC LIMIT 1"
        ).fetchone()
        assert hijack["amount_cents"] == 500_000
        assert hijack["counterparty"] == "unknown-vendor.xyz"
        assert hijack["status"] == "blocked"
        assert json.loads(hijack["intent_verdict"])["confidence"] == 0.97
        assert verify_chain(connection)["valid"] is True


def test_seed_dashboard_refuses_to_append_over_existing_chain(tmp_path: Path) -> None:
    from app.demo_seed import seed_dashboard

    database_path = tmp_path / "non-empty.db"
    with get_connection(database_path) as connection:
        initialize_database(connection)
        seed_dashboard(connection)
        with pytest.raises(RuntimeError, match="refusing to reseed"):
            seed_dashboard(connection)


def test_reset_dashboard_replaces_dirty_state_and_restarts_identifiers(tmp_path: Path) -> None:
    from app.demo_seed import seed_dashboard

    database_path = tmp_path / "reset.db"
    with get_connection(database_path) as connection:
        initialize_database(connection)
        seed_dashboard(connection)
        connection.execute("UPDATE actions SET counterparty = 'judge-mutated.example' WHERE id = 1")
        result = seed_dashboard(connection, reset=True)

    assert result["agents"] == 3
    assert result["actions"] == 15
    assert result["ledger"]["valid"] is True
    with get_connection(database_path) as connection:
        assert connection.execute("SELECT MIN(id), MAX(id) FROM agents").fetchone()[:] == (1, 3)
        assert connection.execute("SELECT MIN(id), MAX(id) FROM actions").fetchone()[:] == (1, 15)
        assert connection.execute("SELECT MIN(seq), MAX(seq) FROM ledger_entries").fetchone()[:] == (1, 15)
        assert connection.execute(
            "SELECT COUNT(*) FROM actions WHERE counterparty = 'judge-mutated.example'"
        ).fetchone()[0] == 0


def test_reset_dashboard_rolls_back_if_reseed_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import app.demo_seed as demo_seed

    database_path = tmp_path / "rollback.db"
    with get_connection(database_path) as connection:
        initialize_database(connection)
        demo_seed.seed_dashboard(connection)

    with get_connection(database_path) as connection:
        before = [tuple(row) for row in connection.execute("SELECT * FROM ledger_entries ORDER BY seq").fetchall()]

    original_create_action = demo_seed.create_action_in_transaction
    calls = 0

    def fail_on_second_action(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("injected seed failure")
        return original_create_action(*args, **kwargs)

    monkeypatch.setattr(demo_seed, "create_action_in_transaction", fail_on_second_action)
    with pytest.raises(RuntimeError, match="injected seed failure"):
        with get_connection(database_path) as connection:
            demo_seed.seed_dashboard(connection, reset=True)

    with get_connection(database_path) as connection:
        after = [tuple(row) for row in connection.execute("SELECT * FROM ledger_entries ORDER BY seq").fetchall()]
        assert after == before
        assert verify_chain(connection) == {
            "valid": True,
            "entries_checked": 15,
            "first_broken_seq": None,
            "reason": None,
        }
