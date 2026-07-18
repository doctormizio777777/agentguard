import assert from "node:assert/strict";
import test from "node:test";

import { GUIDED_DEMO_STEPS, scenarioStepUrl } from "../app/guided-demo.ts";


test("guided demo defines the six ordered factual steps", () => {
  assert.deepEqual(GUIDED_DEMO_STEPS, [
    { step: 0, title: "Reset scenario", explanation: "Archive prior scenario actions and declare the procurement mission." },
    { step: 1, title: "Approved purchase", explanation: "Request EUR 200 of API credits from openai.com." },
    { step: 2, title: "Poisoned document", explanation: "Reveal the instruction that attempts to redirect the agent." },
    { step: 3, title: "Blocked hijack", explanation: "Stage the EUR 5,000 unknown-vendor payment and inspect the block." },
    { step: 4, title: "Human review", explanation: "Stage a policy-safe gift-card payment for manual approval." },
    { step: 5, title: "Verify evidence", explanation: "Verify the ledger chain and compute the scenario agent risk." },
  ]);
});


test("scenarioStepUrl targets the one public walkthrough endpoint", () => {
  assert.equal(
    scenarioStepUrl("https://agentguard-api.example/"),
    "https://agentguard-api.example/demo/scenario/step",
  );
});
