# Phase 5 GPT-5.6 Intent Firewall Design

## Scope

Add an OpenAI-compatible intent firewall above the deterministic policy floor. It judges actions against the active mission, fuses the verdict fail-closed with policy output, stores the full verdict in the action and ledger snapshot, and computes a deterministic per-agent risk score. Unit and integration tests never call a real provider.

## Intent client

`backend/app/intent.py` loads environment variables with `python-dotenv`, creates the official OpenAI SDK client with `base_url`, OpenRouter headers, and the configured model, and requests a strict JSON verdict. It validates the verdict schema, retries one transient failure, and raises a provider error after a 15-second timeout. The client accepts an injectable SDK client for tests; no test uses the network.

## Fusion and persistence

The shared service calls the policy floor first. If an active mission exists it calls `judge_intent`; otherwise it records a skipped check and escalates ALLOW to PENDING. Policy BLOCK is absolute. Hijack is BLOCK, suspicious escalates ALLOW to PENDING, aligned preserves policy, and unavailable is fail-closed. The action stores verdict, confidence, reasoning, model, and latency; the same object is embedded in every action ledger snapshot.

## Risk and demo

`risk.py` computes a deterministic 0–100 score from action and intent history, with hijack and blocked events weighted highest and allowed actions reducing risk slightly. The live demo uses the real configured OpenRouter endpoint and a deliberately instruction-following agent to demonstrate the firewall, while all tests inject a fake intent client.
