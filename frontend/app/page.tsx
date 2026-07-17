"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL, DEMO_LINKS } from "./api-config";
import { buildHourlySeries, sparklinePoints } from "./dashboard-utils";

type IntentVerdict = {
  verdict: "aligned" | "suspicious" | "hijack_suspected";
  confidence: number;
  reasoning: string;
  model?: string;
};

type Action = {
  id: number;
  agent_id: number;
  action_type: string;
  amount: string | null;
  currency: string;
  counterparty: string;
  payload: Record<string, unknown>;
  status: "allowed" | "pending_approval" | "blocked";
  policy_reason: string;
  reasons: string[];
  created_at: string;
  mission_text: string | null;
  intent_verdict: IntentVerdict | null;
  intent_model: string | null;
  intent_error: string | null;
};

type Agent = { id: number; name: string; declared_mission: string; risk_score: number };
type Summary = {
  actions_today: number;
  spend_today_cents: number;
  pending_count: number;
  blocked_count: number;
  agents_online: number;
  threats_blocked: number;
  ledger: { entries: number; valid: boolean };
  demo?: boolean;
};

function formatMoney(value: number | string | null): string {
  if (value === null) return "—";
  const euros = typeof value === "string" ? Number(value) : value / 100;
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(euros);
}

function timestamp(value: string): number {
  const isoValue = value.includes("T") ? value : value.replace(" ", "T");
  return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(isoValue) ? isoValue : `${isoValue}Z`);
}

