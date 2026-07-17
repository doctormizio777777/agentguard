# Phase 4 MCP Server and Approval Loop Design

## Scope

Expose the existing policy floor and audit ledger through the official MCP Python SDK. Add mission storage with history and one active mission per agent. Do not add LLM behavior, payment execution, frontend changes, or new approval endpoints.

## Shared service boundary

`backend/app/service.py` owns mission declaration, action creation, action status lookup, policy lookup, and action snapshots. HTTP routes and MCP tools call these functions; neither transport evaluates policy or writes actions directly. Action creation and approval transitions preserve the Phase 3 transaction boundary and include the active `mission_text` in every ledger snapshot.

## MCP transport

`backend/app/mcp_server.py` creates `FastMCP("agentguard")` and exposes four imperative tools. It runs as a standalone streamable-HTTP server on port 8001. MCP identifiers accept numeric agent IDs or agent names; a first mission declaration may register a new named agent. MCP action payloads carry `counterparty` and integer `amount_cents` alongside action-specific fields.

## Approval loop

`request_action` returns the persisted action ID, lowercase status, and reasons. Pending actions are never approved by MCP. The human uses the existing HTTP approval route, and `check_action_status` reads the resulting status and reasons.

## Demo and tests

The demo client uses the official MCP client over streamable HTTP, prints the required five-step sequence, pauses while polling a pending action, and relies on the HTTP approval endpoint for the transition. Tests cover mission supersession, mission snapshots, every MCP tool, HTTP/MCP parity, and pending-to-approved polling.
