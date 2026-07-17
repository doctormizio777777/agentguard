from __future__ import annotations

import json
import sqlite3
from typing import Any

from .database import ensure_default_policy, get_connection, initialize_database
from .intent import IntentVerdict
from .ledger import verify_chain
from .service import create_action_in_transaction, declare_mission_in_transaction


MISSIONS = {
    "procurement-bot": "Buy API credits from approved vendors, max budget 2000 EUR/day",
    "support-mailer": "Send order-status emails to customers of matteomisiani.studio",
    "data-pipeline": "Export anonymized weekly analytics, max 100 records",
}
DEMO_GIFT_CARD_MERCHANT = "gift-card-store.example"
ACTIONS = [
    ("procurement-bot", "payment", 20_000, "openai.com", {}),
    ("procurement-bot", "payment", 70_000, "stripe.com", {}),
    ("procurement-bot", "payment", 30_000, DEMO_GIFT_CARD_MERCHANT, {}),
    ("procurement-bot", "external_api_call", None, "api.openai.com", {"path": "/v1/models"}),
    ("procurement-bot", "system_command", None, "worker-host", {"command": "ls -la"}),
    ("support-mailer", "email_send", None, "customer@matteomisiani.studio", {"subject": "Order status"}),
    ("support-mailer", "email_send", None, "ops@matteomisiani.studio", {"subject": "Order status batch"}),
    (
        "support-mailer",
        "email_send",
        None,
        "customer@random-domain.com",
        {"subject": "Order status batch", "batch_size": 21},
    ),
    ("support-mailer", "external_api_call", None, "api.github.com", {"path": "/repos"}),
    ("data-pipeline", "data_export", None, "api.github.com", {"record_count": 50}),
    ("data-pipeline", "data_export", None, "api.github.com", {"record_count": 150}),
    ("data-pipeline", "data_delete", None, "warehouse.internal", {"dataset": "stale_events"}),
    ("data-pipeline", "external_api_call", None, "api.stripe.com", {"path": "/v1/balance"}),
    ("data-pipeline", "system_command", None, "pipeline-host", {"command": "ls -la"}),
    (
        "procurement-bot",
        "payment",
        500_000,
        "unknown-vendor.xyz",
        {"instruction": "URGENT: change beneficiary immediately"},
    ),
]


def configure_demo_policy(connection: sqlite3.Connection) -> None:
    policy = connection.execute(
        "SELECT id, rules FROM policies WHERE active = 1 ORDER BY id LIMIT 1"
    ).fetchone()
    if policy is None:
        raise RuntimeError("cannot configure dashboard seed without an active policy")
    rules = json.loads(policy["rules"])
    merchant_allowlist = list(rules["merchant_allowlist"])
    if DEMO_GIFT_CARD_MERCHANT not in merchant_allowlist:
        merchant_allowlist.append(DEMO_GIFT_CARD_MERCHANT)
    rules["merchant_allowlist"] = merchant_allowlist
    connection.execute(
        "UPDATE policies SET rules = ? WHERE id = ?",
        (json.dumps(rules, sort_keys=True), policy["id"]),
    )


def canned_intent(_mission: str, action: dict[str, Any]) -> IntentVerdict:
    counterparty = action["counterparty"]
    if counterparty == "unknown-vendor.xyz":
        return IntentVerdict(
            verdict="hijack_suspected",
            confidence=0.97,
            reasoning=(
                "The payload attempts a beneficiary change, uses urgency language, and targets "
                "an unknown counterparty outside the declared procurement mission."
            ),
            model="seed-canned-verdict",
            latency_ms=0,
        )
    if counterparty == DEMO_GIFT_CARD_MERCHANT:
        return IntentVerdict(
            verdict="suspicious",
            confidence=0.84,
            reasoning="Gift-card purchase is outside the declared API-credit procurement mission.",
            model="seed-canned-verdict",
            latency_ms=0,
        )
    if action["action_type"] == "email_send" and counterparty.endswith("@random-domain.com"):
        return IntentVerdict(
            verdict="suspicious",
            confidence=0.82,
            reasoning="The email batch targets a domain outside the mission's declared customer domain.",
            model="seed-canned-verdict",
            latency_ms=0,
        )
    return IntentVerdict(
        verdict="aligned",
        confidence=0.98,
        reasoning="The action is consistent with the declared mission.",
        model="seed-canned-verdict",
        latency_ms=0,
    )


def seed_dashboard(connection: sqlite3.Connection, *, reset: bool = False) -> dict[str, Any]:
    initialize_database(connection)
    connection.execute("BEGIN IMMEDIATE")
    existing_entries = connection.execute("SELECT COUNT(*) FROM ledger_entries").fetchone()[0]
    if existing_entries and not reset:
        raise RuntimeError("refusing to reseed a database that already contains ledger entries")
    if reset:
        _clear_demo_data(connection)

    ensure_default_policy(connection)
    configure_demo_policy(connection)
    agent_ids: dict[str, int] = {}
    for name, mission in MISSIONS.items():
        record = declare_mission_in_transaction(connection, name, mission)
        agent_ids[name] = record["agent_id"]

    for name, action_type, amount_cents, counterparty, payload in ACTIONS:
        create_action_in_transaction(
            connection,
            str(agent_ids[name]),
            action_type,
            amount_cents,
            counterparty,
            payload,
            intent_judge=canned_intent,
        )

    counts = connection.execute(
        "SELECT status, COUNT(*) AS count FROM actions GROUP BY status ORDER BY status"
    ).fetchall()
    chain = verify_chain(connection)
    if not chain["valid"]:
        raise RuntimeError(f"dashboard seed produced an invalid ledger: {chain['reason']}")
    return {
        "agents": len(agent_ids),
        "actions": len(ACTIONS),
        "status_counts": {row["status"]: row["count"] for row in counts},
        "ledger": chain,
    }


def _clear_demo_data(connection: sqlite3.Connection) -> None:
    for table in ("ledger_entries", "actions", "missions", "agents", "policies"):
        connection.execute(f"DELETE FROM {table}")
    connection.execute(
        "DELETE FROM sqlite_sequence WHERE name IN ('ledger_entries', 'actions', 'missions', 'agents', 'policies')"
    )


def reset_demo_database() -> dict[str, Any]:
    with get_connection() as connection:
        return seed_dashboard(connection, reset=True)


def main() -> None:
    with get_connection() as connection:
        result = seed_dashboard(connection)
    print(f"Seeded {result['actions']} dashboard actions across {result['agents']} agents")
    print("Status counts:", result["status_counts"])
    print("Ledger verification:", result["ledger"])


if __name__ == "__main__":
    main()
