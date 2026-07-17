# Deploy AgentGuard on Render and Vercel

Deploy the backend first, deploy the frontend second, then replace the temporary CORS origin with the final Vercel URL. The public seeded dashboard requires no OpenAI or OpenRouter key.

## 1. Deploy the backend on Render

1. In Render, choose **New > Web Service** and connect `doctormizio777777/agentguard`.
2. Set **Language** to `Docker`.
3. Set **Root Directory** to `backend`.
4. Set **Dockerfile Path** to `backend/Dockerfile` and **Docker Build Context** to `backend`. These paths are relative to the repository root.
5. Use port `8000`. The Docker entrypoint starts Uvicorn on `0.0.0.0:8000`; no custom Docker command is required.
6. Set the health check path to `/health`.
7. Add these environment variables:

   | Variable | Value |
   | --- | --- |
   | `ALLOWED_ORIGINS` | `https://placeholder.invalid` for the first deploy |
   | `DEMO_MODE` | `true` |
   | `DEMO_RESET_KEY` | A new random value of at least 32 characters |
   | `AUTO_RESEED_MINUTES` | `60` |
   | `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` |
   | `INTENT_MODEL` | `openai/gpt-5.6-sol` |
   | `OR_X_TITLE` | `AgentGuard` |

8. Deploy and wait for Render to report the `/health` check as healthy.
9. Copy the assigned backend URL, for example `https://agentguard-api.onrender.com`.

The container initializes the schema and runs the canned seed only when the ledger is empty. With no persistent disk, a new Render instance starts from the same deterministic 3-agent, 15-action dataset. Do not set `AGENT_GUARDRAIL_DB` on Render.

For the optional real GPT-5.6 video demo, add `OPENAI_API_KEY` as a Render secret. The public canned dashboard and `/demo/reset` do not need it.

The checked-in [`render.yaml`](../render.yaml) encodes the same service. Render's current Blueprint keys are documented in the [Blueprint YAML reference](https://render.com/docs/blueprint-spec).

## 2. Deploy the frontend on Vercel

1. In Vercel, choose **Add New > Project** and import `doctormizio777777/agentguard`.
2. Edit **Root Directory** and select `frontend`.
3. Keep the detected Next.js framework, `pnpm install`, and `pnpm build` defaults.
4. Add `NEXT_PUBLIC_API_URL` for Production and Preview with the full Render URL and no trailing slash, for example `https://agentguard-api.onrender.com`.
5. Deploy and copy the production URL, for example `https://agentguard.vercel.app`.

Vercel documents the monorepo Root Directory flow in [Using Monorepos](https://vercel.com/docs/monorepos). `NEXT_PUBLIC_API_URL` is compiled into the browser bundle, so redeploy the frontend after changing it.

## 3. Close CORS after Vercel assigns the URL

1. Return to the Render service settings.
2. Replace `ALLOWED_ORIGINS=https://placeholder.invalid` with the exact production Vercel origin, for example `ALLOWED_ORIGINS=https://agentguard.vercel.app`.
3. If Vercel preview deployments also need API access, append each explicit trusted origin separated by commas.
4. Save and redeploy the Render service.
5. Reload the Vercel page. It must show the `PUBLIC DEMO · RESETS PERIODICALLY` chip, the compact intro band, the expanded red hijack card, three agents, and a valid audit chain.

## 4. Verify the public deployment

Run these checks with your real URLs:

```bash
curl -i https://YOUR-RENDER-SERVICE.onrender.com/health
curl -s https://YOUR-RENDER-SERVICE.onrender.com/dashboard/summary
curl -I https://YOUR-VERCEL-PROJECT.vercel.app/
```

The summary must contain these values; timestamps and ordering are not part of the contract:

```json
{
  "blocked_count": 1,
  "agents_online": 3,
  "ledger": {
    "entries": 15,
    "valid": true
  },
  "demo": true
}
```

Confirm the flagship event:

```bash
curl -s "https://YOUR-RENDER-SERVICE.onrender.com/actions?limit=1"
```

The first action must be a blocked `500000`-cent payment to `unknown-vendor.xyz` with `hijack_suspected` confidence `0.97`.

## 5. Reset the public demo

`POST /demo/reset` rejects missing or incorrect keys. Keep `DEMO_RESET_KEY` only in Render and your password manager.

Reset is intentionally destructive: it starts a new 15-entry audit epoch and removes the previous synthetic demo history. Never point this deployment mode at real actions or production data.

```bash
curl -i -X POST \
  -H "X-Demo-Key: YOUR-DEMO-RESET-KEY" \
  https://YOUR-RENDER-SERVICE.onrender.com/demo/reset
```

A successful response reports `"status":"reset"`, `"agents":3`, `"actions":15`, and `"ledger":{"valid":true,...}`. Follow it with:

```bash
curl -s https://YOUR-RENDER-SERVICE.onrender.com/ledger/verify
```

Expected integrity fields are `"valid":true`, `"entries_checked":15`, and `"first_broken_seq":null`.
