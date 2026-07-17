from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
import json
from pathlib import Path
import shutil
import subprocess
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE_URL = "http://localhost:8000"


class VerificationFailure(RuntimeError):
    """A verification claim did not match the observed evidence."""


@dataclass(frozen=True)
class HttpResult:
    method: str
    url: str
    status: int
    body: Any


class CheckResults:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0

    def record(self, name: str, check: Callable[[], None]) -> bool:
        try:
            check()
        except Exception as error:
            self.failed += 1
            print(f"FAIL {name}: {error}")
            return False
        self.passed += 1
        print(f"PASS {name}")
        return True

    @property
    def exit_code(self) -> int:
        return 0 if self.failed == 0 else 1


def record_guarded(
    results: CheckResults,
    name: str,
    prerequisites: Mapping[str, bool],
    check: Callable[[], None],
) -> bool:
    failed = [prerequisite for prerequisite, passed in prerequisites.items() if not passed]
    if failed:
        return results.record(
            name,
            lambda: require(False, f"prerequisite failed ({', '.join(failed)}); mutation skipped"),
        )
    return results.record(name, check)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationFailure(message)


def format_http_result(result: HttpResult) -> str:
    body = json.dumps(result.body, indent=2, sort_keys=True, ensure_ascii=False)
    return f"{result.method} {result.url}\nHTTP {result.status}\n{body}"


def validate_dashboard_summary(summary: Mapping[str, Any]) -> None:
    ledger = summary.get("ledger") or {}
    require(int(summary.get("blocked_count", 0)) >= 1, "dashboard blocked_count is below 1")
    require(summary.get("agents_online") == 3, "dashboard agents_online is not 3")
    require(ledger.get("valid") is True, "dashboard ledger.valid is not true")


def validate_chain(
    result: Mapping[str, Any],
    *,
    expected_valid: bool,
    expected_broken_seq: int | None = None,
) -> None:
    require(result.get("valid") is expected_valid, f"ledger valid was not {expected_valid}")
    if expected_valid:
        require(result.get("first_broken_seq") is None, "valid chain reports a broken sequence")
        return
    require(
        result.get("first_broken_seq") == expected_broken_seq,
        f"first_broken_seq was not {expected_broken_seq}",
    )


BACKUP_SQLITE_CODE = """
import base64
import os
import sqlite3
import sys

connection = sqlite3.connect(os.environ["AGENT_GUARDRAIL_DB"])
row = connection.execute(
    "SELECT snapshot FROM ledger_entries WHERE seq = ?", (int(sys.argv[1]),)
).fetchone()
if row is None:
    raise RuntimeError("ledger sequence not found")
print(base64.b64encode(row[0].encode("utf-8")).decode("ascii"))
""".strip()

TAMPER_SQLITE_CODE = """
import json
import os
import sqlite3
import sys

seq = int(sys.argv[1])
connection = sqlite3.connect(os.environ["AGENT_GUARDRAIL_DB"])
row = connection.execute(
    "SELECT snapshot FROM ledger_entries WHERE seq = ?", (seq,)
).fetchone()
if row is None:
    raise RuntimeError("ledger sequence not found")
snapshot = json.loads(row[0])
snapshot["verification_tamper"] = "modified"
tampered = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
connection.execute("UPDATE ledger_entries SET snapshot = ? WHERE seq = ?", (tampered, seq))
connection.commit()
print(f"tampered ledger snapshot at seq {seq}")
""".strip()

RESTORE_SQLITE_CODE = """
import base64
import os
import sqlite3
import sys

seq = int(sys.argv[1])
original = base64.b64decode(sys.argv[2]).decode("utf-8")
connection = sqlite3.connect(os.environ["AGENT_GUARDRAIL_DB"])
connection.execute("UPDATE ledger_entries SET snapshot = ? WHERE seq = ?", (original, seq))
connection.commit()
print(f"restored ledger snapshot at seq {seq}")
""".strip()


def build_sqlite_command(
    operation: str,
    seq: int,
    *,
    original_snapshot_b64: str | None = None,
    compose_command: Sequence[str] = ("docker-compose",),
) -> list[str]:
    programs = {
        "backup": BACKUP_SQLITE_CODE,
        "tamper": TAMPER_SQLITE_CODE,
        "restore": RESTORE_SQLITE_CODE,
    }
    require(operation in programs, f"unsupported SQLite operation: {operation}")
    command = [*compose_command, "exec", "-T", "backend", "python", "-c", programs[operation], str(seq)]
    if operation == "restore":
        require(original_snapshot_b64 is not None, "restore requires the original snapshot")
        command.append(original_snapshot_b64)
    return command


