import assert from "node:assert/strict";
import test from "node:test";

import { apiBaseUrl, DEMO_LINKS } from "../app/api-config.ts";


test("apiBaseUrl falls back to the local backend", () => {
  assert.equal(apiBaseUrl(undefined), "http://localhost:8000");
  assert.equal(apiBaseUrl(""), "http://localhost:8000");
});


test("apiBaseUrl normalizes a configured public backend", () => {
  assert.equal(apiBaseUrl(" https://agentguard-api.onrender.com/ "), "https://agentguard-api.onrender.com");
});


test("public demo links point to the repository, verification proof, and local run section", () => {
  assert.deepEqual(DEMO_LINKS, [
    { label: "GitHub repo", href: "https://github.com/doctormizio777777/agentguard" },
    {
      label: "Verification proof",
      href: "https://github.com/doctormizio777777/agentguard/blob/main/docs/VERIFICATION.md",
    },
    {
      label: "Run locally in 60s",
      href: "https://github.com/doctormizio777777/agentguard#3-try-it-in-60-seconds",
    },
  ]);
});