function timeAgo(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function actionLabel(action: Action): string {
  return action.action_type.replaceAll("_", " ");
}

function useInitialCountUp(target: number | null): number | null {
  const [displayValue, setDisplayValue] = useState<number | null>(target);
  const animated = useRef(false);

  useEffect(() => {
    if (target === null) return;
    if (animated.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animated.current = true;
      setDisplayValue(target);
      return;
    }
    animated.current = true;
    const duration = 700;
    const startedAt = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return displayValue;
}

export default function Home() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [recentActionIds, setRecentActionIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingActive, setPollingActive] = useState(true);
  const [, setClockTick] = useState(0);
  const knownActionIds = useRef<Set<number> | null>(null);
  const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const responses = await Promise.all([
        fetch(`${API_BASE_URL}/dashboard/summary`),
        fetch(`${API_BASE_URL}/actions?limit=50`),
        fetch(`${API_BASE_URL}/agents`),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error("Backend data request failed");
      const [nextSummary, nextActions, nextAgents] = await Promise.all([
        responses[0].json() as Promise<Summary>,
        responses[1].json() as Promise<Action[]>,
        responses[2].json() as Promise<Agent[]>,
      ]);

      if (knownActionIds.current !== null) {
        const newIds = nextActions
          .filter((action) => !knownActionIds.current?.has(action.id))
          .map((action) => action.id);
        if (newIds.length > 0) {
          setRecentActionIds(new Set(newIds));
          if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
          highlightTimeout.current = setTimeout(() => setRecentActionIds(new Set()), 1800);
        }
      }
      knownActionIds.current = new Set(nextActions.map((action) => action.id));
      setSummary(nextSummary);
      setActions(nextActions);
      setAgents(nextAgents);
      setExpanded((current) => {
        const next = new Set(current);
        nextActions.forEach((action) => {
          if (action.status === "blocked" && action.intent_verdict?.verdict === "hijack_suspected") next.add(action.id);
        });
        return next;
      });
      setError(null);
      setLastRefresh(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reach backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    let interval: ReturnType<typeof setInterval> | undefined;
    const syncPolling = () => {
      const visible = document.visibilityState === "visible";
      setPollingActive(visible);
      if (visible && !interval) interval = setInterval(() => void refresh(), 3000);
      if (!visible && interval) {
        clearInterval(interval);
        interval = undefined;
      }
    };
    document.addEventListener("visibilitychange", syncPolling);
    syncPolling();
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", syncPolling);
    };
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
  }, []);

  const transition = async (id: number, verb: "approve" | "reject") => {
    setBusy((current) => new Set(current).add(id));
    try {
      const response = await fetch(`${API_BASE_URL}/actions/${id}/${verb}`, { method: "POST" });
      if (!response.ok) throw new Error(`Action update failed with HTTP ${response.status}`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action update failed");
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const pendingActions = useMemo(() => actions.filter((action) => action.status === "pending_approval"), [actions]);
  const series = useMemo(() => ({
    actions: buildHourlySeries(actions, "actions"),
    spend: buildHourlySeries(actions, "spend"),
    pending: buildHourlySeries(actions, "pending"),
    blocked: buildHourlySeries(actions, "blocked"),
  }), [actions]);
  const refreshAge = lastRefresh ? Math.max(0, Math.floor((Date.now() - lastRefresh.getTime()) / 1000)) : null;

  return (
    <main className="console-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">AG</span>
          <div><strong>AGENTGUARD</strong><span>MISSION CONTROL FOR AI AGENTS</span></div>
        </div>
        <div className="header-chips">
          {summary?.demo && <span className="demo-mode-chip">PUBLIC DEMO · RESETS PERIODICALLY</span>}
          <span className="status-chip"><i className="dot dot-ok" />{summary?.agents_online ?? "—"} AGENTS ONLINE</span>
          <span className="status-chip"><i className="dot dot-danger" />{summary?.threats_blocked ?? "—"} THREATS BLOCKED</span>
          <span className="status-chip"><i className={`dot ${summary?.ledger.valid ? "dot-ok" : "dot-danger"}`} />AUDIT CHAIN {summary ? (summary.ledger.valid ? "VALID" : "BROKEN") : "—"}</span>
          <span className={`live-chip ${pollingActive ? "is-live" : "is-paused"}`}>
            <i className="live-dot" /><strong>{pollingActive ? "LIVE" : "PAUSED"}</strong><small>{refreshAge === null ? "—" : `${refreshAge}s`}</small>
          </span>
        </div>
      </header>

      {summary?.demo && <section className="demo-intro" aria-label="Public demo overview">
        <div className="demo-intro-copy">
          <strong>The intelligent firewall for AI agents — it knows if your agent is still yours</strong>
          <span>A GPT-5.6 intent layer that catches hijacked agents static rules can&apos;t see. Watch it live below.</span>
        </div>
        <nav className="demo-links" aria-label="Demo resources">
          {DEMO_LINKS.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>)}
        </nav>
      </section>}

      <section className="hero-strip">
        <div><span className="eyebrow">CONTROL ROOM / LIVE</span><h1>Mission Control</h1></div>
        <span className="model-badge">intent firewall: gpt-5.6</span>
      </section>

      {error && <div className="error-banner" role="alert"><strong>BACKEND CONNECTION ERROR</strong><span>{error}</span><button onClick={() => void refresh()}>RETRY</button></div>}

      <section className="kpi-grid">
        <Kpi label="ACTIONS TODAY" value={summary?.actions_today ?? null} detail="all evaluations" series={series.actions} />
        <Kpi label="SPEND TODAY" value={summary?.spend_today_cents ?? null} detail="allowed payments" series={series.spend} format={formatMoney} />
        <Kpi label="PENDING APPROVAL" value={summary?.pending_count ?? null} detail="human decision required" tone="warn" series={series.pending} />
        <Kpi label="BLOCKED" value={summary?.blocked_count ?? null} detail="policy or intent firewall" tone="danger" series={series.blocked} />
      </section>

      <div className="workspace-grid">
        <section className="panel feed-panel">
          <PanelHeading eyebrow="STREAM / REAL-TIME" title="Live Action Feed" count={`${actions.length} EVENTS`} />
          <div className="feed-list">
            {loading && !actions.length ? <SkeletonRows /> : actions.map((action, index) => (
              <ActionRow
                key={action.id}
                action={action}
                expanded={expanded.has(action.id)}
                busy={busy.has(action.id)}
                index={index}
                isNew={recentActionIds.has(action.id)}
                onToggle={() => setExpanded((current) => {
                  const next = new Set(current);
                  next.has(action.id) ? next.delete(action.id) : next.add(action.id);
                  return next;
                })}
                onTransition={transition}
              />
            ))}
          </div>
        </section>

        <aside className="side-column">
          <section className="panel approval-panel">
            <PanelHeading eyebrow="HUMAN-IN-THE-LOOP" title="Approval Queue" count={`${pendingActions.length} WAITING`} />
            {pendingActions.length ? pendingActions.map((action) => (
              <div className="approval-item" key={action.id}>
                <div className="approval-title"><strong>{actionLabel(action)}</strong><span>{formatMoney(action.amount)}</span></div>
                <p>{action.counterparty}</p>
                <small>Action #{action.id} · {timeAgo(action.created_at)}</small>
                <div className="approval-actions">
                  <button className="approve-button" disabled={busy.has(action.id)} onClick={() => void transition(action.id, "approve")}>APPROVE</button>
                  <button className="reject-button" disabled={busy.has(action.id)} onClick={() => void transition(action.id, "reject")}>REJECT</button>
                </div>
              </div>
            )) : <EmptyState label="No actions waiting for approval" />}
          </section>

          <section className="panel agents-panel">
            <PanelHeading eyebrow="RISK TELEMETRY" title="Agents" count={`${agents.length} REGISTERED`} />
            {agents.map((agent) => <AgentRisk key={agent.id} agent={agent} />)}
          </section>

          <section className="panel audit-panel">
            <PanelHeading eyebrow="INTEGRITY MONITOR" title="Audit Chain" count={summary ? `${summary.ledger.entries} ENTRIES` : "—"} />
            <div className="chain-status">
              <span className={`chain-icon ${summary?.ledger.valid ? "valid" : "invalid"}`}>{summary?.ledger.valid ? "OK" : "!"}</span>
              <div><strong>{summary ? (summary.ledger.valid ? "CHAIN VERIFIED" : "CHAIN BROKEN") : "CHECKING CHAIN"}</strong><p>SHA-256 hash-linked event history</p></div>
            </div>
            <button className="verify-button" onClick={() => void refresh()}>VERIFY NOW <span>↗</span></button>
          </section>
        </aside>
      </div>

      {actions.some((action) => action.intent_verdict?.verdict === "hijack_suspected") && <div className="threat-footnote">Threat response active: hijack verdict remains blocked pending investigation.</div>}
    </main>
  );
}

function Kpi({ label, value, detail, series, tone = "default", format = (current) => String(Math.round(current)) }: {
  label: string;
  value: number | null;
  detail: string;
  series: number[];
  tone?: "default" | "warn" | "danger";
  format?: (value: number) => string;
}) {
  const animatedValue = useInitialCountUp(value);
  const glow = tone === "danger" && (value ?? 0) > 0;
  return (
    <article className={`kpi-card tone-${tone} ${glow ? "has-danger" : ""}`}>
      <span>{label}</span>
      <div className="kpi-reading"><strong>{animatedValue === null ? "—" : format(animatedValue)}</strong><Sparkline values={series} tone={tone} /></div>
      <small>{detail}</small>
    </article>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: "default" | "warn" | "danger" }) {
  return (
    <svg className={`sparkline sparkline-${tone}`} viewBox="0 0 96 24" role="img" aria-label="Last 12 hours trend">
      <path className="sparkline-baseline" d="M2 22H94" />
      <polyline points={sparklinePoints(values)} />
    </svg>
  );
}

function PanelHeading({ eyebrow, title, count }: { eyebrow: string; title: string; count: string }) {
  return <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="panel-count">{count}</span></div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function SkeletonRows() {
  return <>{[1, 2, 3].map((item) => <div className="skeleton-row" key={item}><span /><span /><span /></div>)}</>;
}

function ActionRow({ action, expanded, busy, index, isNew, onToggle, onTransition }: {
  action: Action;
  expanded: boolean;
  busy: boolean;
  index: number;
  isNew: boolean;
  onToggle: () => void;
  onTransition: (id: number, verb: "approve" | "reject") => Promise<void>;
}) {
  const verdict = action.intent_verdict;
  const hijack = verdict?.verdict === "hijack_suspected";
  const rowStyle = { "--row-delay": `${Math.min(index, 12) * 35}ms` } as CSSProperties;
  return (
    <article className={`action-row status-${action.status} ${hijack ? "hijack-row" : ""} ${isNew ? "new-row" : "feed-entry"}`} style={rowStyle}>
      <button className="action-summary" onClick={onToggle} aria-expanded={expanded}>
        <span className="status-pip" />
        <span className="action-main"><strong>{actionLabel(action)}</strong><small>{action.counterparty} · agent #{action.agent_id}</small></span>
        <span className="action-amount">{formatMoney(action.amount)}</span>
        <span className="action-status">{action.status.replaceAll("_", " ")}</span>
        <span className="chevron">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && <div className="action-detail">
        {hijack && verdict && <div className="hijack-alert">
          <div className="threat-heading">
            <div className="threat-label"><span>HIJACK SUSPECTED</span><b className="model-chip">gpt-5.6-sol</b></div>
            <div className="confidence-stat"><small>CONFIDENCE</small><strong>{verdict.confidence.toFixed(2)}</strong></div>
          </div>
          <blockquote>{verdict.reasoning}</blockquote>
          <p className="mission-quote"><span>DECLARED MISSION</span>“{action.mission_text ?? "No active mission"}”</p>
        </div>}
        <div className="detail-grid">
          <div><span>POLICY REASONS</span><p>{action.reasons.length ? action.reasons.join(" · ") : "No policy exceptions"}</p></div>
          {!hijack && <div><span>MISSION</span><p>{action.mission_text ?? "No active mission"}</p></div>}
          <div><span>INTENT VERDICT</span><p>{verdict ? `${verdict.verdict} · ${verdict.model ?? action.intent_model ?? "model unavailable"}` : "unavailable"}</p></div>
          <div><span>TIME</span><p>{timeAgo(action.created_at)} · {action.created_at} UTC</p></div>
        </div>
        {action.status === "pending_approval" && <div className="inline-actions">
          <button className="approve-button" disabled={busy} onClick={() => void onTransition(action.id, "approve")}>APPROVE</button>
          <button className="reject-button" disabled={busy} onClick={() => void onTransition(action.id, "reject")}>REJECT</button>
        </div>}
      </div>}
    </article>
  );
}

function AgentRisk({ agent }: { agent: Agent }) {
  const tone = agent.risk_score >= 70 ? "high" : agent.risk_score >= 35 ? "medium" : "low";
  const riskStyle = { "--risk-width": `${agent.risk_score}%` } as CSSProperties;
  return (
    <div className="agent-risk">
      <div className="agent-risk-head"><div><strong>{agent.name}</strong><small>{agent.declared_mission}</small></div><b className={`risk-${tone}`}>{agent.risk_score}</b></div>
      <div className="risk-track"><i className="risk-tick risk-tick-low" /><i className="risk-tick risk-tick-high" /><span className={`risk-fill risk-fill-${tone}`} style={riskStyle} /></div>
      <span className="risk-label">{tone.toUpperCase()} RISK</span>
    </div>
  );
}
