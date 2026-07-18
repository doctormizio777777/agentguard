import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");


test("the Audit Chain widget runs and restores the public tamper test", () => {
  const missionControl = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");

  assert.match(missionControl, /fetch\(`\$\{API_BASE_URL\}\/demo\/tamper`/);
  assert.match(missionControl, /fetch\(`\$\{API_BASE_URL\}\/demo\/tamper\/restore`/);
  assert.match(missionControl, /TAMPER TEST/);
  assert.match(missionControl, /RESTORE/);
  assert.match(missionControl, /CHAIN BROKEN/);
  assert.match(missionControl, /first_broken_seq:/);
  assert.match(missionControl, /this is what tampering looks like/);
  assert.match(missionControl, /Corrupts a real entry in the demo DB via SQL\. The chain catches it\. Try it\./);
});


test("the verification section points judges to the live console tamper test", () => {
  const landing = readFileSync(join(APP_DIR, "page.tsx"), "utf8");

  assert.match(landing, /You can even tamper with the ledger yourself/);
  assert.match(landing, /the chain will catch you/);
  assert.match(landing, /open the console/);
  assert.match(landing, /href=["']\/console["']/);
});
