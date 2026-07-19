import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LIVE_SCENARIO_ID,
  LIVE_INTENT_PROGRESS,
  LIVE_SCENARIOS,
  requestLiveIntent,
  truncateResponseId,
} from "../app/live-intent.ts";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");
const missionControl = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");
const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");


test("the public live check exposes only four locked scenarios and defaults to betrayal", () => {
  assert.equal(DEFAULT_LIVE_SCENARIO_ID, "betrayal_gift_cards");
  assert.deepEqual(LIVE_SCENARIOS.map(({ id }) => id), [
    "aligned_api_credits",
    "over_cap_wire",
    "hijack_beneficiary",
    "betrayal_gift_cards",
  ]);
});


test("requestLiveIntent sends only the selected scenario id", async (context) => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({
      scenario_id: "betrayal_gift_cards",
      cached: false,
      action_id: 91,
      status: "pending_approval",
      verdict: null,
      provenance: { source: "LIVE OPENAI", model: "gpt-5.6", response_id: null, latency_ms: 15000, timestamp: "2026-07-19T12:00:00Z" },
      action: { id: 91 },
      message: "LIVE INTENT UNAVAILABLE — held for human review",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await requestLiveIntent("https://api.example/", "betrayal_gift_cards");

  assert.equal(result.action_id, 91);
  assert.deepEqual(requests, [{
    url: "https://api.example/demo/live-intent",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: "betrayal_gift_cards" }),
    },
  }]);
});


test("live request errors expose the backend detail without leaking internals", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(
    JSON.stringify({ detail: "live intent rate limit exceeded: maximum 6 requests per IP per hour" }),
    { status: 429, headers: { "content-type": "application/json" } },
  );

  await assert.rejects(
    () => requestLiveIntent("https://api.example", "aligned_api_credits"),
    /maximum 6 requests per IP per hour/,
  );
});


test("the console renders all four real progress stages and live provenance", () => {
  assert.deepEqual(LIVE_INTENT_PROGRESS, [
    "checking policy",
    "calling GPT-5.6",
    "validating verdict",
    "appending ledger",
  ]);
  assert.match(missionControl, /RUN LIVE GPT-5\.6 CHECK/);
  assert.match(missionControl, /LIVE OPENAI/);
  assert.match(missionControl, /response_id/);
  assert.match(missionControl, /latency_ms/);
  assert.match(missionControl, /LIVE INTENT UNAVAILABLE — held for human review/);
  assert.match(missionControl, /RETRY LIVE CHECK/);
  assert.match(css, /\.live-intent-provenance/);
  assert.match(css, /\.live-run-chip/);
});


test("live actions are visibly flagged in the existing feed", () => {
  assert.match(missionControl, /action\.payload\.metadata/);
  assert.match(missionControl, />LIVE RUN<\/span>/);
  assert.match(missionControl, /setExpanded[\s\S]*new Set\(current\)\.add\(result\.action_id\)/);
});


test("response ids are truncated while short ids remain intact", () => {
  assert.equal(truncateResponseId("resp_short"), "resp_short");
  assert.equal(truncateResponseId("chatcmpl-1234567890-abcdef"), "chatcmpl-1…abcdef");
});


test("no secret-bearing environment name appears in the client implementation", () => {
  const clientSources = `${missionControl}\n${readFileSync(join(APP_DIR, "live-intent.ts"), "utf8")}`;
  assert.doesNotMatch(clientSources, /OPENAI_API_KEY|DEMO_RESET_KEY|sk-or-|Bearer\s+sk-/);
});
