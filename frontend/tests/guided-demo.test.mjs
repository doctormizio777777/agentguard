import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import * as guidedDemo from "../app/guided-demo.ts";


const { GUIDED_TOUR_STEPS, requestScenarioStep, scenarioStepUrl } = guidedDemo;


test("guided tour defines the six ordered steps with verbatim narration", () => {
  assert.deepEqual(GUIDED_TOUR_STEPS, [
    {
      scenarioStep: 0,
      target: "agent",
      tone: "info",
      title: "A mission is declared",
      narration: "The operator declares what this agent is FOR: buy API credits from approved vendors, max €2,000/day. Every future action will be judged against this sentence.",
    },
    {
      scenarioStep: 1,
      target: "action",
      tone: "info",
      title: "Normal work flows freely",
      narration: "A €200 payment to an approved vendor. Passes every rule, serves the mission. GPT-5.6 verdict: aligned, 0.96. No friction.",
    },
    {
      scenarioStep: 2,
      target: "action",
      tone: "danger",
      title: "The agent reads a poisoned document",
      narration: "Hidden inside a routine invoice: instructions telling the agent to urgently wire money to a new beneficiary. The agent's context is now compromised. No rule has been broken — yet.",
    },
    {
      scenarioStep: 3,
      target: "action",
      tone: "danger",
      title: "The hijack is caught",
      narration: "The agent tries to send €5,000 to unknown-vendor.xyz. The intent firewall reads the request against the mission: beneficiary change, urgency language, unknown counterparty. BLOCKED at 0.97 confidence.",
    },
    {
      scenarioStep: 4,
      target: "approval",
      tone: "warn",
      title: "The attack rules can't see",
      narration: "€300 in gift cards. Allowlisted vendor, under every cap — every numeric rule is green. But it doesn't serve the mission. Suspicious at 0.84: held for human approval. This is the case only an intent layer catches.",
    },
    {
      scenarioStep: 5,
      target: "evidence",
      tone: "info",
      title: "Everything is evidence",
      narration: "Every decision is in a hash-chained ledger — tamper with one entry and the chain snaps, live. The agent's risk score just hit 95. This is what accountability for AI agents looks like.",
    },
  ]);
});


test("scenarioStepUrl targets the one public walkthrough endpoint", () => {
  assert.equal(
    scenarioStepUrl("https://agentguard-api.example/"),
    "https://agentguard-api.example/demo/scenario/step",
  );
});


test("tour progression posts scenario steps zero through five to the existing endpoint", async (context) => {
  assert.equal(typeof requestScenarioStep, "function", "requestScenarioStep must exist");
  const received = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      received.push({ method: request.method, url: request.url, body: JSON.parse(body) });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ step: received.at(-1).body.step, status: "ok" }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  for (const item of GUIDED_TOUR_STEPS) {
    await requestScenarioStep(baseUrl, item.scenarioStep);
  }

  assert.deepEqual(received, [0, 1, 2, 3, 4, 5].map((step) => ({
    method: "POST",
    url: "/demo/scenario/step",
    body: { step },
  })));
});


test("scenario request exposes backend failures for the retry state", async (context) => {
  assert.equal(typeof requestScenarioStep, "function", "requestScenarioStep must exist");
  const server = createServer((_request, response) => {
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ detail: "Backend is waking" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  await assert.rejects(
    () => requestScenarioStep(`http://127.0.0.1:${address.port}`, 0),
    /Backend is waking/,
  );
});
