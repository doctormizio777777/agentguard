from __future__ import annotations

import asyncio

import pytest


def test_allowed_origins_defaults_to_local_frontends(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.settings import allowed_origins

    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)

    assert allowed_origins() == ["http://localhost:3000", "http://localhost:3001"]


def test_allowed_origins_parses_and_deduplicates_configured_values(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.settings import allowed_origins

    monkeypatch.setenv(
        "ALLOWED_ORIGINS",
        " https://agentguard.vercel.app,https://preview.vercel.app, https://agentguard.vercel.app ",
    )

    assert allowed_origins() == ["https://agentguard.vercel.app", "https://preview.vercel.app"]


@pytest.mark.parametrize("value", ["true", "TRUE", "1", "yes", "on"])
def test_demo_mode_accepts_explicit_true_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    from app.settings import demo_mode_enabled

    monkeypatch.setenv("DEMO_MODE", value)

    assert demo_mode_enabled() is True


def test_auto_reseed_minutes_is_optional_and_must_be_positive(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.settings import auto_reseed_seconds

    monkeypatch.delenv("AUTO_RESEED_MINUTES", raising=False)
    assert auto_reseed_seconds() is None
    monkeypatch.setenv("AUTO_RESEED_MINUTES", "2.5")
    assert auto_reseed_seconds() == 150.0

    for invalid in ("0", "-1", "not-a-number"):
        monkeypatch.setenv("AUTO_RESEED_MINUTES", invalid)
        with pytest.raises(ValueError, match="AUTO_RESEED_MINUTES"):
            auto_reseed_seconds()


def test_dashboard_summary_includes_demo_flag_only_when_enabled(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEMO_MODE", raising=False)
    assert "demo" not in client.get("/dashboard/summary").json()

    monkeypatch.setenv("DEMO_MODE", "true")
    response = client.get("/dashboard/summary")

    assert response.status_code == 200
    assert response.json()["demo"] is True


def test_demo_reset_is_unavailable_without_server_key(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEMO_RESET_KEY", raising=False)

    response = client.post("/demo/reset", headers={"X-Demo-Key": "anything"})

    assert response.status_code == 503
    assert response.json() == {"detail": "demo reset is not configured"}


def test_demo_reset_rejects_missing_or_wrong_key(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_RESET_KEY", "correct-demo-key")

    missing = client.post("/demo/reset")
    wrong = client.post("/demo/reset", headers={"X-Demo-Key": "wrong-demo-key"})

    assert missing.status_code == 403
    assert wrong.status_code == 403
    assert wrong.json() == {"detail": "invalid demo reset key"}


def test_demo_reset_reseeds_and_returns_valid_ledger(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_RESET_KEY", "correct-demo-key")

    response = client.post("/demo/reset", headers={"X-Demo-Key": "correct-demo-key"})

    assert response.status_code == 200
    assert response.json() == {
        "status": "reset",
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
    assert client.get("/ledger/verify").json()["valid"] is True
    assert client.get("/dashboard/summary").json()["blocked_count"] == 1


def test_auto_reseed_loop_invokes_reset_after_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.main import run_auto_reseed

    calls: list[str] = []

    async def run_once(function):
        function()
        raise asyncio.CancelledError

    monkeypatch.setattr("app.main.asyncio.to_thread", run_once)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(run_auto_reseed(0, lambda: calls.append("reset")))

    assert calls == ["reset"]