def find_flagship_action(
    actions: Sequence[Mapping[str, Any]],
    ledger_entries: Sequence[Mapping[str, Any]],
) -> tuple[Mapping[str, Any], Mapping[str, Any]]:
    action = next(
        (
            item
            for item in actions
            if item.get("action_type") == "payment"
            and item.get("counterparty") == "unknown-vendor.xyz"
            and item.get("status") == "blocked"
            and (item.get("intent_verdict") or {}).get("verdict") == "hijack_suspected"
            and float((item.get("intent_verdict") or {}).get("confidence", -1)) == 0.97
        ),
        None,
    )
    require(action is not None, "flagship blocked hijack action was not found")
    entry = next(
        (
            item
            for item in ledger_entries
            if item.get("action_id") == action.get("id")
            and (item.get("snapshot") or {}).get("amount_cents") == 500_000
            and (item.get("snapshot") or {}).get("counterparty") == "unknown-vendor.xyz"
        ),
        None,
    )
    require(entry is not None, "flagship ledger snapshot does not persist amount_cents=500000")
    return action, entry


def validate_policy_block(action: Mapping[str, Any]) -> None:
    reasons = action.get("reasons") or []
    require(action.get("status") == "blocked", "policy live test was not blocked")
    require(action.get("counterparty") == "nowhere.example", "policy live test counterparty changed")
    require(action.get("amount") == "9999.99", "policy live test amount changed")
    require(len(reasons) >= 2, "policy live test did not return multiple reasons")


def validate_policy_ledger_entry(action: Mapping[str, Any], entry: Mapping[str, Any]) -> None:
    snapshot = entry.get("snapshot") or {}
    require(entry.get("action_id") == action.get("id"), "latest ledger entry is not the policy test action")
    require(entry.get("event_type") == "action_evaluated", "policy test ledger event type changed")
    require(snapshot.get("amount_cents") == 999_999, "policy test was not persisted as 999999 cents")
    require(snapshot.get("decision") == "BLOCK", "policy test ledger decision was not BLOCK")


def validate_approval_transition(
    pending: Mapping[str, Any],
    approved: Mapping[str, Any],
    entries_before: int,
    entries_after: int,
) -> None:
    require(pending.get("status") == "pending_approval", "approval test did not start pending")
    require(approved.get("id") == pending.get("id"), "approval response changed action id")
    require(approved.get("status") == "allowed", "approved action did not become allowed")
    require(entries_after == entries_before + 2, "approval flow did not append exactly two ledger entries")


def request_json(
    method: str,
    path: str,
    payload: Mapping[str, Any] | None = None,
    *,
    base_url: str = DEFAULT_BASE_URL,
) -> HttpResult:
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            status = response.status
            raw_body = response.read().decode("utf-8")
    except HTTPError as error:
        status = error.code
        raw_body = error.read().decode("utf-8")
    try:
        body: Any = json.loads(raw_body) if raw_body else None
    except json.JSONDecodeError:
        body = raw_body
    result = HttpResult(method=method, url=url, status=status, body=body)
    print()
    print(format_http_result(result))
    return result


def require_http(result: HttpResult, expected_status: int) -> Any:
    require(result.status == expected_status, f"expected HTTP {expected_status}, got {result.status}")
    return result.body


def resolve_compose_command() -> tuple[str, ...]:
    legacy = shutil.which("docker-compose")
    if legacy:
        return (legacy,)
    docker = shutil.which("docker")
    if docker:
        return (docker, "compose")
    raise VerificationFailure("neither docker-compose nor docker was found on PATH")


