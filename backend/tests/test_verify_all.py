from __future__ import annotations

import base64
import copy
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "verify_all.py"


def load_verify_module() -> ModuleType:
    assert SCRIPT_PATH.is_file(), "scripts/verify_all.py is missing"
    spec = importlib.util.spec_from_file_location("agentguard_verify_all", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_verify_script_is_importable() -> None:
    assert load_verify_module().__name__ == "agentguard_verify_all"


FLAGSHIP_ACTION = {
    "id": 15,
    "action_type": "payment",
    "amount": "5000.00",
    "counterparty": "unknown-vendor.xyz",
    "status": "blocked",
    "intent_verdict": {
        "verdict": "hijack_suspected",
        "confidence": 0.97,
    },
}
FLAGSHIP_LEDGER_ENTRY = {
    "action_id": 15,
    "snapshot": {
        "action_type": "payment",
        "amount_cents": 500_000,
        "counterparty": "unknown-vendor.xyz",
        "intent_verdict": {
            "verdict": "hijack_suspected",
            "confidence": 0.97,
        },
    },
}


def test_flagship_requires_integer_cents_and_intent_verdict() -> None:
    verify = load_verify_module()

    action, entry = verify.find_flagship_action([FLAGSHIP_ACTION], [FLAGSHIP_LEDGER_ENTRY])

    assert action["counterparty"] == "unknown-vendor.xyz"
    assert entry["snapshot"]["amount_cents"] == 500_000


def test_flagship_rejects_wrong_confidence() -> None:
    verify = load_verify_module()
    action = copy.deepcopy(FLAGSHIP_ACTION)
    action["intent_verdict"]["confidence"] = 0.96

    with pytest.raises(verify.VerificationFailure, match="flagship blocked hijack action"):
        verify.find_flagship_action([action], [FLAGSHIP_LEDGER_ENTRY])


def test_flagship_rejects_non_500000_cent_snapshot() -> None:
    verify = load_verify_module()
    entry = copy.deepcopy(FLAGSHIP_LEDGER_ENTRY)
    entry["snapshot"]["amount_cents"] = 499_999

    with pytest.raises(verify.VerificationFailure, match="amount_cents=500000"):
        verify.find_flagship_action([FLAGSHIP_ACTION], [entry])


def test_policy_block_requires_multiple_reasons() -> None:
    verify = load_verify_module()

    verify.validate_policy_block(
        {
            "status": "blocked",
            "counterparty": "nowhere.example",
            "amount": "9999.99",
            "reasons": ["merchant is not allowed", "amount exceeds cap"],
        }
    )


def test_policy_block_rejects_single_reason() -> None:
    verify = load_verify_module()

    with pytest.raises(verify.VerificationFailure, match="multiple reasons"):
        verify.validate_policy_block(
            {
                "status": "blocked",
                "counterparty": "nowhere.example",
                "amount": "9999.99",
                "reasons": ["merchant is not allowed"],
            }
        )


def test_policy_block_ledger_snapshot_uses_exact_integer_cents() -> None:
    verify = load_verify_module()

    verify.validate_policy_ledger_entry(
        {"id": 16, "status": "blocked"},
        {
            "action_id": 16,
            "event_type": "action_evaluated",
            "snapshot": {"amount_cents": 999_999, "decision": "BLOCK"},
        },
    )


def test_approval_transition_requires_allowed_and_two_entries() -> None:
    verify = load_verify_module()

    verify.validate_approval_transition(
        {"id": 17, "status": "pending_approval"},
        {"id": 17, "status": "allowed"},
        entries_before=16,
        entries_after=18,
    )


def test_approval_transition_rejects_wrong_ledger_increment() -> None:
    verify = load_verify_module()

    with pytest.raises(verify.VerificationFailure, match="exactly two ledger entries"):
        verify.validate_approval_transition(
            {"id": 17, "status": "pending_approval"},
            {"id": 17, "status": "allowed"},
            entries_before=16,
            entries_after=17,
        )


def test_check_results_exit_zero_only_when_every_check_passes() -> None:
    verify = load_verify_module()
    results = verify.CheckResults()

    assert results.record("passing check", lambda: None) is True
    assert results.exit_code == 0

    def fail() -> None:
        raise AssertionError("expected failure")

    assert results.record("failing check", fail) is False
    assert results.exit_code == 1


def test_guarded_mutation_does_not_run_after_failed_prerequisite() -> None:
    verify = load_verify_module()
    results = verify.CheckResults()
    called = False

    def mutate() -> None:
        nonlocal called
        called = True

    passed = verify.record_guarded(
        results,
        "guarded mutation",
        {"health": True, "valid ledger": False},
        mutate,
    )

    assert passed is False
    assert called is False
    assert results.exit_code == 1


def test_http_output_contains_status_and_full_json() -> None:
    verify = load_verify_module()
    result = verify.HttpResult(
        method="GET",
        url="http://localhost:8000/health",
        status=200,
        body={"status": "ok"},
    )

    output = verify.format_http_result(result)

    assert "GET http://localhost:8000/health" in output
    assert "HTTP 200" in output
    assert '"status": "ok"' in output


def test_dashboard_summary_requires_seeded_agents_block_and_valid_ledger() -> None:
    verify = load_verify_module()

    verify.validate_dashboard_summary(
        {
            "blocked_count": 1,
            "agents_online": 3,
            "ledger": {"entries": 15, "valid": True},
        }
    )


def test_dashboard_summary_rejects_invalid_ledger() -> None:
    verify = load_verify_module()

    with pytest.raises(verify.VerificationFailure, match="ledger.valid"):
        verify.validate_dashboard_summary(
            {
                "blocked_count": 1,
                "agents_online": 3,
                "ledger": {"entries": 15, "valid": False},
            }
        )


def test_chain_validation_requires_exact_broken_sequence() -> None:
    verify = load_verify_module()

    verify.validate_chain(
        {
            "valid": False,
            "entries_checked": 1,
            "first_broken_seq": 2,
            "reason": "entry_hash mismatch at seq 2",
        },
        expected_valid=False,
        expected_broken_seq=2,
    )


def test_chain_validation_rejects_wrong_broken_sequence() -> None:
    verify = load_verify_module()

    with pytest.raises(verify.VerificationFailure, match="first_broken_seq was not 2"):
        verify.validate_chain(
            {
                "valid": False,
                "entries_checked": 2,
                "first_broken_seq": 3,
                "reason": "entry_hash mismatch at seq 3",
            },
            expected_valid=False,
            expected_broken_seq=2,
        )


def test_tamper_commands_target_only_the_selected_snapshot() -> None:
    verify = load_verify_module()

    backup = verify.build_sqlite_command("backup", 2, compose_command=("docker-compose",))
    tamper = verify.build_sqlite_command("tamper", 2, compose_command=("docker-compose",))
    restore = verify.build_sqlite_command(
        "restore",
        2,
        original_snapshot_b64="eyJvcmlnaW5hbCI6dHJ1ZX0=",
        compose_command=("docker-compose",),
    )

    assert tamper[:6] == ["docker-compose", "exec", "-T", "backend", "python", "-c"]
    assert "SELECT snapshot FROM ledger_entries WHERE seq = ?" in backup[6]
    assert "UPDATE ledger_entries SET snapshot = ? WHERE seq = ?" in tamper[6]
    assert "UPDATE ledger_entries SET snapshot = ? WHERE seq = ?" in restore[6]
    assert tamper[-1] == "2"
    assert restore[-2:] == ["2", "eyJvcmlnaW5hbCI6dHJ1ZX0="]


def test_tamper_process_failure_still_restores_original_snapshot(monkeypatch) -> None:
    verify = load_verify_module()
    valid_result = verify.HttpResult(
        "GET",
        "http://localhost:8000/ledger/verify",
        200,
        {"valid": True, "entries_checked": 18, "first_broken_seq": None, "reason": None},
    )
    responses = iter((valid_result, valid_result))
    monkeypatch.setattr(verify, "request_json", lambda *_args, **_kwargs: next(responses))
    monkeypatch.setattr(verify, "resolve_compose_command", lambda: ("docker-compose",))
    operations: list[str] = []

    def fail_after_tamper(command, *, print_stdout=True):
        code = command[6]
        if code == verify.BACKUP_SQLITE_CODE:
            return base64.b64encode(b'{"original":true}').decode("ascii")
        if code == verify.TAMPER_SQLITE_CODE:
            operations.append("tamper")
            raise verify.VerificationFailure("simulated failure after SQLite update")
        if code == verify.RESTORE_SQLITE_CODE:
            operations.append("restore")
            return "restored ledger snapshot at seq 2"
        raise AssertionError("unexpected command")

    monkeypatch.setattr(verify, "run_process", fail_after_tamper)

    with pytest.raises(verify.VerificationFailure, match="simulated failure"):
        verify.verify_reversible_tamper(seq=2)

    assert operations == ["tamper", "restore"]
