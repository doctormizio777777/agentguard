export type SparklineMetric = "actions" | "spend" | "pending" | "blocked";
export type ActionStatus = "allowed" | "pending_approval" | "blocked";

export type HourlyAction = {
  created_at: string;
  status: "allowed" | "pending_approval" | "blocked";
  action_type: string;
  amount: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const BUCKET_COUNT = 12;

const STATUS_TITLES: Record<ActionStatus, string> = {
  allowed: "passed policy floor and intent firewall",
  pending_approval: "waiting for human approval",
  blocked: "stopped by policy floor or intent firewall",
};

export function actionStatusTitle(status: ActionStatus): string {
  return STATUS_TITLES[status];
}

export function displayIntentModel(model: string | null | undefined): string {
  if (model === "seed-canned-verdict") return "gpt-5.6 (seeded demo verdict)";
  return model || "model unavailable";
}

function utcTimestamp(value: string): number {
  const isoValue = value.includes("T") ? value : value.replace(" ", "T");
  const zonedValue = /(?:Z|[+-]\d{2}:\d{2})$/.test(isoValue) ? isoValue : `${isoValue}Z`;
  return Date.parse(zonedValue);
}

function metricValue(action: HourlyAction, metric: SparklineMetric): number {
  if (metric === "actions") return 1;
  if (metric === "pending") return action.status === "pending_approval" ? 1 : 0;
  if (metric === "blocked") return action.status === "blocked" ? 1 : 0;
  if (action.status !== "allowed" || action.action_type !== "payment" || action.amount === null) return 0;
  const amountCents = Math.round(Number(action.amount) * 100);
  return Number.isFinite(amountCents) ? amountCents : 0;
}

export function buildHourlySeries(
  actions: HourlyAction[],
  metric: SparklineMetric,
  nowMs: number = Date.now(),
): number[] {
  const series = Array<number>(BUCKET_COUNT).fill(0);
  const currentHour = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const firstHour = currentHour - (BUCKET_COUNT - 1) * HOUR_MS;

  for (const action of actions) {
    const actionTime = utcTimestamp(action.created_at);
    if (!Number.isFinite(actionTime)) continue;
    const bucket = Math.floor((actionTime - firstHour) / HOUR_MS);
    if (bucket < 0 || bucket >= BUCKET_COUNT) continue;
    series[bucket] += metricValue(action, metric);
  }
  return series;
}

export function sparklinePoints(
  values: number[],
  width: number = 96,
  height: number = 24,
  padding: number = 2,
): string {
  if (values.length === 0) return "";
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : padding + (index / (values.length - 1)) * drawableWidth;
      const y = range === 0 ? height / 2 : padding + ((maximum - value) / range) * drawableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

