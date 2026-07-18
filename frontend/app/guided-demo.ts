export type GuidedTourTone = "info" | "danger" | "warn";
export type GuidedTourTarget = "agent" | "action" | "approval" | "evidence";

export type GuidedTourStep = {
  scenarioStep: number;
  target: GuidedTourTarget;
  tone: GuidedTourTone;
  title: string;
  narration: string;
};

export type ScenarioStepResult = {
  step: number;
  status: string;
  agent_id?: number;
  mission_text?: string;
  archived_actions?: number;
  poisoned_document?: string;
  action?: {
    id: number;
    status: "allowed" | "pending_approval" | "blocked";
    counterparty: string;
    amount: string | null;
    intent_verdict: { verdict: string; confidence: number; reasoning: string } | null;
  };
  ledger?: {
    valid: boolean;
    entries_checked: number;
    first_broken_seq: number | null;
    reason: string | null;
  };
  risk_score?: number;
};

export const GUIDED_TOUR_STEPS: readonly GuidedTourStep[] = [
  {
    scenarioStep: 0,
    target: "agent",
    tone: "info",
    title: "A mission is declared",
    narration: "The operator declares what this agent is FOR: buy API credits from approved vendors, max €2,000/day. Every future action will be judged against this sentence.",
  },
  {
    scenarioStep: 1,
    target: "action",
    tone: "info",
    title: "Normal work flows freely",
    narration: "A €200 payment to an approved vendor. Passes every rule, serves the mission. GPT-5.6 verdict: aligned, 0.96. No friction.",
  },
  {
    scenarioStep: 2,
    target: "action",
    tone: "danger",
    title: "The agent reads a poisoned document",
    narration: "Hidden inside a routine invoice: instructions telling the agent to urgently wire money to a new beneficiary. The agent's context is now compromised. No rule has been broken — yet.",
  },
  {
    scenarioStep: 3,
    target: "action",
    tone: "danger",
    title: "The hijack is caught",
    narration: "The agent tries to send €5,000 to unknown-vendor.xyz. The intent firewall reads the request against the mission: beneficiary change, urgency language, unknown counterparty. BLOCKED at 0.97 confidence.",
  },
  {
    scenarioStep: 4,
    target: "approval",
    tone: "warn",
    title: "The attack rules can't see",
    narration: "€300 in gift cards. Allowlisted vendor, under every cap — every numeric rule is green. But it doesn't serve the mission. Suspicious at 0.84: held for human approval. This is the case only an intent layer catches.",
  },
  {
    scenarioStep: 5,
    target: "evidence",
    tone: "info",
    title: "Everything is evidence",
    narration: "Every decision is in a hash-chained ledger — tamper with one entry and the chain snaps, live. The agent's risk score just hit 95. This is what accountability for AI agents looks like.",
  },
] as const;

export function scenarioStepUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/demo/scenario/step`;
}

export async function requestScenarioStep(apiBaseUrl: string, step: number): Promise<ScenarioStepResult> {
  const response = await fetch(scenarioStepUrl(apiBaseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step }),
  });
  let result: (ScenarioStepResult & { detail?: string }) | null = null;
  try {
    result = await response.json() as ScenarioStepResult & { detail?: string };
  } catch {
    // The status code below remains the authoritative fallback for non-JSON failures.
  }
  if (!response.ok) throw new Error(result?.detail ?? `Scenario step failed with HTTP ${response.status}`);
  if (!result) throw new Error("Scenario step returned an invalid response");
  return result;
}
