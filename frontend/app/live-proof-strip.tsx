"use client";

import { useEffect, useState } from "react";

import { API_BASE_URL } from "./api-config";
import { loadSummaryWithRetry } from "./live-proof-retry";
import { useCountUp } from "./motion-values";


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
        const nextSummary = await loadSummaryWithRetry<Summary>({
          signal: controller.signal,
          onRetry: () => setStatus("WAKING"),
          request: async () => {
            const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
              signal: controller.signal,
              cache: "no-store",
            });
            if (!response.ok) throw new Error(`Summary returned HTTP ${response.status}`);
            return await response.json() as Summary;
          },
        });
        setSummary(nextSummary);
        setStatus("LIVE");
      } catch (error) {
        if (!controller.signal.aborted) setStatus("WAKING");
      }
    };

    void load();
    return () => controller.abort();
  }, []);

  const values = [
    { label: "ACTIONS TODAY", target: summary?.actions_today ?? null },
    { label: "THREATS BLOCKED", target: summary?.threats_blocked ?? null },
    { label: "PENDING", target: summary?.pending_count ?? null },
  ];

  return (
    <div className="landing-proof-shell">
      <div className="landing-proof-grid">
        {values.map((item) => (
          <div className="landing-proof-stat" key={item.label}>
            <span>{item.label}</span>
            <ProofNumber active={summary !== null} target={item.target} />
          </div>
        ))}
        <div className="landing-proof-stat">
          <span>AUDIT CHAIN</span>
          <strong className="landing-proof-value">{summary ? (summary.ledger.valid ? "VALID" : "BROKEN") : "—"}</strong>
        </div>
      </div>
      <p className={`landing-proof-caption is-${status.toLowerCase()}`}>
        <i />pulled live from the running system · {status === "WAKING" ? "BACKEND WAKING — RETRYING AUTOMATICALLY" : status}
      </p>
    </div>
  );
}


function ProofNumber({ active, target }: { active: boolean; target: number | null }) {
  const { value, revision } = useCountUp(target, active);
  return <strong className="landing-proof-value" key={revision}>{value === null ? "—" : Math.round(value)}</strong>;
}
