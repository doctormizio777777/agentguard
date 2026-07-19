import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");
const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");
const consoleSource = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");
const identityMarker = "/* Phase 10.11: console control-room identity */";
const elevationMarker = "/* Phase 12.5: AgentGuard as the layer between agents and execution */";
const identityBlock = css.includes(identityMarker)
  ? css.slice(css.indexOf(identityMarker), css.indexOf(elevationMarker))
  : "";


test("console uses a scoped twenty-four pixel technical grid", () => {
  assert.match(css, /\.console-shell::before\s*\{[^}]*background-image:[^}]*linear-gradient[^}]*background-size:\s*24px 24px/s);
  assert.match(css, /\.console-shell::before\s*\{[^}]*pointer-events:\s*none/s);
});


test("panels carry four token-colored corner brackets without wrappers", () => {
  assert.match(css, /\.console-shell \.panel::before,\s*\.console-shell \.panel::after/);
  assert.match(css, /background-image:[^}]*var\(--border-strong\)/s);
  assert.match(css, /background-size:[^}]*10px 1px[^}]*1px 10px/s);
  assert.doesNotMatch(consoleSource, /panel-corner|panel-wrapper/);
});


test("panel headings use micro-caps and an extending hairline", () => {
  assert.match(css, /\.console-shell \.panel-heading h2\s*\{[^}]*text-transform:\s*uppercase/s);
  assert.match(css, /\.console-shell \.panel-heading h2\s*\{[^}]*letter-spacing:/s);
  assert.match(css, /\.console-shell \.panel-heading h2::after\s*\{[^}]*height:\s*1px[^}]*background:\s*var\(--border\)/s);
});


test("console data values use the exact native monospace stack", () => {
  assert.match(css, /--font-data:\s*ui-monospace,"SF Mono","Cascadia Code","Roboto Mono",monospace/);
  assert.match(identityBlock, /\.kpi-value[^}]*font-family:\s*var\(--font-data\)/s);
  assert.match(identityBlock, /\.action-amount[^}]*font-family:\s*var\(--font-data\)/s);
  assert.match(identityBlock, /\.confidence-stat strong[^}]*font-family:\s*var\(--font-data\)/s);
  assert.match(identityBlock, /\.panel-count[^}]*font-family:\s*var\(--font-data\)/s);
  assert.match(identityBlock, /font-variant-numeric:\s*tabular-nums/);
});


test("KPI tiles use larger data, a baseline, and a stronger blocked identity", () => {
  assert.match(identityBlock, /\.kpi-reading strong\s*\{[^}]*font-size:\s*36px/s);
  assert.match(identityBlock, /\.kpi-card>small\s*\{[^}]*border-top:\s*1px solid var\(--border\)/s);
  assert.match(identityBlock, /\.kpi-card\.tone-danger>span\s*\{[^}]*color:\s*var\(--danger\)/s);
  assert.match(identityBlock, /\.kpi-card\.tone-danger\.has-danger\s*\{[^}]*border-width:\s*2px/s);
});


test("feed and approval items expose two-pixel semantic status rails", () => {
  assert.match(identityBlock, /\.action-row:not\(\.hijack-row\)\s*\{[^}]*border-left-width:\s*2px/s);
  assert.match(identityBlock, /\.action-row:not\(\.hijack-row\)\.status-allowed\s*\{[^}]*border-left-color:\s*var\(--ok\)/s);
  assert.match(identityBlock, /\.action-row:not\(\.hijack-row\)\.status-pending_approval\s*\{[^}]*border-left-color:\s*var\(--warn\)/s);
  assert.match(identityBlock, /\.action-row:not\(\.hijack-row\)\.status-blocked\s*\{[^}]*border-left-color:\s*var\(--danger\)/s);
  assert.match(identityBlock, /\.approval-item\s*\{[^}]*border-left:\s*2px solid var\(--warn\)/s);
});


test("header metrics read as one monospace system status bar", () => {
  assert.match(consoleSource, /className="header-chips system-status-bar"/);
  assert.match(identityBlock, /\.system-status-bar \.status-chip,\s*\.system-status-bar \.live-chip\s*\{[^}]*font-family:\s*var\(--font-data\)/s);
  assert.match(identityBlock, /\.system-status-bar \.status-chip,\s*\.system-status-bar \.live-chip\s*\{[^}]*border-left:\s*1px solid var\(--border\)/s);
});


test("the identity block is console-scoped and does not redefine motion", () => {
  assert.ok(identityBlock.length > 0);
  assert.doesNotMatch(identityBlock, /\.landing-/);
  assert.doesNotMatch(identityBlock, /--dur-(?:micro|state|reveal)|--ease:/);
});
