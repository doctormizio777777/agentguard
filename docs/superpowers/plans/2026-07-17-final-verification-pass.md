# Final Verification Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide one reproducible command that verifies AgentGuard's Dockerized safety claims and a document containing real evidence from that command.

**Architecture:** A dependency-free Python runner calls the public HTTP API, validates responses with pure helpers, and uses `docker-compose exec` only for a reversible direct-SQL tamper. Documentation is written only after collecting fresh output from a clean Compose stack.

**Tech Stack:** Python 3.11 standard library, Docker Compose, FastAPI HTTP API, SQLite, pytest, Node test runner, Next.js 15.

## Global Constraints

- No new application features or changes to backend/frontend data flow.
- Print real HTTP status codes and complete JSON responses inline.
- Restore the tampered ledger snapshot exactly and verify the clean chain.
- Exit zero only when every check passes.
- Do not print secrets or `.env` contents.

---

### Task 1: Freeze the verification helper contract

**Files:**
- Create: `backend/tests/test_verify_all.py`
- Create: `scripts/verify_all.py`

**Interfaces:**
- Produces: `HttpResult`, `CheckResults`, `format_http_result`, `find_flagship_action`, `validate_policy_block`, and `validate_approval_transition`.

- [ ] **Step 1: Write the failing existence/import test**

```python
def test_verify_script_is_importable():
    assert SCRIPT_PATH.is_file(), "scripts/verify_all.py is missing"
    assert load_verify_module().__name__ == "agentguard_verify_all"
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pytest backend/tests/test_verify_all.py::test_verify_script_is_importable -q`
Expected: FAIL with `scripts/verify_all.py is missing`.

- [ ] **Step 3: Add the minimal importable module**

```python
from __future__ import annotations
```

- [ ] **Step 4: Add failing pure-helper tests**

```python
def test_flagship_requires_integer_cents_and_intent_verdict():
    action, entry = verify.find_flagship_action([FLAGSHIP_ACTION], [FLAGSHIP_LEDGER_ENTRY])
    assert action["counterparty"] == "unknown-vendor.xyz"
    assert entry["snapshot"]["amount_cents"] == 500_000

def test_policy_block_requires_multiple_reasons():
    verify.validate_policy_block({"status": "blocked", "reasons": ["merchant", "cap"]})

def test_approval_transition_requires_allowed_and_two_entries():
    verify.validate_approval_transition(
        {"status": "pending_approval"}, {"status": "allowed"}, 16, 18
    )

def test_check_results_exit_zero_only_when_every_check_passes():
    results = verify.CheckResults()
    results.record("ok", lambda: None)
    assert results.exit_code == 0
```

- [ ] **Step 5: Run the focused file and verify RED**

Run: `pytest backend/tests/test_verify_all.py -q`
Expected: FAIL because the helper API is absent.

- [ ] **Step 6: Implement only the tested helpers and verify GREEN**

Run: `pytest backend/tests/test_verify_all.py -q`
Expected: all focused tests pass.

### Task 2: Implement live HTTP and reversible tamper orchestration

**Files:**
- Modify: `scripts/verify_all.py`
- Modify: `backend/tests/test_verify_all.py`

**Interfaces:**
- Consumes: public API at `http://localhost:8000` and `docker-compose exec -T backend`.
- Produces: `main() -> int`, which prints checks a-g and returns zero only on complete success.

- [ ] **Step 1: Add failing tests for request formatting and tamper command construction**

