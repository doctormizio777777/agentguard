import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");
const missionControl = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");
const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");


test("the attack trigger and demo query start the guided tour overlay", () => {
  const consolePage = readFileSync(join(APP_DIR, "console", "page.tsx"), "utf8");

  assert.match(consolePage, /demo\s*===\s*["']1["']/);
  assert.match(missionControl, /startGuidedTour/);
  assert.match(missionControl, /initialDemoOpen/);
  assert.match(missionControl, /guided-tour-card/);
  assert.match(missionControl, /STEP \{tourStepIndex \+ 1\} \/ 6/);
  assert.doesNotMatch(missionControl, /guided-demo-panel/);
});


test("NEXT executes the ordered scenario step and refreshes before focus", () => {
  assert.match(missionControl, /requestScenarioStep\(API_BASE_URL, step\)/);
  assert.match(missionControl, /await refresh\(\)/);
  assert.match(missionControl, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(missionControl, />NEXT →<\/button>/);
});


test("ESC and EXIT TOUR close the overlay without resetting dashboard data", () => {
  assert.match(missionControl, /event\.key === "Escape"/);
  assert.match(missionControl, /document\.addEventListener\("keydown"/);
  assert.match(missionControl, />EXIT TOUR<\/button>/);
  assert.match(missionControl, /exitGuidedTour/);
});


test("the complete state offers tamper focus and restart", () => {
  assert.match(missionControl, /TOUR COMPLETE — now break something yourself/);
  assert.match(missionControl, />TAMPER THE LEDGER<\/button>/);
  assert.match(missionControl, />RESTART TOUR<\/button>/);
  assert.match(missionControl, /focusTamperWidget/);
});


test("failed scenario calls render a retry affordance", () => {
  assert.match(missionControl, /role="alert"/);
  assert.match(missionControl, />RETRY STEP<\/button>/);
  assert.match(missionControl, /retryGuidedTourStep/);
});


test("the token-only scrim and focus tones create the tour cutout", () => {
  assert.match(css, /\.guided-tour-scrim/);
  assert.match(css, /\.guided-tour-card/);
  assert.match(css, /\.guided-focus-info/);
  assert.match(css, /\.guided-focus-danger/);
  assert.match(css, /\.guided-focus-warn/);
  assert.match(css, /var\(--accent\)/);
  assert.match(css, /var\(--danger\)/);
  assert.match(css, /var\(--warn\)/);
});
