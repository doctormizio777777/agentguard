from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
from typing import TypeAlias


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "agent_payment_guardrail.db"
DATABASE_PATH = DEFAULT_DATABASE_PATH
DatabasePath: TypeAlias = str | os.PathLike[str]
DEFAULT_POLICY_RULES = {
    "per_transaction_cap": 100_000,
    "daily_cap": 1_000_000,
    "merchant_allowlist": [
        "openai.com",
        "aws.amazon.com",
        "vercel.com",
        "github.com",
        "stripe.com",
    ],
    "approval_threshold": 50_000,
    "email_domain_allowlist": ["matteomisiani.studio"],
    "max_emails_per_hour": 20,
    "api_domain_allowlist": ["api.openai.com", "api.stripe.com", "api.github.com"],
    "export_max_records": 100,
    "blocked_commands": ["rm", "del", "drop", "shutdown", "format"],
}


def get_connection(database_path: DatabasePath | None = None) -> sqlite3.Connection:
    configured_path = database_path or os.getenv("AGENT_GUARDRAIL_DB") or DATABASE_PATH
    connection = sqlite3.connect(configured_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(connection: sqlite3.Connection) -> None:
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            declared_mission TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id INTEGER NOT NULL,
            action_type TEXT NOT NULL CHECK (action_type IN (
                'payment', 'email_send', 'data_delete', 'data_export',
                'external_api_call', 'system_command'
            )),
            amount_cents INTEGER,
            currency TEXT NOT NULL DEFAULT 'EUR',
            counterparty TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL CHECK (status IN ('allowed', 'pending_approval', 'blocked')),
            policy_reason TEXT NOT NULL DEFAULT '',
            intent_verdict TEXT,
            intent_model TEXT,
            intent_latency_ms INTEGER,
            intent_error TEXT,
            scenario_tag TEXT,
            scenario_active INTEGER NOT NULL DEFAULT 1 CHECK (scenario_active IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents (id)
        );

        CREATE TABLE IF NOT EXISTS policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            rules TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ledger_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seq INTEGER UNIQUE NOT NULL,
            action_id INTEGER NOT NULL,
            event_type TEXT NOT NULL CHECK (event_type IN (
                'action_evaluated', 'action_approved', 'action_rejected'
            )),
            snapshot TEXT NOT NULL,
            prev_hash TEXT NOT NULL,
            entry_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (action_id) REFERENCES actions (id)
        );

        CREATE TABLE IF NOT EXISTS missions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id INTEGER NOT NULL,
            mission_text TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents (id)
        );

        CREATE TABLE IF NOT EXISTS demo_scenario_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            agent_id INTEGER NOT NULL,
            last_step INTEGER NOT NULL CHECK (last_step BETWEEN 0 AND 5),
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents (id)
        );

        CREATE TABLE IF NOT EXISTS demo_tamper_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            tampered_seq INTEGER NOT NULL,
            original_snapshot TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    action_columns = {row[1] for row in connection.execute("PRAGMA table_info(actions)").fetchall()}
    for column, definition in (
        ("intent_verdict", "TEXT"),
        ("intent_model", "TEXT"),
        ("intent_latency_ms", "INTEGER"),
        ("intent_error", "TEXT"),
        ("scenario_tag", "TEXT"),
        ("scenario_active", "INTEGER NOT NULL DEFAULT 1 CHECK (scenario_active IN (0, 1))"),
    ):
        if column not in action_columns:
            connection.execute(f"ALTER TABLE actions ADD COLUMN {column} {definition}")
    ensure_default_policy(connection)
    connection.commit()


def ensure_default_policy(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        INSERT INTO policies (name, rules, active)
        SELECT ?, ?, 1
        WHERE NOT EXISTS (SELECT 1 FROM policies WHERE name = ?)
        """,
        ("default", json.dumps(DEFAULT_POLICY_RULES), "default"),
    )
