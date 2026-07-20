import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(TEST_DIR, "..");
const APP_DIR = join(FRONTEND_DIR, "app");
const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");
const landing = readFileSync(join(APP_DIR, "page.tsx"), "utf8");
const consoleSource = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");
const liveProof = readFileSync(join(APP_DIR, "live-proof-strip.tsx"), "utf8");
const layout = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
const motionValues = readFileSync(join(APP_DIR, "motion-values.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(join(FRONTEND_DIR, "package.json"), "utf8"));


test("one shared motion system governs landing and console states", () => {
  assert.match(css, /--dur-micro:\s*150ms/);
  assert.match(css, /--dur-state:\s*250ms/);
  assert.match(css, /--dur-reveal:\s*400ms/);
  assert.match(css, /--ease:\s*cubic-bezier\(0\.2,\s*0,\s*0,\s*1\)/);
  assert.doesNotMatch(css, /--motion-(?:fast|normal|slow)|--ease-out/);
});


test("focus-visible rings cover landing and console interactions", () => {
  assert.match(css, /\.landing-primary-link:focus-visible/);
  assert.match(css, /\.landing-attack-chips button:focus-visible/);
  assert.match(css, /\.landing-proof-links a:focus-visible/);
  assert.match(css, /\.action-summary:focus-visible/);
  assert.match(css, /\.agent-risk:focus-visible/);
  assert.match(css, /\.tamper-button:focus-visible/);
  assert.match(css, /\.guided-tour-actions button:focus-visible/);
  assert.match(css, /outline:\s*2px solid var\(--accent\)/);
  assert.match(css, /outline-offset:\s*2px/);
});


test("reduced motion disables shared durations and keeps content complete", () => {
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /--dur-micro:\s*0ms/);
  assert.match(css, /--dur-state:\s*0ms/);
  assert.match(css, /--dur-reveal:\s*0ms/);
  assert.match(readFileSync(join(APP_DIR, "landing-interactions.tsx"), "utf8"), /prefers-reduced-motion: reduce/);
  assert.match(liveProof, /active=\{summary !== null\}/);
  assert.match(motionValues, /prefers-reduced-motion: reduce/);
});


test("scroll reveal fires once and sticky headers react after forty pixels", () => {
  const runtimePath = join(APP_DIR, "motion-runtime.tsx");
  assert.equal(existsSync(runtimePath), true);
  if (!existsSync(runtimePath)) return;
  const runtime = readFileSync(runtimePath, "utf8");
  assert.match(runtime, /IntersectionObserver/);
  assert.match(runtime, /threshold:\s*0\.15/);
  assert.match(runtime, /unobserve/);
  assert.match(runtime, /scrollY\s*>\s*40/);
  assert.match(runtime, /landing-nav/);
  assert.match(runtime, /topbar/);
  assert.doesNotMatch(runtime, /landing-hero["']/);
});


test("live proof and console KPIs animate their fetched targets", () => {
  assert.match(liveProof, /summary\?\.actions_today \?\? null/);
  assert.match(liveProof, /summary\?\.threats_blocked \?\? null/);
  assert.match(liveProof, /summary\?\.pending_count \?\? null/);
  assert.match(motionValues, /COUNT_UP_DURATION_MS\s*=\s*600/);
  assert.match(motionValues, /setTimeout\(\(\) => setValue\(target\), COUNT_UP_DURATION_MS \+ 100\)/);
  assert.match(consoleSource, /useCountUp\(value\)/);
  assert.match(consoleSource, /className="kpi-value"/);
  assert.match(css, /\.landing-proof-stat strong[^}]*min-width/s);
  assert.match(css, /\.kpi-value[^}]*min-width/s);
});


test("hero verdict swaps cross-fade inside a locked card", () => {
  const interactions = readFileSync(join(APP_DIR, "landing-interactions.tsx"), "utf8");
  assert.match(interactions, /hasCompared/);
  assert.match(css, /\.landing-threat-card[^}]*min-height/s);
  assert.match(css, /verdict-crossfade/);
  assert.match(css, /var\(--dur-state\)/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.landing-threat-card\s*\{\s*min-height:\s*763px/);
});


test("the three approved copy fixes are exact", () => {
  const renderedSources = `${landing}\n${consoleSource}\n${layout}`;
  assert.doesNotMatch(renderedSources, /The intelligent firewall for AI agents/);
  assert.match(landing, /The firewall for AI agents/);
  assert.match(consoleSource, /The firewall for AI agents/);
  assert.match(layout, /AgentGuard — The firewall for AI agents/);
  assert.match(landing, /Deterministic layers catch rule violations\./);
  assert.doesNotMatch(landing, /Deterministic layers catch false facts\./);
  assert.match(landing, /Codex \+ GPT-5\.6\s*<small>· FastAPI · SQLite · Next\.js · MCP<\/small>/);
});


test("mobile polish preserves internal table scroll and forty-four pixel targets", () => {
  assert.match(css, /\.landing-table-wrap[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.landing-table-wrap[^}]*mask-image/s);
  assert.match(css, /\.landing-hero-actions a[^}]*min-height:\s*44px/s);
  assert.match(css, /\.landing-attack-chips button[^}]*min-height:\s*44px/s);
  assert.match(css, /\.workspace-grid\s*\{\s*grid-template-columns:\s*1fr/);
});


test("visual polish adds no frontend dependency", () => {
  assert.deepEqual(packageJson.dependencies, {
    next: "15.5.9",
    react: "19.1.0",
    "react-dom": "19.1.0",
  });
  assert.deepEqual(packageJson.devDependencies, {
    "@types/node": "22.15.0",
    "@types/react": "19.1.0",
    "@types/react-dom": "19.1.0",
    autoprefixer: "10.4.21",
    postcss: "8.5.3",
    tailwindcss: "3.4.17",
    typescript: "5.8.3",
  });
});
