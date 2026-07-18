"use client";

import { useEffect, useState } from "react";

import { API_BASE_URL } from "./api-config";


type Summary = {
  actions_today: number;
  threats_blocked: number;
  pending_count: number;
  ledger: { valid: boolean };
};


export function LiveProofStrip() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<"CONNECTING" | "LIVE" | "WAKING">("CONNECTING");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Summary returned HTTP ${response.status}`);
        setSummary(await response.json() as Summary);
        setStatus("LIVE");
      } catch (error) {
        if (!controller.signal.aborted) setStatus("WAKING");
      }
    };

    void load();
    return () => controller.abort();
  }, []);

  const values = [
    { label: "ACTIONS TODAY", value: summary?.actions_today ?? "—" },
    { label: "THREATS BLOCKED", value: summary?.threats_blocked ?? "—" },
    { label: "PENDING", value: summary?.pending_count ?? "—" },
    { label: "AUDIT CHAIN", value: summary ? (summary.ledger.valid ? "VALID" : "BROKEN") : "—" },
  ];

  return (
    <div className="landing-proof-shell">
      <div className="landing-proof-grid">
        {values.map((item) => (
          <div className="landing-proof-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <p className={`landing-proof-caption is-${status.toLowerCase()}`}>
        <i />pulled live from the running system · {status === "WAKING" ? "BACKEND WAKING — OPEN THE CONSOLE TO RETRY" : status}
      </p>
    </div>
  );
}
