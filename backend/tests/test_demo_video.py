from __future__ import annotations

from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))


def test_video_runner_defaults_to_local_api_and_four_second_pause(monkeypatch: pytest.MonkeyPatch) -> None:
    from demo_video import api_url, demo_pause_seconds

    monkeypatch.delenv("API_URL", raising=False)
    monkeypatch.delenv("DEMO_PAUSE_SECONDS", raising=False)

    assert api_url() == "http://localhost:8000"
    assert demo_pause_seconds() == 4.0


def test_video_runner_normalizes_public_api_and_accepts_zero_pause(monkeypatch: pytest.MonkeyPatch) -> None:
    from demo_video import api_url, demo_pause_seconds

    monkeypatch.setenv("API_URL", " https://agentguard-api.onrender.com/ ")
    monkeypatch.setenv("DEMO_PAUSE_SECONDS", "0")

    assert api_url() == "https://agentguard-api.onrender.com"
    assert demo_pause_seconds() == 0.0


def test_video_runner_rejects_negative_or_invalid_pause(monkeypatch: pytest.MonkeyPatch) -> None:
    from demo_video import demo_pause_seconds

    for value in ("-1", "not-a-number"):
        monkeypatch.setenv("DEMO_PAUSE_SECONDS", value)
        with pytest.raises(ValueError, match="DEMO_PAUSE_SECONDS"):
            demo_pause_seconds()


def test_payment_tool_arguments_convert_to_decimal_string_without_float() -> None:
    from demo_video import action_request_body

    body = action_request_body(
        {
            "agent_id": "7",
            "action_type": "payment",
            "payload": {
                "counterparty": "openai.com",
                "amount_cents": 20_001,
                "instruction": "buy credits",
            },
        }
    )

    assert body == {
        "agent_id": 7,
        "action_type": "payment",
        "amount": "200.01",
        "counterparty": "openai.com",
        "payload": {"instruction": "buy credits"},
    }
    assert isinstance(body["amount"], str)


def test_banner_contains_ansi_and_all_required_section_titles() -> None:
    from demo_video import SECTION_TITLES, banner

    assert SECTION_TITLES == (
        "AGENT DECLARES MISSION",
        "LEGITIMATE TASK",
        "AGENT READS A POISONED DOCUMENT",
        "HIJACK ATTEMPT",
        "THE ATTACK RULES CAN'T SEE",
        "AUDIT CHAIN",
    )
    for title in SECTION_TITLES:
        rendered = banner(title)
        assert "\x1b[" in rendered
        assert title in rendered


def test_video_shot_list_is_bullet_only_after_title() -> None:
    video = (ROOT / "docs" / "VIDEO.md").read_text(encoding="utf-8")
    content_lines = [line for line in video.splitlines() if line and not line.startswith("#")]

    assert content_lines
    assert all(line.startswith("- ") for line in content_lines)
    for title in (
        "AGENT DECLARES MISSION",
        "LEGITIMATE TASK",
        "AGENT READS A POISONED DOCUMENT",
        "HIJACK ATTEMPT",
        "THE ATTACK RULES CAN'T SEE",
        "AUDIT CHAIN",
    ):
        assert title in video
