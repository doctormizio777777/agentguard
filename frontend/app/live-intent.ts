export type LiveScenarioId =
  | "aligned_api_credits"
  | "over_cap_wire"
  | "hijack_beneficiary"
  | "betrayal_gift_cards";

export type LiveIntentVerdict = {
  verdict: "aligned" | "suspicious" | "hijack_suspected";
  confidence: number;
  reasoning: string;
  model: string;
  latency_ms: number;
  response_id: string;
  evaluated_at: string;
};

export type LiveIntentProvenance = {
  source: "LIVE OPENAI";
  model: string;
  response_id: string | null;
  latency_ms: number;
  timestamp: string;
};

export type LiveIntentResult = {
  scenario_id: LiveScenarioId;
  cached: boolean;
  action_id: number;
  status: "allowed" | "pending_approval" | "blocked";
  verdict: LiveIntentVerdict | null;
  provenance: LiveIntentProvenance;
  action: { id: number };
  message?: string;
};

export const LIVE_SCENARIOS: readonly { id: LiveScenarioId; label: string }[] = [
  { id: "aligned_api_credits", label: "Aligned · €200 API credits" },
  { id: "over_cap_wire", label: "Over cap · €5,000 wire" },
  { id: "hijack_beneficiary", label: "Hijack · unknown beneficiary" },
  { id: "betrayal_gift_cards", label: "Betrayal · €300 gift cards" },
] as const;

export const DEFAULT_LIVE_SCENARIO_ID: LiveScenarioId = "betrayal_gift_cards";
export const LIVE_INTENT_PROGRESS = [
  "checking policy",
  "calling GPT-5.6",
  "validating verdict",
  "appending ledger",
] as const;

export async function requestLiveIntent(
  baseUrl: string,
  scenarioId: LiveScenarioId,
): Promise<LiveIntentResult> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/demo/live-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  const body = await response.json() as LiveIntentResult | { detail?: string };
  if (!response.ok) {
    const detail = "detail" in body ? body.detail : undefined;
    throw new Error(detail ?? `Live intent check failed with HTTP ${response.status}`);
  }
  if (!isLiveIntentResult(body)) throw new Error("Live intent response failed validation");
  return body;
}

export function truncateResponseId(value: string | null): string {
  if (!value) return "unavailable";
  return value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function isLiveIntentResult(value: unknown): value is LiveIntentResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<LiveIntentResult>;
  return (
    typeof result.scenario_id === "string"
    && typeof result.cached === "boolean"
    && typeof result.action_id === "number"
    && typeof result.status === "string"
    && !!result.provenance
    && result.provenance.source === "LIVE OPENAI"
    && typeof result.provenance.model === "string"
    && typeof result.provenance.latency_ms === "number"
    && typeof result.provenance.timestamp === "string"
  );
}
