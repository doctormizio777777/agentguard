"use client";

import { useEffect, useState } from "react";

type HealthResponse = { status: string };
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${backendUrl}/health`)
      .then((response) => {
        if (!response.ok) throw new Error(`Backend responded with HTTP ${response.status}`);
        return response.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <main className="min-h-screen px-6 py-16 sm:px-12 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <p className="mb-5 text-sm uppercase tracking-[0.3em]" style={{ color: "var(--accent)" }}>Autonomous payments / guardrail layer</p>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-7xl">Agent Payment Guardrail</h1>
        <p className="mt-6 max-w-xl text-lg leading-8" style={{ color: "var(--muted)" }}>A safe, auditable foundation for AI agents that need to move money.</p>
        <section className="mt-16 max-w-md border p-6" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Backend health</p>
          <p className="mt-3 text-2xl font-semibold" style={{ color: error ? "var(--danger)" : "var(--accent)" }}>{health ? health.status : error ?? "Checking…"}</p>
        </section>
      </div>
    </main>
  );
}

