import json
import sqlite3

from app.database import initialize_database


def test_initialize_database_creates_schema_and_cent_policy():
    connection = sqlite3.connect(":memory:")

    initialize_database(connection)

    tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    assert {"agents", "actions", "policies", "ledger_entries", "missions"}.issubset(tables)

    action_columns = {
        row[1]: row[2]
        for row in connection.execute("PRAGMA table_info(actions)").fetchall()
    }
    assert action_columns["amount_cents"] == "INTEGER"
    assert "amount" not in action_columns

    policy_row = connection.execute(
        "SELECT name, rules, active FROM policies WHERE active = 1"
    ).fetchone()
    assert policy_row is not None
    assert policy_row[0] == "default"
    assert policy_row[2] == 1
    rules = json.loads(policy_row[1])
    assert rules["per_transaction_cap"] == 100_000
    assert rules["daily_cap"] == 1_000_000
    assert rules["approval_threshold"] == 50_000


def test_initialize_database_is_idempotent_and_enables_foreign_keys():
    connection = sqlite3.connect(":memory:")

    initialize_database(connection)
    initialize_database(connection)

    assert connection.execute("SELECT COUNT(*) FROM policies").fetchone()[0] == 1
    assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_actions_reject_invalid_status_and_action_type():
    connection = sqlite3.connect(":memory:")
    initialize_database(connection)
    agent_id = connection.execute(
        "INSERT INTO agents (name, declared_mission) VALUES (?, ?)",
        ("Test Agent", "Test mission"),
    ).lastrowid

    for column, value in (("status", "unknown"), ("action_type", "unknown")):
        try:
            connection.execute(
                f"INSERT INTO actions (agent_id, action_type, counterparty, payload, status) "
                f"VALUES (?, ?, ?, ?, ?)",
                (agent_id, value if column == "action_type" else "payment", "target", "{}", value if column == "status" else "allowed"),
            )
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError(f"invalid {column} was accepted")