```python
def test_http_output_contains_status_and_full_json():
    output = verify.format_http_result(
        verify.HttpResult("GET", "http://localhost:8000/health", 200, {"status": "ok"})
    )
    assert "HTTP 200" in output
    assert '"status": "ok"' in output

def test_tamper_commands_target_only_the_selected_snapshot():
    command = verify.build_sqlite_command("tamper", 2)
    assert command[:5] == ["docker-compose", "exec", "-T", "backend", "python"]
    assert "UPDATE ledger_entries SET snapshot" in command[6]
    assert command[-1] == "2"
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `pytest backend/tests/test_verify_all.py -q`
Expected: FAIL because formatting and command builders are absent.

- [ ] **Step 3: Implement HTTP requests, named checks, and `finally` restoration**

```python
def main() -> int:
    results = CheckResults()
    context: dict[str, Any] = {}
    health_ok = results.record("health", verify_health)
    summary_ok = results.record("summary", verify_dashboard_summary)
    flagship_ok = results.record("flagship", lambda: verify_flagship(context))
    policy_ok = record_guarded(
        results,
        "policy",
        {"health": health_ok, "summary": summary_ok, "flagship": flagship_ok},
        lambda: verify_policy_floor(context),
    )
    approval_ok = record_guarded(
        results,
        "approval",
        {"policy": policy_ok},
        lambda: verify_approval_loop(context),
    )
    record_guarded(
        results,
        "tamper",
        {"approval": approval_ok},
        verify_reversible_tamper,
    )
    return results.exit_code
```

`run_reversible_tamper_check` sets `tampered = True` only after the SQL update succeeds and restores the base64-decoded original snapshot in `finally` before requiring one final valid-chain response.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pytest backend/tests/test_verify_all.py -q`
Expected: all focused tests pass.

### Task 3: Capture clean-stack evidence

**Files:**
- Evidence source: terminal output from `scripts/verify_all.py`

- [ ] **Step 1: Recreate the Compose stack**

Run: `docker-compose down -v`, then `docker-compose build`, then `docker-compose up -d`.
Expected: backend healthy and frontend running with a newly seeded volume.

- [ ] **Step 2: Run the verification script**

Run: `python scripts/verify_all.py`
Expected: every check prints `PASS`, tamper reports `first_broken_seq: 2`, restoration reports a valid chain, and process exit is zero.

### Task 4: Publish judge-facing evidence

**Files:**
- Create: `docs/VERIFICATION.md`
- Modify: `README.md`
- Modify: `backend/tests/test_phase7_packaging.py`

**Interfaces:**
- Produces: one reproduction link under README section 3 and claim/proof/output sections in `docs/VERIFICATION.md`.

- [ ] **Step 1: Add failing packaging tests for both documentation links**

```python
def test_readme_links_verification_runner_and_document():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "### Verify every claim" in readme
    assert "scripts/verify_all.py" in readme
    assert "docs/VERIFICATION.md" in readme

def test_verification_document_contains_required_claims():
    verification = (ROOT / "docs" / "VERIFICATION.md").read_text(encoding="utf-8")
    for claim in (
        "Money is never floats",
        "Every decision is audited atomically",
        "The chain detects tampering",
        "Fail-closed by design",
        "One code path for HTTP and MCP",
    ):
        assert claim in verification
```

- [ ] **Step 2: Run focused packaging tests and verify RED**

Run: `pytest backend/tests/test_phase7_packaging.py -q`
Expected: FAIL because the new documentation is absent.

- [ ] **Step 3: Write documentation using only captured output**

Include money units, atomic auditing, tamper transcript, fail-closed matrix, shared HTTP/MCP service proof, current test totals, and relevant commit hashes.

- [ ] **Step 4: Run focused packaging tests and verify GREEN**

Run: `pytest backend/tests/test_phase7_packaging.py -q`
Expected: all packaging tests pass.

### Task 5: Final regression gate and commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run all backend tests**

Run: `pytest -q` from `backend/`.
Expected: zero failures.

- [ ] **Step 2: Run frontend tests and production build**

Run: `pnpm test`, then `pnpm build` from `frontend/`.
Expected: three frontend tests pass and the Next.js build exits zero.

- [ ] **Step 3: Re-run the live verifier after documentation changes**

Run: `python scripts/verify_all.py`.
Expected: all checks pass and the chain is restored valid.

- [ ] **Step 4: Commit verification artifacts**

```bash
git add scripts/verify_all.py backend/tests/test_verify_all.py backend/tests/test_phase7_packaging.py docs/VERIFICATION.md README.md docs/superpowers/specs/2026-07-17-final-verification-pass-design.md docs/superpowers/plans/2026-07-17-final-verification-pass.md
git commit -m "docs: add reproducible verification pass"
```

- [ ] **Step 5: Prove clean state**

Run: `git status --short` and `git log --oneline`.
Expected: empty status and the verification commit at `HEAD`.
