from app.policy import decision_to_status, evaluate


POLICY = {
    "per_transaction_cap": 100_000,
    "daily_cap": 1_000_000,
    "merchant_allowlist": ["openai.com", "aws.amazon.com"],
    "approval_threshold": 50_000,
    "email_domain_allowlist": ["matteomisiani.studio"],
    "max_emails_per_hour": 20,
    "api_domain_allowlist": ["api.openai.com", "api.stripe.com"],
    "export_max_records": 100,
    "blocked_commands": ["rm", "del", "drop", "shutdown", "format"],
}


def action(action_type: str, **values: object) -> dict[str, object]:
    return {
        "action_type": action_type,
        "amount_cents": values.get("amount_cents"),
        "counterparty": values.get("counterparty", ""),
        "payload": values.get("payload", {}),
    }


def context(**values: object) -> dict[str, object]:
    return {"daily_allowed_cents": 0, "emails_last_hour": 0, **values}


def test_payment_200_is_allowed():
    result = evaluate(action("payment", amount_cents=20_000, counterparty="openai.com"), POLICY, context())

    assert result == {"decision": "ALLOW", "reasons": []}


def test_payment_700_is_pending_approval():
    result = evaluate(action("payment", amount_cents=70_000, counterparty="openai.com"), POLICY, context())

    assert result["decision"] == "PENDING_APPROVAL"
    assert "amount 700.00 EUR exceeds approval_threshold 500.00 EUR" in result["reasons"]


def test_payment_5000_is_blocked_and_collects_all_reasons():
    result = evaluate(
        action("payment", amount_cents=500_000, counterparty="openai.com"),
        POLICY,
        context(daily_allowed_cents=600_000),
    )

    assert result["decision"] == "BLOCK"
    assert len(result["reasons"]) == 3


def test_payment_unknown_vendor_is_blocked():
    result = evaluate(action("payment", amount_cents=30_000, counterparty="unknown-vendor.xyz"), POLICY, context())

    assert result["decision"] == "BLOCK"
    assert result["reasons"] == ["counterparty unknown-vendor.xyz is not in merchant_allowlist"]


def test_payment_daily_cap_breach_is_blocked():
    result = evaluate(
        action("payment", amount_cents=50_001, counterparty="openai.com"),
        POLICY,
        context(daily_allowed_cents=950_000),
    )

    assert result["decision"] == "BLOCK"
    assert "daily total 1,000,001 cents exceeds daily_cap 1,000,000 cents" in result["reasons"]


def test_email_random_domain_is_pending():
    result = evaluate(action("email_send", counterparty="user@random-domain.com"), POLICY, context())

    assert result["decision"] == "PENDING_APPROVAL"


def test_email_21st_in_hour_is_blocked():
    result = evaluate(
        action("email_send", counterparty="user@matteomisiani.studio"),
        POLICY,
        context(emails_last_hour=20),
    )

    assert result["decision"] == "BLOCK"


def test_data_delete_is_pending():
    assert evaluate(action("data_delete", counterparty="records"), POLICY, context())["decision"] == "PENDING_APPROVAL"


def test_large_data_export_is_pending():
    result = evaluate(
        action("data_export", counterparty="api.openai.com", payload={"record_count": 5_000}),
        POLICY,
        context(),
    )

    assert result["decision"] == "PENDING_APPROVAL"


def test_data_export_to_evil_domain_is_blocked():
    result = evaluate(
        action("data_export", counterparty="evil-domain.xyz", payload={"record_count": 10}),
        POLICY,
        context(),
    )

    assert result["decision"] == "BLOCK"


def test_external_api_unknown_domain_is_pending():
    result = evaluate(action("external_api_call", counterparty="api.unknown.io"), POLICY, context())

    assert result["decision"] == "PENDING_APPROVAL"


def test_blocked_system_command_is_blocked():
    result = evaluate(
        action("system_command", counterparty="host", payload={"command": "rm -rf /data"}),
        POLICY,
        context(),
    )

    assert result["decision"] == "BLOCK"


def test_non_blocked_system_command_is_pending():
    result = evaluate(
        action("system_command", counterparty="host", payload={"command": "ls -la"}),
        POLICY,
        context(),
    )

    assert result["decision"] == "PENDING_APPROVAL"


def test_decision_to_status_is_centralized():
    assert decision_to_status("ALLOW") == "allowed"
    assert decision_to_status("PENDING_APPROVAL") == "pending_approval"
    assert decision_to_status("BLOCK") == "blocked"
