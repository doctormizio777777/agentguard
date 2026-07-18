import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(TEST_DIR, "..", "app");


test("metadata states the product promise and security layers", () => {
  const layout = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
  assert.match(layout, /AgentGuard — The intelligent firewall for AI agents/);
  assert.match(layout, /A GPT-5\.6 intent layer that catches hijacked agents static rules can't see\. Policy floor, intent firewall, tamper-evident audit chain\./);
  assert.match(layout, /themeColor:\s*"#0f1117"/);
});


test("app icon and header use the aperture mark", () => {
  const iconPath = join(APP_DIR, "icon.svg");
  assert.equal(existsSync(iconPath), true);
  const icon = readFileSync(iconPath, "utf8");
  const page = readFileSync(join(APP_DIR, "page.tsx"), "utf8");
  assert.match(icon, /viewBox="0 0 32 32"/);
  assert.match(icon, /<circle/);
  assert.match(page, /<AgentGuardMark/);
  assert.doesNotMatch(page, /brand-mark">AG/);
});


test("Mission Control contains the guided demo drawer and attack trigger", () => {
  const page = readFileSync(join(APP_DIR, "page.tsx"), "utf8");
  const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");
  assert.match(page, /RUN THE ATTACK DEMO/);
  assert.match(page, /GUIDED DEMO/);
  assert.match(page, /scrollIntoView/);
  assert.match(css, /\.guided-demo-panel/);
  assert.match(css, /\.guided-focus/);
});
