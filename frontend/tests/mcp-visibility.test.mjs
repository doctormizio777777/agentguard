import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(TEST_DIR, "..");
const APP_DIR = join(FRONTEND_DIR, "app");
const REPO_DIR = join(FRONTEND_DIR, "..");
const panelPath = join(APP_DIR, "mcp-visibility-panel.tsx");
const panel = existsSync(panelPath) ? readFileSync(panelPath, "utf8") : "";
const missionControl = readFileSync(join(APP_DIR, "mission-control.tsx"), "utf8");
const page = readFileSync(join(APP_DIR, "page.tsx"), "utf8");
const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");
const server = readFileSync(join(REPO_DIR, "backend", "app", "mcp_server.py"), "utf8");


test("the console exposes the real streamable HTTP MCP runtime", () => {
  assert.equal(existsSync(panelPath), true);
  assert.match(server, /host="127\.0\.0\.1"/);
  assert.match(server, /port=8001/);
  assert.match(server, /mcp\.run\(transport="streamable-http"\)/);

  assert.match(panel, /"command": "python"/);
  assert.match(panel, /"args": \["-m", "app\.mcp_server"\]/);
  assert.match(panel, /"cwd": "backend"/);
  assert.match(panel, /"transport": "streamable-http"/);
  assert.match(panel, /"url": "http:\/\/127\.0\.0\.1:8001\/mcp"/);
  assert.match(panel, /navigator\.clipboard\.writeText\(MCP_CONFIG\)/);
});


test("the MCP panel lists only the four tools implemented by the server", () => {
  for (const tool of ["declare_mission", "request_action", "check_action_status", "get_policies"]) {
    assert.match(server, new RegExp(`def ${tool}\\(`));
    assert.match(panel, new RegExp(tool));
  }

  assert.match(panel, /USE VIA MCP/);
  assert.match(panel, /Plug AgentGuard into any MCP client/);
  assert.match(panel, /docs\/superpowers\/specs\/2026-07-17-phase-4-mcp-approval-design\.md/);
  assert.doesNotMatch(panel, /install (?:in|into) ChatGPT/i);
  assert.match(missionControl, /import \{ McpVisibilityPanel \} from "\.\/mcp-visibility-panel"/);
  assert.match(missionControl, /<McpVisibilityPanel \/>/);
});


test("the disclosure overlays the console and the landing links to it without a new section", () => {
  assert.match(panel, /<details className="mcp-visibility"/);
  assert.match(css, /\.mcp-visibility-panel\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.mcp-visibility-panel\s*\{[^}]*position:\s*fixed/s);
  assert.match(page, /Works with any MCP client/);
  assert.match(page, /href="\/console"/);
  assert.equal((page.match(/data-section=/g) ?? []).length, 9);
});
