from __future__ import annotations

import pytest

from app.database import get_connection
from app.demo_seed import reset_demo_database


def _seed_demo(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("DEMO_RESET_KEY", "test-reset-key")
    response = client.post("/demo/reset", headers={"X-Demo-Key": "test-reset-key"})
    assert response.status_code == 200


def test_public_tamper_is_hidden_outside_demo_mode(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEMO_MODE", raising=False)

    tamper = client.post("/demo/tamper")
    restore = client.post("/demo/tamper/restore")

    assert tamper.status_code == 404
    assert restore.status_code == 404


def test_tamper_breaks_exact_sequence_double_call_is_noop_and_restore_heals(
    client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_demo(client, monkeypatch)

    tamper = client.post("/demo/tamper")

    assert tamper.status_code == 200
    tamper_body = tamper.json()
    tampered_seq = tamper_body["tampered_seq"]
    assert 1 < tampered_seq < 15
    assert tamper_body["already_tampered"] is False
    assert tamper_body["verification"] == {
        "valid": False,
        "entries_checked": tampered_seq - 1,
        "first_broken_seq": tampered_seq,
        "reason": f"entry_hash mismatch at seq {tampered_seq}",
    }
    assert client.get("/ledger/verify").json() == tamper_body["verification"]

    repeated = client.post("/demo/tamper")

    assert repeated.status_code == 200
    assert repeated.json() == {
        "tampered_seq": tampered_seq,
        "already_tampered": True,
        "verification": tamper_body["verification"],
    }

    restore = client.post("/demo/tamper/restore")

    assert restore.status_code == 200
    assert restore.json() == {
        "restored_seq": tampered_seq,
        "already_restored": False,
        "verification": {
            "valid": True,
            "entries_checked": 15,
            "first_broken_seq": None,
            "reason": None,
        },
    }
    assert client.get("/ledger/verify").json() == restore.json()["verification"]


def test_manual_reset_and_auto_reseed_clear_tamper_state_safely(
    client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_demo(client, monkeypatch)
    assert client.post("/demo/tamper").json()["verification"]["valid"] is False

    manual_reset = client.post("/demo/reset", headers={"X-Demo-Key": "test-reset-key"})

    assert manual_reset.status_code == 200
    assert manual_reset.json()["ledger"]["valid"] is True
    after_manual_reset = client.post("/demo/tamper").json()
    assert after_manual_reset["already_tampered"] is False
    assert client.post("/demo/tamper/restore").json()["verification"]["valid"] is True

    assert client.post("/demo/tamper").json()["verification"]["valid"] is False
    auto_reseed_result = reset_demo_database()

    assert auto_reseed_result["ledger"]["valid"] is True
    with get_connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM demo_tamper_state").fetchone()[0] == 0
    after_auto_reseed = client.post("/demo/tamper").json()
    assert after_auto_reseed["already_tampered"] is False
    assert client.post("/demo/tamper/restore").json()["verification"]["valid"] is True
