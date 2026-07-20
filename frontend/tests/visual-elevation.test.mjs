import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");
const page = readFileSync(join(APP_DIR, "page.tsx"), "utf8");
const interactions = readFileSync(join(APP_DIR, "landing-interactions.tsx"), "utf8");
const missionControl = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");
const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");


test("THE LAYER renders the approved mission-control architecture", () => {
  const layerPath = join(APP_DIR, "layer-diagram.tsx");
  assert.equal(existsSync(layerPath), true);
  const layer = readFileSync(layerPath, "utf8");

  assert.match(page, /import \{ LayerDiagram \} from "\.\/layer-diagram"/);
  assert.match(page, /data-section="layer"/);
  assert.match(page, /One layer between your agent and everything it can touch\./);
  assert.match(page, /Every high-risk action — payments, email, data, APIs, shell — is judged against the mission before it executes\./);
  assert.match(page, /<LayerDiagram \/>/);

  for (const label of [
    "YOUR AGENT",
    "any framework · via MCP",
    "AGENTGUARD",
    "POLICY FLOOR",
    "GPT-5.6 INTENT",
    "HUMAN APPROVAL",
    "HASH-CHAINED LEDGER",
    "PAYMENTS",
    "EMAIL",
    "DATA EXPORT",
    "API CALLS",
    "SHELL COMMANDS",
  ]) assert.match(layer, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(layer, /className="layer-action-dot layer-action-dot-allowed"/);
  assert.match(layer, /className="layer-action-dot layer-action-dot-blocked"/);
  assert.match(layer, /className="layer-motion-lane"/);
  assert.doesNotMatch(layer, /#[0-9a-f]{3,8}/i);
});


test("the layer route, verdict lights, and reduced-motion fallback use existing tokens", () => {
  assert.match(css, /\.layer-action-dot-allowed\s*\{[^}]*animation:\s*layer-action-allowed/s);
  assert.match(css, /\.layer-action-dot-blocked\s*\{[^}]*animation:\s*layer-action-blocked/s);
  assert.match(css, /\.layer-diagram\s*\{[^}]*--layer-cycle:/s);
  assert.match(css, /\.layer-action-dot-allowed\s*\{[^}]*animation:\s*layer-action-allowed var\(--layer-cycle\)/s);
  assert.match(css, /\.layer-action-dot-blocked\s*\{[^}]*animation:\s*layer-action-blocked var\(--layer-cycle\)/s);
  assert.match(css, /offset-path:path\("M216 259 H330 V139 V233 V327 V421 V470 H836 V278 H916"\)/);
  assert.match(css, /offset-path:path\("M216 259 H330 V139 V233 H340"\)/);
  assert.match(css, /\.layer-action-dot-mobile\s*\{[^}]*offset-path:path\("M180 110 V140 H40 V253 V354 V455 V556 V680 H180 V694"\)/s);
  assert.match(css, /\.layer-action-dot-mobile-blocked\s*\{[^}]*offset-path:path\("M180 110 V140 H40 V253 V354 H45"\)/s);
  assert.match(css, /@keyframes layer-action-allowed/);
  assert.match(css, /@keyframes layer-action-blocked/);
  assert.match(css, /@keyframes layer-action-allowed\s*\{[\s\S]*52%,100%\s*\{\s*opacity:0/s);
  assert.match(css, /@keyframes layer-action-blocked\s*\{[\s\S]*0%,62%\s*\{\s*opacity:0/s);
  assert.match(css, /\.layer-stage-intent\s*\{[^}]*animation:\s*layer-intent-stage/s);
  assert.match(css, /\.layer-destination\.is-target\s*\{[^}]*animation:\s*layer-target-verdict var\(--layer-cycle\)/s);
  assert.match(css, /@keyframes layer-target-verdict\s*\{[\s\S]*0%,52%\s*\{[^}]*color:var\(--ok\)/s);
  assert.match(css, /@keyframes layer-target-verdict\s*\{[\s\S]*62%,100%\s*\{[^}]*color:var\(--border-strong\)/s);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)[\s\S]*\.layer-action-dot[^}]*animation:\s*none!important/s);
});


test("hero, attack chips, and live trigger expose the approved active depth states", () => {
  assert.match(interactions, /className="landing-intent-badge"/);
  assert.match(interactions, /className="landing-terminal-cursor"/);
  assert.match(interactions, /activeCase\.id === "betrayal" \? "is-betrayal"/);
  assert.match(css, /\.landing-threat-card-warn \.landing-intent-badge[^}]*animation:/s);
  assert.match(css, /\.landing-terminal-cursor[^}]*animation:/s);
  assert.match(css, /\.landing-attack-widget\.is-betrayal \.landing-kernel-trace[^}]*box-shadow:/s);
  assert.match(css, /\.landing-attack-chips button\.is-active::before/);
  assert.match(css, /\.live-intent-trigger[^}]*animation:/s);
  assert.match(css, /:active/);
});


test("console actions render as structured evidence cards", () => {
  assert.match(missionControl, /className="action-type-glyph"/);
  assert.match(missionControl, /className="action-meta"/);
  assert.match(missionControl, /className="action-verdict-chip"/);
  assert.match(missionControl, /function actionTypeGlyph/);
  assert.match(missionControl, /function actionVerdictLabel/);
  assert.match(missionControl, /return "HELD"/);
  assert.match(missionControl, /className="evidence-block evidence-policy"/);
  assert.match(missionControl, /className="evidence-block evidence-intent"/);
  assert.match(css, /\.console-shell \.action-row:not\(\.hijack-row\)[^}]*background:\s*var\(--surface-2\)/s);
  assert.match(css, /\.action-type-glyph/);
  assert.match(css, /\.action-verdict-chip/);
  assert.match(css, /\.evidence-block/);
});


test("approval queue promotes amount, counterparty, and one primary action", () => {
  assert.match(missionControl, /className="approval-kind"/);
  assert.match(missionControl, /className="approval-amount"/);
  assert.match(missionControl, /className="approval-counterparty"/);
  assert.match(missionControl, /className="approval-meta"/);
  assert.match(css, /\.approval-counterparty/);
  assert.match(css, /\.approval-amount/);
  assert.match(css, /\.approval-actions \.approve-button[^}]*background:\s*var\(--ok\)/s);
  assert.match(css, /\.approval-actions \.reject-button[^}]*background:\s*transparent/s);
});
