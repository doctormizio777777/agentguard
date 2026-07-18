import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(TEST_DIR, "..");
const APP_DIR = join(FRONTEND_DIR, "app");
const REPO_DIR = join(FRONTEND_DIR, "..");


test("the landing page renders all eight sections in the prescribed order", () => {
  const page = readFileSync(join(APP_DIR, "page.tsx"), "utf8");
  const markers = [
    'data-section="hero"',
    'data-section="live-proof"',
    'data-section="problem"',
    'data-section="two-judges"',
    'data-section="signature"',
    'data-section="comparison"',
    'data-section="verification"',
    'data-section="built-with"',
  ];

  let previous = -1;
  for (const marker of markers) {
    const position = page.indexOf(marker);
    assert.ok(position > previous, `${marker} must appear after the preceding section`);
    previous = position;
  }
});


test("the landing backdrop does not create viewport-width horizontal overflow", () => {
  const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");
  assert.doesNotMatch(css, /calc\(50%\s*-\s*50vw\)/);
});


test("hero and signature section use the real demo evidence", () => {
  const page = readFileSync(join(APP_DIR, "page.tsx"), "utf8");

  assert.match(page, /It knows if your agent is still yours\./);
  assert.match(page, /className="landing-secondary-link" href="\/console"/);
  assert.match(page, /className="landing-primary-link" href="\/console\?demo=1"/);
  assert.match(page, /<HeroVerdictCard \/>/);
  assert.match(page, /<IntentComparison \/>/);
  assert.match(page, /Rules see numbers\. The firewall reads intent\./);
});


test("landing judge fixes keep the evidence factual and attributed", () => {
  const page = readFileSync(join(APP_DIR, "page.tsx"), "utf8");

  assert.match(page, /the firewall IS GPT-5\.6 judging GPT-5\.6/);
  assert.match(page, /Gartner predicts that by 2028, 1 in 4 enterprise breaches will be traced back to AI agent abuse — from both external and malicious internal actors\./);
  assert.match(page, /— Gartner, 2025/);
  assert.match(page, /\["Spend caps & allowlists", "FULL", "FULL", "FULL", "PARTIAL"\]/);
  assert.match(page, /AgentGuard does not hold funds or replace spend controls — it composes with them\./);
  assert.match(page, /break it yourself → open the console/);
  assert.doesNotMatch(page, /seeded (?:demo )?verdict/i);
  assert.doesNotMatch(page, /<small>\(the firewall IS GPT-5\.6 judging GPT-5\.6\)<\/small>/);
});


test("live proof is fetched from the running backend with a cold-start fallback", () => {
  const liveProofPath = join(APP_DIR, "live-proof-strip.tsx");
  assert.equal(existsSync(liveProofPath), true);
  const liveProof = readFileSync(liveProofPath, "utf8");

  assert.match(liveProof, /API_BASE_URL/);
  assert.match(liveProof, /\/dashboard\/summary/);
  assert.match(liveProof, /actions_today/);
  assert.match(liveProof, /threats_blocked/);
  assert.match(liveProof, /pending_count/);
  assert.match(liveProof, /ledger\.valid/);
  assert.match(liveProof, /pulled live from the running system/);
  assert.match(liveProof, /WAKING|UNAVAILABLE|CONNECTING/);
});


test("landing copy states the problem, two judges, honest comparison, and proof links", () => {
  const page = readFileSync(join(APP_DIR, "page.tsx"), "utf8");

  assert.match(page, /Your agent follows instructions\. All of them\./);
  assert.match(page, /Gartner predicts that by 2028, 1 in 4 enterprise breaches will be traced back to AI agent abuse/);
  assert.match(page, /Declare a mission/);
  assert.match(page, /Judged twice/);
  assert.match(page, /Chained forever/);
  assert.match(page, /Spend management tools/);
  assert.match(page, /Deterministic layers catch false facts\. AgentGuard catches betrayed intent/);
  assert.match(page, /docs\/VERIFICATION\.md/);
  assert.match(page, /docs\/reviews\/2026-07-18-final-security-audit\.md/);
  assert.match(page, /docker compose up/);
  assert.match(page, /OpenAI Build Week 2026 entry/);
});


test("root metadata uses the live canonical URL and repository banner", () => {
  const layout = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
  assert.match(layout, /https:\/\/agentguard-dusky\.vercel\.app/);
  assert.match(layout, /canonical/);
  assert.match(layout, /banner\.png/);
  assert.equal(existsSync(join(FRONTEND_DIR, "public", "banner.png")), true);
});


test("README introduces the landing page before the console", () => {
  const readme = readFileSync(join(REPO_DIR, "README.md"), "utf8");
  const landing = readme.indexOf("https://agentguard-dusky.vercel.app");
  const console = readme.indexOf("https://agentguard-dusky.vercel.app/console");

  assert.ok(landing >= 0);
  assert.ok(console > landing);
  assert.match(readme, /start here/i);
});
