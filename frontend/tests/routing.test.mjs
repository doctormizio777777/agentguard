import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");


test("the landing route points persistently to the dedicated console", () => {
  const landing = readFileSync(join(APP_DIR, "page.tsx"), "utf8");

  assert.match(landing, /href=["']\/console["']/);
  assert.match(landing, /OPEN CONSOLE/);
  assert.doesNotMatch(landing, /fetch\(`\$\{API_BASE_URL\}\/dashboard\/summary`\)/);
});


test("Mission Control moves intact to the console route with an About link", () => {
  const consolePagePath = join(APP_DIR, "console", "page.tsx");
  assert.equal(existsSync(consolePagePath), true);

  const consolePage = readFileSync(consolePagePath, "utf8");
  const missionControl = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");

  assert.match(consolePage, /<MissionControl/);
  assert.match(missionControl, /Mission Control/);
  assert.match(missionControl, /RUN THE ATTACK DEMO/);
  assert.match(missionControl, /Approval Queue/);
  assert.match(missionControl, /href=["']\/["']/);
  assert.match(missionControl, /About/);
});
