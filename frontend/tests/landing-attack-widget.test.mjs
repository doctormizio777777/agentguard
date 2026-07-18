import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");
const STATE_PATH = join(APP_DIR, "landing-demo-state.ts");
const INTERACTIONS_PATH = join(APP_DIR, "landing-interactions.tsx");
const PAGE_PATH = join(APP_DIR, "page.tsx");


async function loadAttackCases() {
  const state = await import(pathToFileURL(STATE_PATH));
  return {
    attackCases: state.ATTACK_CASES ?? [],
    defaultCaseId: state.DEFAULT_ATTACK_CASE_ID,
  };
}


test("benign payload resolves to the recorded allowed verdict", async () => {
  const { attackCases } = await loadAttackCases();
  const attackCase = attackCases.find(({ id }) => id === "benign");

  assert.ok(attackCase, "benign case must exist");
  assert.equal(attackCase.chipLabel, "Benign · €200 API credits");
  assert.equal(attackCase.finalLine, "→ FINAL: ALLOWED");
  assert.equal(attackCase.caption, "policy and intent agree");
  assert.equal(attackCase.trace.every(({ passed }) => passed !== false), true);
  assert.match(attackCase.intentLine, /aligned · confidence 0\.96/);
});


test("over-cap payload resolves to the recorded static block", async () => {
  const { attackCases } = await loadAttackCases();
  const attackCase = attackCases.find(({ id }) => id === "over-cap");

  assert.ok(attackCase, "over-cap case must exist");
  assert.equal(attackCase.chipLabel, "Over cap · €5,000 wire");
  assert.equal(attackCase.finalLine, "→ FINAL: BLOCKED");
  assert.equal(attackCase.caption, "static rules catch this one — no AI needed");
  assert.equal(attackCase.trace.find(({ rule }) => rule === "per_transaction_cap")?.passed, false);
});


test("hijack payload resolves to the recorded dual-judge block", async () => {
  const { attackCases } = await loadAttackCases();
  const attackCase = attackCases.find(({ id }) => id === "hijack");

  assert.ok(attackCase, "hijack case must exist");
  assert.equal(attackCase.chipLabel, "Hijack · unknown beneficiary");
  assert.equal(attackCase.finalLine, "→ FINAL: BLOCKED");
  assert.equal(attackCase.caption, "both judges fire");
  assert.equal(attackCase.trace.find(({ rule }) => rule === "merchant_allowlist")?.passed, false);
  assert.match(attackCase.intentLine, /hijack_suspected · confidence 0\.99/);
});


test("betrayal payload is the complete default and resolves to approval", async () => {
  const { attackCases, defaultCaseId } = await loadAttackCases();
  const attackCase = attackCases.find(({ id }) => id === "betrayal");

  assert.equal(defaultCaseId, "betrayal");
  assert.ok(attackCase, "betrayal case must exist");
  assert.equal(attackCase.chipLabel, "Betrayal · €300 gift cards");
  assert.equal(attackCase.finalLine, "→ FINAL: HELD FOR APPROVAL");
  assert.equal(attackCase.caption, "every rule green — only the intent layer sees it. This is the case that matters.");
  assert.equal(attackCase.trace.every(({ passed }) => passed === true), true);
  assert.match(attackCase.intentLine, /suspicious · confidence 0\.84/);
});


test("the trace interaction disables chips during animation and honors reduced motion", () => {
  const interactions = readFileSync(INTERACTIONS_PATH, "utf8");

  assert.match(interactions, /disabled=\{isAnimating\}/);
  assert.match(interactions, /prefers-reduced-motion: reduce/);
  assert.match(interactions, /setVisibleLineCount\(nextCase\.trace\.length \+ 3\)/);
  assert.match(interactions, /RECORDED_RUN_LABEL/);
  assert.match(interactions, /href="\/console\?demo=1"/);
});


test("the three judge cards carry the prescribed kernel micro-labels", () => {
  const page = readFileSync(PAGE_PATH, "utf8");

  assert.match(page, /set by the operator · every change is ledgered/);
  assert.match(page, /deterministic floor \+ gpt-5\.6 · fails closed/);
  assert.match(page, /hash-chained · break it yourself in the console/);
});
