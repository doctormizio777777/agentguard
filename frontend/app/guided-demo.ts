export type GuidedDemoStep = {
  step: number;
  title: string;
  explanation: string;
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

export const GUIDED_DEMO_STEPS: GuidedDemoStep[] = [
  { step: 0, title: "Reset scenario", explanation: "Archive prior scenario actions and declare the procurement mission." },
  { step: 1, title: "Approved purchase", explanation: "Request EUR 200 of API credits from openai.com." },
  { step: 2, title: "Poisoned document", explanation: "Reveal the instruction that attempts to redirect the agent." },
  { step: 3, title: "Blocked hijack", explanation: "Stage the EUR 5,000 unknown-vendor payment and inspect the block." },
  { step: 4, title: "Human review", explanation: "Stage a policy-safe gift-card payment for manual approval." },
  { step: 5, title: "Verify evidence", explanation: "Verify the ledger chain and compute the scenario agent risk." },
];

export function scenarioStepUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/demo/scenario/step`;
}
