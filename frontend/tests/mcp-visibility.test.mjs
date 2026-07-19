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
const readme = readFileSync(join(REPO_DIR, "README.md"), "utf8");


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


test("the disclosure overlays the console and the landing evidence grid links to it", () => {
  assert.match(panel, /<details className="mcp-visibility"/);
  assert.match(css, /\.mcp-visibility-panel\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.mcp-visibility-panel\s*\{[^}]*position:\s*fixed/s);

  const evidenceGrid = page.match(/<div className="landing-proof-links">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.equal((evidenceGrid.match(/<(?:a|Link)\b/g) ?? []).length, 4);
  assert.match(evidenceGrid, /<Link href="\/console">/);
  assert.match(evidenceGrid, /<span>INTEGRATION<\/span>/);
  assert.match(evidenceGrid, /<strong>Works with any MCP client<\/strong>/);
  assert.match(evidenceGrid, /Codex CLI, Claude, ChatGPT developer mode — every agent action judged before it executes\. Config in the console →/);
  assert.doesNotMatch(page, /landing-mcp-link/);
  assert.equal((page.match(/data-section=/g) ?? []).length, 9);
});


test("README and console publish the same real MCP runtime and four tools", () => {
  const config = panel.match(/const MCP_CONFIG = `([\s\S]*?)`;/)?.[1];
  assert.ok(config);
  assert.match(readme, /## Use via MCP/);
  assert.match(readme, /Plug AgentGuard into any MCP client — Codex CLI, Claude, or ChatGPT developer mode\. Every agent action gets judged before it executes\./);
  assert.ok(readme.includes(`\`\`\`json\n${config}\n\`\`\``));

  for (const tool of ["declare_mission", "request_action", "check_action_status", "get_policies"]) {
    assert.match(readme, new RegExp("- `" + tool + "` — "));
    assert.match(server, new RegExp(`def ${tool}\\(`));
    assert.match(panel, new RegExp(tool));
  }

  assert.match(readme, /Any MCP-capable agent gets the policy floor \+ GPT-5\.6 intent judgment \+ hash-chained ledger without SDK work\./);
});


test("mobile evidence and console controls keep complete text and forty-four pixel targets", () => {
  assert.match(css, /@media \(max-width:860px\)\s*\{\s*\.mcp-visibility-panel\s*\{[^}]*position:fixed;[^}]*right:12px;[^}]*left:12px;[^}]*width:auto/s);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.landing-judge-grid a,\.landing-tamper-line a\s*\{[^}]*min-height:44px/s);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.landing-footer a\s*\{[^}]*min-width:44px/s);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.mcp-visibility>summary,\.mcp-visibility-panel>a,\.mcp-config-heading button\s*\{[^}]*min-height:44px/s);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.mcp-config-heading button\s*\{[^}]*min-width:44px/s);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*\.agent-risk-head small\s*\{[^}]*overflow:visible;[^}]*white-space:normal/s);
});
