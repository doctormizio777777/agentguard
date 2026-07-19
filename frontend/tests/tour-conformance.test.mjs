import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");
const missionControl = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");
const landing = readFileSync(join(APP_DIR, "page.tsx"), "utf8");
const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");


test("the veil creates a true semantic spotlight for all six steps", () => {
  assert.match(css, /--guided-scrim:\s*rgba\(6,8,14,\.62\)/);
  assert.match(css, /\.guided-tour-scrim\s*\{[^}]*z-index:\s*40[^}]*opacity:\s*1/s);
  assert.match(css, /@keyframes guided-scrim-in\s*\{[^}]*opacity:\s*0[^}]*\}[^}]*opacity:\s*1/s);
  assert.match(css, /\.guided-focus\s*\{[^}]*z-index:\s*50!important[^}]*outline:\s*2px solid var\(--guided-focus-tone\)/s);
  assert.match(css, /\.guided-focus-ok\s*\{\s*--guided-focus-tone:\s*var\(--ok\)/);
  assert.match(missionControl, /\["info",\s*"ok",\s*"warn",\s*"danger",\s*"warn",\s*"info"\]\s*as const/);
  assert.match(missionControl, /id=\{`action-\$\{action\.id\}-hijack`\}/);
});


test("the approved step card hierarchy and controls are present", () => {
  assert.match(css, /\.guided-tour-card\s*\{[^}]*z-index:\s*60[^}]*width:\s*min\(560px,94vw\)[^}]*border-radius:\s*10px/s);
  assert.match(css, /\.guided-tour-meta\s*\{[^}]*justify-content:\s*space-between/s);
  assert.match(css, /\.guided-tour-actions\s*\{[^}]*justify-content:\s*flex-end/s);
  assert.match(missionControl, /className="guided-tour-meta"/);
  assert.match(missionControl, />FINISH<\/button>/);
  assert.match(missionControl, /event\.key === "Enter"/);
  assert.match(css, /\.guided-tour-exit::after\s*\{\s*content:\s*" \\2715"/);
});


test("the complete state matches the approved handoff and pulses tamper twice", () => {
  assert.match(missionControl, /<span className="guided-tour-counter">TOUR COMPLETE<\/span>/);
  assert.match(missionControl, /<h2 id="guided-tour-title">Now break something yourself<\/h2>/);
  assert.match(missionControl, /className="guided-tour-tamper"/);
  assert.match(missionControl, /className="guided-tour-restart"/);
  assert.match(css, /\.guided-tour-tamper\s*\{[^}]*var\(--warn\)/s);
  assert.match(css, /\.guided-tour-restart\s*\{[^}]*background:\s*var\(--accent\)/s);
  assert.match(css, /\.guided-tamper-pulse[^}]*animation:[^;]*2!important\s*;/s);
});


test("the landing handoff warms up before automatic step one", () => {
  assert.match(landing, /href="\/console\?demo=1"/);
  assert.match(missionControl, /initialTourWarming/);
  assert.match(missionControl, /summary\s*===\s*null/);
  assert.match(missionControl, /warming up the live system/);
  assert.match(missionControl, /className="guided-tour-spinner"/);
});


test("mobile and reduced-motion tour modes remain usable", () => {
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.guided-tour-card\s*\{[^}]*bottom:\s*0[^}]*width:\s*100%[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.guided-tour-actions button[^}]*min-height:\s*44px/s);
  assert.match(missionControl, /prefers-reduced-motion:\s*reduce/);
  assert.match(missionControl, /reducedMotion[\s\S]*\? \{ behavior: "auto", block: "center" \}[\s\S]*: \{ behavior: "smooth", block: "center" \}/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.guided-tamper-pulse[^}]*animation:\s*none!important/);
});
