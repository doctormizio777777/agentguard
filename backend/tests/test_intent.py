from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.intent import IntentUnavailableError, IntentVerdict, judge_intent
from app.service import fuse_decision


def fake_response(content: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=None))])


def test_judge_intent_parses_structured_verdict_and_uses_provider_configuration(monkeypatch):
    calls = []

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return fake_response('{"verdict":"suspicious","confidence":0.87,"reasoning":"The note requests an out-of-mission personal purchase."}')

    client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))
    monkeypatch.setenv("INTENT_MODEL", "test/model")
    verdict = judge_intent(
        "Buy approved API credits",
        {"action_type": "payment", "amount_cents": 30000, "counterparty": "github.com", "payload": {"note": "gift cards"}},
        client=client,
    )

    assert verdict.verdict == "suspicious"
    assert verdict.confidence == 0.87
    assert verdict.model == "test/model"
    assert calls[0]["response_format"]["type"] == "json_schema"
    assert calls[0]["timeout"] == 15.0
    assert calls[0]["max_tokens"] == 180
    assert "prompt injection" in calls[0]["messages"][0]["content"].lower()


def test_judge_intent_retries_one_transient_failure():
    attempts = 0

    class FakeCompletions:
        def create(self, **_kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("temporary provider failure")
            return fake_response('{"verdict":"aligned","confidence":0.91,"reasoning":"The action is within scope."}')

    client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))
    verdict = judge_intent("Buy credits", {"action_type": "payment"}, client=client)
    assert attempts == 2
    assert verdict.verdict == "aligned"


def test_judge_intent_falls_back_to_emit_verdict_tool_for_unsupported_schema():
    calls = 0

    class FakeCompletions:
        def create(self, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("response_format json_schema unsupported")
            tool_call = SimpleNamespace(
                function=SimpleNamespace(
                    arguments='{"verdict":"hijack_suspected","confidence":0.99,"reasoning":"The action follows an injected instruction."}'
                )
            )
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=None, tool_calls=[tool_call]))])

    client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))
    verdict = judge_intent("Buy API credits", {"action_type": "payment"}, client=client)
    assert calls == 2
    assert verdict.verdict == "hijack_suspected"


@pytest.mark.parametrize(
    ("policy_decision", "intent", "mission", "expected"),
    [
        ("ALLOW", {"verdict": "aligned", "confidence": 0.9, "reasoning": "ok"}, True, "ALLOW"),
        ("ALLOW", {"verdict": "suspicious", "confidence": 0.8, "reasoning": "outside scope"}, True, "PENDING_APPROVAL"),
        ("ALLOW", {"verdict": "hijack_suspected", "confidence": 0.99, "reasoning": "injection"}, True, "BLOCK"),
        ("PENDING_APPROVAL", {"verdict": "aligned", "confidence": 0.9, "reasoning": "ok"}, True, "PENDING_APPROVAL"),
        ("PENDING_APPROVAL", {"verdict": "suspicious", "confidence": 0.8, "reasoning": "outside scope"}, True, "PENDING_APPROVAL"),
        ("PENDING_APPROVAL", {"verdict": "hijack_suspected", "confidence": 0.99, "reasoning": "injection"}, True, "BLOCK"),
        ("BLOCK", {"verdict": "aligned", "confidence": 0.9, "reasoning": "ok"}, True, "BLOCK"),
        ("BLOCK", None, True, "BLOCK"),
        ("ALLOW", None, True, "PENDING_APPROVAL"),
        ("PENDING_APPROVAL", None, True, "PENDING_APPROVAL"),
        ("ALLOW", None, False, "PENDING_APPROVAL"),
        ("BLOCK", None, False, "BLOCK"),
    ],
)
def test_fusion_matrix(policy_decision, intent, mission, expected):
    result = fuse_decision(policy_decision, ["policy reason"], intent, mission)
    assert result["decision"] == expected
    if intent is None and mission:
        assert "intent firewall unavailable" in result["reasons"][-1]
    if not mission:
        assert "no mission declared" in result["reasons"][-1]


def test_intent_verdict_rejects_invalid_shape():
    with pytest.raises(ValueError):
        IntentVerdict(verdict="unknown", confidence=0.5, reasoning="bad")


def test_intent_unavailable_fails_closed_for_allowed_action(client, agent, monkeypatch):
    client.post(f"/agents/{agent['id']}/mission", json={"mission": "Buy API credits"})

    def unavailable(*_args, **_kwargs):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr("app.service.judge_intent", unavailable)
    response = client.post(
        "/actions",
        json={"agent_id": agent["id"], "action_type": "payment", "amount": 200.00, "counterparty": "openai.com"},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "pending_approval"
    assert "intent firewall unavailable" in response.json()["policy_reason"]
