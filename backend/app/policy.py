from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal, Mapping


Decision = Literal["ALLOW", "PENDING_APPROVAL", "BLOCK"]
Status = Literal["allowed", "pending_approval", "blocked"]


def decision_to_status(decision: Decision) -> Status:
    """Map one policy decision to its persisted action status."""
    mapping: dict[Decision, Status] = {
        "ALLOW": "allowed",
        "PENDING_APPROVAL": "pending_approval",
        "BLOCK": "blocked",
    }
    return mapping[decision]


def evaluate(
    action: Mapping[str, Any],
    policy: Mapping[str, Any],
    context: Mapping[str, Any],
) -> dict[str, Any]:
    """Evaluate one action without I/O, clock access, or hidden state."""
    action_type = str(action.get("action_type", ""))
    counterparty = str(action.get("counterparty", ""))
    payload = action.get("payload") or {}
    amount_cents = action.get("amount_cents")
    reasons: list[str] = []
    has_block = False
    has_pending = False

    if action_type == "payment":
        merchant_allowlist = _lower_strings(policy.get("merchant_allowlist", []))
        if counterparty.lower() not in merchant_allowlist:
            reasons.append(f"counterparty {counterparty} is not in merchant_allowlist")
            has_block = True

        if isinstance(amount_cents, int):
            per_transaction_cap = int(policy["per_transaction_cap"])
            if amount_cents > per_transaction_cap:
                reasons.append(
                    f"amount {_format_eur(amount_cents)} EUR exceeds "
                    f"per_transaction_cap {_format_eur(per_transaction_cap)} EUR"
                )
                has_block = True

            daily_allowed_cents = int(context.get("daily_allowed_cents", 0))
            daily_total_cents = amount_cents + daily_allowed_cents
            daily_cap = int(policy["daily_cap"])
            if daily_total_cents > daily_cap:
                reasons.append(
                    f"daily total {daily_total_cents:,} cents exceeds "
                    f"daily_cap {daily_cap:,} cents"
                )
                has_block = True

            approval_threshold = int(policy["approval_threshold"])
            if amount_cents > approval_threshold:
                reasons.append(
                    f"amount {_format_eur(amount_cents)} EUR exceeds "
                    f"approval_threshold {_format_eur(approval_threshold)} EUR"
                )
                has_pending = True

    elif action_type == "email_send":
        email_domain = _email_domain(counterparty)
        allowed_domains = _lower_strings(policy.get("email_domain_allowlist", []))
        if email_domain.lower() not in allowed_domains:
            reasons.append(f"email domain {email_domain} is not in email_domain_allowlist")
            has_pending = True

        emails_last_hour = int(context.get("emails_last_hour", 0))
        max_emails_per_hour = int(policy["max_emails_per_hour"])
        if emails_last_hour >= max_emails_per_hour:
            reasons.append(
                f"emails in the last hour {emails_last_hour} reaches "
                f"max_emails_per_hour {max_emails_per_hour}"
            )
            has_block = True

    elif action_type == "data_delete":
        reasons.append("data_delete always requires approval")
        has_pending = True

    elif action_type == "data_export":
        record_count = int(payload.get("record_count", 0)) if isinstance(payload, Mapping) else 0
        export_max_records = int(policy["export_max_records"])
        if record_count > export_max_records:
            reasons.append(
                f"record_count {record_count} exceeds export_max_records {export_max_records}"
            )
            has_pending = True

        api_domains = _lower_strings(policy.get("api_domain_allowlist", []))
        if counterparty.lower() not in api_domains:
            reasons.append(f"destination domain {counterparty} is not in api_domain_allowlist")
            has_block = True

    elif action_type == "external_api_call":
        api_domains = _lower_strings(policy.get("api_domain_allowlist", []))
        if counterparty.lower() not in api_domains:
            reasons.append(f"counterparty {counterparty} is not in api_domain_allowlist")
            has_pending = True

    elif action_type == "system_command":
        command = str(payload.get("command", "")) if isinstance(payload, Mapping) else ""
        lowered_command = command.lower()
        for token in policy.get("blocked_commands", []):
            if str(token).lower() in lowered_command:
                reasons.append(f"command contains blocked token {token}")
                has_block = True
        if not has_block:
            reasons.append("system_command requires approval")
            has_pending = True

    decision: Decision
    if has_block:
        decision = "BLOCK"
    elif has_pending:
        decision = "PENDING_APPROVAL"
    else:
        decision = "ALLOW"
    return {"decision": decision, "reasons": reasons}


def _lower_strings(values: Any) -> set[str]:
    return {str(value).lower() for value in values}


def _email_domain(recipient: str) -> str:
    return recipient.rsplit("@", 1)[-1]


def _format_eur(amount_cents: int) -> str:
    return f"{Decimal(amount_cents) / Decimal(100):.2f}"
