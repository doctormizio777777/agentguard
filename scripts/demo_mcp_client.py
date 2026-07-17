from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


MCP_URL = os.getenv("AGENTGUARD_MCP_URL", "http://127.0.0.1:8001/mcp")


async def call_tool(session: ClientSession, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    result = await session.call_tool(name, arguments)
    if result.isError:
        raise RuntimeError(f"MCP tool {name} failed: {result.content}")
    if result.structuredContent:
        return result.structuredContent
    return json.loads(result.content[0].text)


async def run_demo() -> None:
    async with streamable_http_client(MCP_URL) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            print('a. declare_mission("procurement-bot", "Buy API credits from approved vendors, max budget 2000 EUR/day")', flush=True)
            mission = await call_tool(
                session,
                "declare_mission",
                {"agent_id": "procurement-bot", "mission": "Buy API credits from approved vendors, max budget 2000 EUR/day"},
            )
            print(json.dumps(mission), flush=True)
            agent_id = str(mission["agent_id"])

            print("b. request_action payment 20000 cents to openai.com", flush=True)
            allowed = await call_tool(
                session,
                "request_action",
                {"agent_id": agent_id, "action_type": "payment", "payload": {"amount_cents": 20000, "counterparty": "openai.com"}},
            )
            print(json.dumps(allowed), flush=True)

            print("c. request_action payment 500000 cents to unknown-vendor.xyz", flush=True)
            blocked = await call_tool(
                session,
                "request_action",
                {"agent_id": agent_id, "action_type": "payment", "payload": {"amount_cents": 500000, "counterparty": "unknown-vendor.xyz"}},
            )
            print(json.dumps(blocked), flush=True)

            print("d. request_action payment 70000 cents to stripe.com", flush=True)
            pending = await call_tool(
                session,
                "request_action",
                {"agent_id": agent_id, "action_type": "payment", "payload": {"amount_cents": 70000, "counterparty": "stripe.com"}},
            )
            print(json.dumps(pending), flush=True)
            action_id = str(pending["action_id"])
            print(f"action_id={action_id}", flush=True)
            print("waiting for human approval...", flush=True)

            print("e. poll check_action_status every 2s", flush=True)
            while True:
                status = await call_tool(session, "check_action_status", {"action_id": action_id})
                print(json.dumps(status), flush=True)
                if status["status"] != "pending":
                    print(f"final status: {status['status']}", flush=True)
                    break
                await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(run_demo())