def run_process(command: Sequence[str], *, print_stdout: bool = True) -> str:
    completed = subprocess.run(
        list(command),
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()
    if print_stdout and stdout:
        print(stdout)
    if completed.returncode != 0:
        detail = stderr or stdout or f"exit code {completed.returncode}"
        raise VerificationFailure(f"container SQLite command failed: {detail}")
    return stdout


def verify_health() -> None:
    result = request_json("GET", "/health")
    body = require_http(result, 200)
    require(body == {"status": "ok"}, "health response body was not {'status': 'ok'}")


def verify_dashboard_summary() -> None:
    result = request_json("GET", "/dashboard/summary")
    body = require_http(result, 200)
    require(isinstance(body, Mapping), "dashboard summary was not a JSON object")
    validate_dashboard_summary(body)


def verify_flagship(context: dict[str, Any]) -> None:
    actions_result = request_json("GET", "/actions?status=blocked&action_type=payment&limit=1000")
    actions = require_http(actions_result, 200)
    ledger_result = request_json("GET", "/ledger?limit=1000&offset=0")
    ledger_entries = require_http(ledger_result, 200)
    require(isinstance(actions, list), "actions response was not a JSON array")
    require(isinstance(ledger_entries, list), "ledger response was not a JSON array")
    action, entry = find_flagship_action(actions, ledger_entries)
    context["agent_id"] = int(action["agent_id"])
    print(
        "MATCH flagship: "
        f"action_id={action['id']} amount_cents={entry['snapshot']['amount_cents']} "
        f"counterparty={action['counterparty']} confidence={action['intent_verdict']['confidence']}"
    )


def require_procurement_agent(context: Mapping[str, Any]) -> int:
    agent_id = context.get("agent_id")
    require(isinstance(agent_id, int), "procurement agent id is unavailable because flagship verification failed")
    return agent_id


def verify_policy_floor(context: Mapping[str, Any]) -> None:
    agent_id = require_procurement_agent(context)
    result = request_json(
        "POST",
        "/actions",
        {
            "agent_id": agent_id,
            "action_type": "payment",
            "amount": "9999.99",
            "counterparty": "nowhere.example",
            "payload": {"verification": "policy-floor-live-test"},
        },
    )
    action = require_http(result, 201)
    require(isinstance(action, Mapping), "policy response was not a JSON object")
    validate_policy_block(action)
    ledger_result = request_json("GET", "/ledger?limit=1&offset=0")
    entries = require_http(ledger_result, 200)
    require(isinstance(entries, list) and len(entries) == 1, "latest ledger response did not contain one entry")
    validate_policy_ledger_entry(action, entries[0])


def verify_approval_loop(context: Mapping[str, Any]) -> None:
    agent_id = require_procurement_agent(context)
    before_result = request_json("GET", "/ledger/verify")
    before = require_http(before_result, 200)
    require(isinstance(before, Mapping), "ledger verification was not a JSON object")
    validate_chain(before, expected_valid=True)

    pending_result = request_json(
        "POST",
        "/actions",
        {
            "agent_id": agent_id,
            "action_type": "payment",
            "amount": "700.00",
            "counterparty": "stripe.com",
            "payload": {"verification": "approval-loop-live-test"},
        },
    )
    pending = require_http(pending_result, 201)
    require(isinstance(pending, Mapping), "pending response was not a JSON object")
    action_id = pending.get("id")
    require(isinstance(action_id, int), "pending action id is missing")

    approved_result = request_json("POST", f"/actions/{action_id}/approve")
    approved = require_http(approved_result, 200)
    require(isinstance(approved, Mapping), "approval response was not a JSON object")

    after_result = request_json("GET", "/ledger/verify")
    after = require_http(after_result, 200)
    require(isinstance(after, Mapping), "post-approval ledger verification was not a JSON object")
    validate_chain(after, expected_valid=True)
    validate_approval_transition(
        pending,
        approved,
        entries_before=int(before["entries_checked"]),
        entries_after=int(after["entries_checked"]),
    )


def verify_reversible_tamper(seq: int = 2) -> None:
    before_result = request_json("GET", "/ledger/verify")
    before = require_http(before_result, 200)
    require(isinstance(before, Mapping), "pre-tamper ledger verification was not a JSON object")
    validate_chain(before, expected_valid=True)

    compose_command = resolve_compose_command()
    original_snapshot_b64 = run_process(
        build_sqlite_command("backup", seq, compose_command=compose_command),
        print_stdout=False,
    )
    require(bool(original_snapshot_b64), "could not capture the original ledger snapshot")
    tampered = False
    try:
        print(f"SQL UPDATE ledger_entries SET snapshot = <tampered JSON> WHERE seq = {seq}")
        tampered = True
        run_process(build_sqlite_command("tamper", seq, compose_command=compose_command))

        after_result = request_json("GET", "/ledger/verify")
        after = require_http(after_result, 200)
        require(isinstance(after, Mapping), "post-tamper ledger verification was not a JSON object")
        validate_chain(after, expected_valid=False, expected_broken_seq=seq)
    finally:
        if tampered:
            print(f"SQL RESTORE ledger_entries.snapshot WHERE seq = {seq}")
            run_process(
                build_sqlite_command(
                    "restore",
                    seq,
                    original_snapshot_b64=original_snapshot_b64,
                    compose_command=compose_command,
                )
            )
            restored_result = request_json("GET", "/ledger/verify")
            restored = require_http(restored_result, 200)
            require(isinstance(restored, Mapping), "restored ledger verification was not a JSON object")
            validate_chain(restored, expected_valid=True)


def main() -> int:
    print("AgentGuard final verification pass")
    print(f"Target: {DEFAULT_BASE_URL}")
    results = CheckResults()
    context: dict[str, Any] = {}
    health_ok = results.record("a. backend health returns HTTP 200", verify_health)
    summary_ok = results.record("b. dashboard summary safety counters", verify_dashboard_summary)
    flagship_ok = results.record("c. flagship 500000-cent hijack action", lambda: verify_flagship(context))
    policy_ok = record_guarded(
        results,
        "d. deterministic policy floor blocks live action",
        {"health": health_ok, "valid dashboard ledger": summary_ok, "flagship": flagship_ok},
        lambda: verify_policy_floor(context),
    )
    approval_ok = record_guarded(
        results,
        "e. pending approval transitions to allowed",
        {"health": health_ok, "valid dashboard ledger": summary_ok, "policy floor": policy_ok},
        lambda: verify_approval_loop(context),
    )
    record_guarded(
        results,
        "f. ledger detects and recovers from direct SQL tampering",
        {
            "health": health_ok,
            "valid dashboard ledger": summary_ok,
            "policy floor": policy_ok,
            "approval loop": approval_ok,
        },
        verify_reversible_tamper,
    )
    if results.exit_code == 0:
        print("PASS g. all checks passed; exit code 0")
    else:
        print(f"FAIL g. {results.failed} check(s) failed; exit code 1")
    print(f"RESULT: {results.passed} passed, {results.failed} failed")
    return results.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
