# Agent Payment Guardrail

## Overview

Scaffold for an MCP server, policy engine, tamper-evident ledger, and dashboard that will let AI agents make autonomous payments safely and auditably.

## Architecture

- `backend/`: FastAPI service with SQLite foundation.
- `frontend/`: Next.js dashboard shell.
- Future components will add MCP tools, policy evaluation, and an append-only audit ledger.

## Setup

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
pnpm install
pnpm dev
```

## How I built this with Codex + GPT-5.6

Placeholder: document the implementation decisions and how Codex accelerated the build.

## Demo

Placeholder: start both services and open the dashboard to see the live backend health status.

