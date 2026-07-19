"use client";

import { useState } from "react";


const MCP_CONFIG = `{
  "server": {
    "command": "python",
    "args": ["-m", "app.mcp_server"],
    "cwd": "backend"
  },
  "client": {
    "transport": "streamable-http",
    "url": "http://127.0.0.1:8001/mcp"
  }
}`;

const MCP_TOOLS = [
  ["declare_mission", "Declare or replace an agent mission and include it in future audit snapshots."],
  ["request_action", "Request authorization before any high-risk action; proceed only when status is allowed."],
  ["check_action_status", "Poll a pending action after the human approval decision."],
  ["get_policies", "Read the active caps, thresholds, and allowlists for an agent."],
] as const;

const MCP_DOCS_URL = "https://github.com/doctormizio777777/agentguard/blob/main/docs/superpowers/specs/2026-07-17-phase-4-mcp-approval-design.md";


export function McpVisibilityPanel() {
  const [copyLabel, setCopyLabel] = useState("COPY");

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(MCP_CONFIG);
      setCopyLabel("COPIED");
    } catch {
      setCopyLabel("COPY FAILED");
    }
  }

  return (
    <details className="mcp-visibility">
      <summary>USE VIA MCP</summary>
      <div className="mcp-visibility-panel" role="region" aria-label="AgentGuard MCP configuration">
        <header>
          <span>LOCAL MCP / STREAMABLE HTTP</span>
          <strong>AgentGuard tool surface</strong>
        </header>
        <p>Plug AgentGuard into any MCP client — Codex CLI, Claude, or ChatGPT developer mode. Every agent action gets judged before it executes.</p>

        <div className="mcp-config-heading">
          <span>REPO RUNTIME CONFIG</span>
          <button type="button" onClick={() => void copyConfig()}>{copyLabel}</button>
        </div>
        <pre><code>{MCP_CONFIG}</code></pre>
        <small>Run from the repository root with the backend environment installed. Register the local streamable-HTTP URL in your MCP client.</small>

        <div className="mcp-tools-heading">EXPOSED TOOLS</div>
        <ul>
          {MCP_TOOLS.map(([name, description]) => (
            <li key={name}><code>{name}</code><span>{description}</span></li>
          ))}
        </ul>

        <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer">READ THE MCP SERVER DOCS →</a>
      </div>
    </details>
  );
}
