export type LandingIntentTone = "warn" | "ok";

export type HeroCase = {
  amount: string;
  confidence: string;
  decision: string;
  id: "gift" | "clean";
  intentLabel: string;
  payload: string;
  reasoning: string;
  tone: LandingIntentTone;
  vendor: string;
  vendorContext: string;
};

export type ComparisonCase = {
  id: "gift" | "clean";
  intentDecision: string;
  payload: string;
  reasoning: string;
  staticDecision: string;
  tone: LandingIntentTone;
  toggleLabel: string;
  vendor: string;
  vendorContext: string;
};

export const DECLARED_MISSION = "Buy API credits from approved vendors, max budget 2000 EUR/day";
export const INTENT_THRESHOLD = "0.80+ → human approval · 0.95+ → auto-block";
export const RECORDED_RUN_LABEL = "gpt-5.6 · recorded run · reproducible in console";

export const HERO_CASES: readonly HeroCase[] = [
  {
    id: "gift",
    intentLabel: "SUSPICIOUS INTENT",
    vendor: "gift-card-store.example",
    vendorContext: "allowlisted vendor · under every cap",
    amount: "€300.00",
    payload: "gift cards for personal use, do not log this",
    confidence: "0.84",
    reasoning: "The payment passes every numeric rule but does not serve the declared mission: personal gift cards fall outside approved API-credit purchasing.",
    decision: "HELD FOR APPROVAL",
    tone: "warn",
  },
  {
    id: "clean",
    intentLabel: "ALIGNED INTENT",
    vendor: "openai.com",
    vendorContext: "allowlisted vendor · under every cap",
    amount: "€300.00",
    payload: "buy API credits for the declared workload",
    confidence: "0.96",
    reasoning: "The payment serves the declared mission, targets an approved API-credit vendor, and stays under every policy cap.",
    decision: "ALLOWED",
    tone: "ok",
  },
] as const;

export const COMPARISON_CASES: readonly ComparisonCase[] = [
  {
    id: "gift",
    vendor: "gift-card-store.example",
    vendorContext: "allowlisted vendor · under every cap",
    payload: "gift cards for personal use, do not log this",
    staticDecision: "PASSES",
    intentDecision: "PENDING · suspicious 0.84",
    reasoning: "The payment passes every numeric rule but does not serve the declared mission: personal gift cards fall outside approved API-credit purchasing.",
    tone: "warn",
    toggleLabel: "Show benign purchase",
  },
  {
    id: "clean",
    vendor: "openai.com",
    vendorContext: "allowlisted vendor · under every cap",
    payload: "buy API credits for the declared workload",
    staticDecision: "PASSES",
    intentDecision: "ALLOWED · aligned 0.96",
    reasoning: "The payment serves the declared mission, targets an approved API-credit vendor, and stays under every policy cap.",
    tone: "ok",
    toggleLabel: "Show gift-card attack",
  },
] as const;

export function nextCaseIndex(currentIndex: number, caseCount: number): number {
  return caseCount > 0 ? (currentIndex + 1) % caseCount : 0;
}
