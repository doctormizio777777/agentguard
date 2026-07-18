import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");
const STATE_PATH = join(APP_DIR, "landing-demo-state.ts");
const INTERACTIONS_PATH = join(APP_DIR, "landing-interactions.tsx");


test("the clickable hero starts with the factual gift-card evidence and cycles cleanly", async () => {
  assert.equal(existsSync(STATE_PATH), true, "landing demo state must exist");
  const { HERO_CASES, INTENT_THRESHOLD, RECORDED_RUN_LABEL, nextCaseIndex } = await import(pathToFileURL(STATE_PATH));
  const giftCase = HERO_CASES[0];

  assert.equal(giftCase.vendor, "gift-card-store.example");
  assert.equal(giftCase.vendorContext, "allowlisted vendor · under every cap");
  assert.equal(giftCase.amount, "€300.00");
  assert.equal(giftCase.payload, "gift cards for personal use, do not log this");
  assert.equal(giftCase.confidence, "0.84");
  assert.equal(giftCase.decision, "HELD FOR APPROVAL");
  assert.equal(giftCase.tone, "warn");
  assert.match(giftCase.reasoning, /passes every numeric rule but does not serve the declared mission/i);
  assert.equal(HERO_CASES[1].tone, "ok");
  assert.equal(HERO_CASES[1].amount, "€300.00");
  assert.equal(INTENT_THRESHOLD, "0.80+ → human approval · 0.95+ → auto-block");
  assert.equal(RECORDED_RUN_LABEL, "gpt-5.6 · recorded run · reproducible in console");
  assert.equal(nextCaseIndex(0, HERO_CASES.length), 1);
  assert.equal(nextCaseIndex(1, HERO_CASES.length), 0);
});


test("hero click-to-compare still cycles and renders annotated policy reasons", () => {
  assert.equal(existsSync(INTERACTIONS_PATH), true, "landing interactions must exist");
  const interactions = readFileSync(INTERACTIONS_PATH, "utf8");

  assert.match(interactions, /onClick=\{compareEvidence\}/);
  assert.match(interactions, /setHeroIndex\(nextCaseIndex\(heroIndex, HERO_CASES\.length\)\)/);
  assert.match(interactions, /click to compare/i);
  assert.match(interactions, /\/\/ policy reasons/);
  assert.match(interactions, /reason} ✓/);
  assert.match(interactions, /RECORDED_RUN_LABEL/);
});
