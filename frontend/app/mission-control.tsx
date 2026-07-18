"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL, DEMO_LINKS } from "./api-config";
import { AgentGuardMark } from "./agentguard-mark";
import { actionStatusTitle, buildHourlySeries, displayIntentModel, sparklinePoints } from "./dashboard-utils";
import { GUIDED_TOUR_STEPS, requestScenarioStep, type GuidedTourTone, type ScenarioStepResult } from "./guided-demo";
import { useCountUp } from "./motion-values";

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
type LedgerVerification = {
  valid: boolean;
  entries_checked: number;
  first_broken_seq: number | null;
  reason: string | null;
};
type TamperResponse = {
  tampered_seq?: number;
  restored_seq?: number | null;
  already_tampered?: boolean;
  already_restored?: boolean;
  verification: LedgerVerification;
  detail?: string;
};
type GuidedTourHighlight = {
  kind: "agent" | "action" | "approval" | "evidence" | "tamper";
  tone: GuidedTourTone;
  actionId?: number;
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

type MissionControlProps = {
  initialDemoOpen?: boolean;
};


export default function MissionControl({ initialDemoOpen = false }: MissionControlProps) {
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
  const [guidedTourOpen, setGuidedTourOpen] = useState(initialDemoOpen);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourComplete, setTourComplete] = useState(false);
  const [tourBusy, setTourBusy] = useState(false);
  const [tourError, setTourError] = useState<string | null>(null);
  const [tourHighlight, setTourHighlight] = useState<GuidedTourHighlight | null>(null);
  const [tamperVerification, setTamperVerification] = useState<LedgerVerification | null>(null);
  const [tamperBusy, setTamperBusy] = useState<"tamper" | "restore" | null>(null);
  const [tamperError, setTamperError] = useState<string | null>(null);
  const [, setClockTick] = useState(0);
  const knownActionIds = useRef<Set<number> | null>(null);
  const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTourStarted = useRef(false);
  const lastScenarioActionId = useRef<number | null>(null);
  const tourSession = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const responses = await Promise.all([
        fetch(`${API_BASE_URL}/dashboard/summary`),
        fetch(`${API_BASE_URL}/actions?limit=50`),
        fetch(`${API_BASE_URL}/agents`),
        fetch(`${API_BASE_URL}/ledger/verify`),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error("Backend data request failed");
      const [nextSummary, nextActions, nextAgents, nextVerification] = await Promise.all([
        responses[0].json() as Promise<Summary>,
        responses[1].json() as Promise<Action[]>,
        responses[2].json() as Promise<Agent[]>,
        responses[3].json() as Promise<LedgerVerification>,
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
      setTamperVerification(nextVerification.valid ? null : nextVerification);
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

  const exitGuidedTour = useCallback(() => {
    tourSession.current += 1;
    setGuidedTourOpen(false);
    setTourBusy(false);
    setTourError(null);
    setTourHighlight(null);
  }, []);

  const focusTourTarget = useCallback((step: number, result: ScenarioStepResult) => {
    const metadata = GUIDED_TOUR_STEPS[step];
    let highlight: GuidedTourHighlight;
    let targetId: string;

    if (step === 0) {
      highlight = { kind: "agent", tone: metadata.tone };
      targetId = "tour-agent-procurement";
    } else if (step === 1) {
      const actionId = result.action?.id;
      if (actionId) lastScenarioActionId.current = actionId;
      highlight = { kind: "action", tone: metadata.tone, actionId };
      targetId = actionId ? `action-${actionId}` : "feed-panel";
    } else if (step === 2) {
      const actionId = lastScenarioActionId.current ?? undefined;
      highlight = { kind: "action", tone: metadata.tone, actionId };
      targetId = actionId ? `action-${actionId}` : "feed-panel";
    } else if (step === 3) {
      const actionId = result.action?.id;
      if (actionId) {
        lastScenarioActionId.current = actionId;
        setExpanded((current) => new Set(current).add(actionId));
      }
      highlight = { kind: "action", tone: metadata.tone, actionId };
      targetId = actionId ? `action-${actionId}` : "feed-panel";
    } else if (step === 4) {
      const actionId = result.action?.id;
      if (actionId) lastScenarioActionId.current = actionId;
      highlight = { kind: "approval", tone: metadata.tone, actionId };
      targetId = actionId ? `approval-${actionId}` : "approval-panel";
    } else {
      highlight = { kind: "evidence", tone: metadata.tone };
      targetId = "audit-panel";
    }

    setTourHighlight(highlight);
    setTimeout(() => {
      const target = document.getElementById(targetId) ?? document.getElementById("agents-panel");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, []);

  const executeGuidedTourStep = useCallback(async (step: number, sessionId = tourSession.current) => {
    setTourBusy(true);
    setTourError(null);
    if (step === 0) {
      lastScenarioActionId.current = null;
      setTourComplete(false);
      setTourHighlight(null);
    }

    try {
      const result = await requestScenarioStep(API_BASE_URL, step);
      await refresh();
      if (sessionId !== tourSession.current) return;
      setTourStepIndex(step);
      focusTourTarget(step, result);
    } catch (reason) {
      if (sessionId === tourSession.current) {
        setTourError(reason instanceof Error ? reason.message : "Scenario step failed");
      }
    } finally {
      if (sessionId === tourSession.current) setTourBusy(false);
    }
  }, [focusTourTarget, refresh]);

  const startGuidedTour = useCallback(() => {
    const sessionId = tourSession.current + 1;
    tourSession.current = sessionId;
    setGuidedTourOpen(true);
    setTourStepIndex(0);
    setTourComplete(false);
    setTourError(null);
    setTourHighlight(null);
    void executeGuidedTourStep(0, sessionId);
  }, [executeGuidedTourStep]);

  const advanceGuidedTour = useCallback(() => {
    if (tourBusy || tourError) return;
    if (tourStepIndex === GUIDED_TOUR_STEPS.length - 1) {
      setTourComplete(true);
      setTourHighlight(null);
      return;
    }
    void executeGuidedTourStep(tourStepIndex + 1);
  }, [executeGuidedTourStep, tourBusy, tourError, tourStepIndex]);

  const retryGuidedTourStep = useCallback(() => {
    void executeGuidedTourStep(tourStepIndex);
  }, [executeGuidedTourStep, tourStepIndex]);

  const focusTamperWidget = useCallback(() => {
    setGuidedTourOpen(false);
    setTourHighlight({ kind: "tamper", tone: "danger" });
    setTimeout(() => {
      document.getElementById("audit-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, []);

  useEffect(() => {
    if (initialDemoOpen && !initialTourStarted.current) {
      initialTourStarted.current = true;
      startGuidedTour();
    }
  }, [initialDemoOpen, startGuidedTour]);

  useEffect(() => {
    if (!guidedTourOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitGuidedTour();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [exitGuidedTour, guidedTourOpen]);

  const runTamperTest = async () => {
    setTamperBusy("tamper");
    setTamperError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/demo/tamper`, { method: "POST" });
      const result = await response.json() as TamperResponse;
      if (!response.ok) throw new Error(result.detail ?? `Tamper test failed with HTTP ${response.status}`);
      setTamperVerification(result.verification);
      await refresh();
    } catch (reason) {
      setTamperError(reason instanceof Error ? reason.message : "Tamper test failed");
    } finally {
      setTamperBusy(null);
    }
  };

  const restoreTamperTest = async () => {
    setTamperBusy("restore");
    setTamperError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/demo/tamper/restore`, { method: "POST" });
      const result = await response.json() as TamperResponse;
      if (!response.ok) throw new Error(result.detail ?? `Ledger restore failed with HTTP ${response.status}`);
      setTamperVerification(result.verification.valid ? null : result.verification);
      await refresh();
    } catch (reason) {
      setTamperError(reason instanceof Error ? reason.message : "Ledger restore failed");
    } finally {
      setTamperBusy(null);
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
  const chainBroken = summary?.ledger.valid === false || tamperVerification?.valid === false;
  const chainMessage = chainBroken
    ? `CHAIN BROKEN — first_broken_seq: ${tamperVerification?.first_broken_seq ?? "unknown"} — this is what tampering looks like`
    : summary ? "CHAIN VERIFIED" : "CHECKING CHAIN";
  const tourStep = GUIDED_TOUR_STEPS[tourStepIndex];

  return (
    <main className="console-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><AgentGuardMark className="agentguard-mark" /></span>
          <div><strong>AGENTGUARD</strong><span>MISSION CONTROL FOR AI AGENTS</span></div>
        </div>
        <div className="header-chips system-status-bar">
          <a className="console-about-link" href="/">← About</a>
          {summary?.demo && <span className="demo-mode-chip">PUBLIC DEMO · RESETS PERIODICALLY</span>}
          <span className="status-chip" key={`agents-${summary?.agents_online ?? "loading"}`}><i className="dot dot-ok" />{summary?.agents_online ?? "—"} AGENTS ONLINE</span>
          <span className="status-chip" key={`threats-${summary?.threats_blocked ?? "loading"}`}><i className="dot dot-danger" />{summary?.threats_blocked ?? "—"} THREATS BLOCKED</span>
          <span className="status-chip" key={`chain-${summary?.ledger.valid ?? "loading"}`}><i className={`dot ${summary?.ledger.valid ? "dot-ok" : "dot-danger"}`} />AUDIT CHAIN {summary ? (summary.ledger.valid ? "VALID" : "BROKEN") : "—"}</span>
          <span className={`live-chip ${pollingActive ? "is-live" : "is-paused"}`}>
            <i className="live-dot" /><strong>{pollingActive ? "LIVE" : "PAUSED"}</strong><small>{refreshAge === null ? "—" : `${refreshAge}s`}</small>
          </span>
        </div>
      </header>

      {summary?.demo && <section className="demo-intro" aria-label="Public demo overview">
        <div className="demo-intro-copy">
          <strong>The firewall for AI agents — it knows if your agent is still yours</strong>
          <span>A GPT-5.6 intent layer that catches hijacked agents static rules can&apos;t see. Watch it live below.</span>
        </div>
        <nav className="demo-links" aria-label="Demo resources">
          <button
            type="button"
            className="demo-attack-trigger"
            aria-expanded={guidedTourOpen}
            aria-controls="guided-tour-card"
            onClick={startGuidedTour}
          >RUN THE ATTACK DEMO</button>
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
        <section id="feed-panel" className="panel feed-panel">
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
                guidedTone={tourHighlight?.kind === "action" && tourHighlight.actionId === action.id ? tourHighlight.tone : undefined}
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
          <section id="approval-panel" className="panel approval-panel">
            <PanelHeading eyebrow="HUMAN-IN-THE-LOOP" title="Approval Queue" count={`${pendingActions.length} WAITING`} />
            {pendingActions.length ? pendingActions.map((action) => (
              <div
                id={`approval-${action.id}`}
                className={`approval-item ${tourHighlight?.kind === "approval" && tourHighlight.actionId === action.id ? `guided-focus guided-focus-${tourHighlight.tone}` : ""}`}
                key={action.id}
              >
                <div className="approval-title"><strong>{actionLabel(action)}</strong><span>{formatMoney(action.amount)}</span></div>
                <p>{action.counterparty}</p>
                <small>Action #{action.id} · {timeAgo(action.created_at)}</small>
                {tourHighlight?.kind === "approval" && tourHighlight.actionId === action.id && <span className="guided-approval-hint">now approve or reject it yourself →</span>}
                <div className="approval-actions">
                  <button className="approve-button" disabled={busy.has(action.id)} onClick={() => void transition(action.id, "approve")}>APPROVE</button>
                  <button className="reject-button" disabled={busy.has(action.id)} onClick={() => void transition(action.id, "reject")}>REJECT</button>
                </div>
              </div>
            )) : <EmptyState label="No actions waiting for approval" />}
          </section>

          <section
            id="agents-panel"
            className={`panel agents-panel ${tourHighlight?.kind === "agent" ? `guided-focus guided-focus-${tourHighlight.tone}` : ""} ${tourHighlight?.kind === "evidence" ? `guided-focus guided-focus-${tourHighlight.tone}` : ""}`}
          >
            <PanelHeading eyebrow="RISK TELEMETRY" title="Agents" count={`${agents.length} REGISTERED`} />
            {agents.map((agent) => <AgentRisk key={agent.id} agent={agent} guidedTone={tourHighlight?.kind === "agent" && agent.name === "procurement-bot" ? tourHighlight.tone : undefined} />)}
          </section>

          <section
            id="audit-panel"
            className={`panel audit-panel ${chainBroken ? "audit-panel-danger" : ""} ${tourHighlight?.kind === "evidence" || tourHighlight?.kind === "tamper" ? `guided-focus guided-focus-${tourHighlight.tone}` : ""}`}
          >
            <PanelHeading eyebrow="INTEGRITY MONITOR" title="Audit Chain" count={summary ? `${summary.ledger.entries} ENTRIES` : "—"} />
            <div className="chain-status">
              <span className={`chain-icon ${chainBroken ? "invalid" : "valid"}`}>{chainBroken ? "!" : "OK"}</span>
              <div><strong>{chainMessage}</strong><p>SHA-256 hash-linked event history</p></div>
            </div>
            <div className="audit-actions">
              <button className="verify-button" onClick={() => void refresh()}>VERIFY NOW <span>↗</span></button>
              {summary?.demo && !chainBroken && <button className="tamper-button" disabled={tamperBusy !== null} onClick={() => void runTamperTest()}>TAMPER TEST</button>}
              {summary?.demo && chainBroken && <button className="restore-button" disabled={tamperBusy !== null} onClick={() => void restoreTamperTest()}>RESTORE</button>}
            </div>
            {summary?.demo && <p className="tamper-caption">Corrupts a real entry in the demo DB via SQL. The chain catches it. Try it.</p>}
            {tamperError && <p className="tamper-error" role="alert">{tamperError}</p>}
          </section>
        </aside>
      </div>

      {actions.some((action) => action.intent_verdict?.verdict === "hijack_suspected") && <div className="threat-footnote">Threat response active: hijack verdict remains blocked pending investigation.</div>}

      {guidedTourOpen && <>
        <div className="guided-tour-scrim" aria-hidden="true" />
        <aside
          id="guided-tour-card"
          className={`guided-tour-card guided-tour-${tourComplete ? "complete" : tourStep.tone}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-tour-title"
          aria-live="polite"
        >
          {!tourComplete ? <>
            <span className="guided-tour-counter">STEP {tourStepIndex + 1} / 6</span>
            <h2 id="guided-tour-title">{tourStep.title}</h2>
            <p>{tourStep.narration}</p>
            {tourBusy && <div className="guided-tour-progress">STAGING SCENARIO STEP {tourStep.scenarioStep}…</div>}
            {tourError && <div className="guided-tour-error" role="alert">
              <span>{tourError}</span>
              <button type="button" onClick={retryGuidedTourStep}>RETRY STEP</button>
            </div>}
            <div className="guided-tour-actions">
              {!tourError && <button type="button" className="guided-tour-next" disabled={tourBusy} onClick={advanceGuidedTour}>NEXT →</button>}
              <button type="button" className="guided-tour-exit" onClick={exitGuidedTour}>EXIT TOUR</button>
            </div>
          </> : <>
            <span className="guided-tour-counter">6 / 6 COMPLETE</span>
            <h2 id="guided-tour-title">TOUR COMPLETE — now break something yourself</h2>
            <p>The scenario stays on screen. Test the real ledger integrity control or replay the six-step incident.</p>
            <div className="guided-tour-actions guided-tour-complete-actions">
              <button type="button" className="guided-tour-tamper" onClick={focusTamperWidget}>TAMPER THE LEDGER</button>
              <button type="button" className="guided-tour-restart" onClick={startGuidedTour}>RESTART TOUR</button>
            </div>
          </>}
        </aside>
      </>}
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
  const { value: animatedValue, revision } = useCountUp(value);
  const glow = tone === "danger" && (value ?? 0) > 0;
  return (
    <article className={`kpi-card tone-${tone} ${glow ? "has-danger" : ""}`}>
      <span>{label}</span>
      <div className="kpi-reading"><strong className="kpi-value" key={revision}>{animatedValue === null ? "—" : format(animatedValue)}</strong><Sparkline values={series} tone={tone} /></div>
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

function ActionRow({ action, expanded, busy, index, isNew, guidedTone, onToggle, onTransition }: {
  action: Action;
  expanded: boolean;
  busy: boolean;
  index: number;
  isNew: boolean;
  guidedTone?: GuidedTourTone;
  onToggle: () => void;
  onTransition: (id: number, verb: "approve" | "reject") => Promise<void>;
}) {
  const verdict = action.intent_verdict;
  const hijack = verdict?.verdict === "hijack_suspected";
  const rowStyle = { "--row-delay": `${Math.min(index, 12) * 35}ms` } as CSSProperties;
  return (
    <article
      id={`action-${action.id}`}
      className={`action-row status-${action.status} ${hijack ? "hijack-row" : ""} ${isNew ? "new-row" : "feed-entry"} ${guidedTone ? `guided-focus guided-focus-${guidedTone}` : ""}`}
      style={rowStyle}
    >
      <button className="action-summary" onClick={onToggle} aria-expanded={expanded}>
        <span className="status-pip" />
        <span className="action-main"><strong>{actionLabel(action)}</strong><small>{action.counterparty} · agent #{action.agent_id}</small></span>
        <span className="action-amount">{formatMoney(action.amount)}</span>
        <span className="action-status" title={actionStatusTitle(action.status)}>{action.status.replaceAll("_", " ")}</span>
        <span className="chevron">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && <div className="action-detail">
        {hijack && verdict && <div className="hijack-alert">
          <div className="threat-heading">
            <div className="threat-label"><span>HIJACK SUSPECTED</span><b className="model-chip">{displayIntentModel(verdict.model ?? action.intent_model)}</b></div>
            <div className="confidence-stat"><small>CONFIDENCE</small><strong>{verdict.confidence.toFixed(2)}</strong></div>
          </div>
          <blockquote>{verdict.reasoning}</blockquote>
          <p className="mission-quote"><span>DECLARED MISSION</span>“{action.mission_text ?? "No active mission"}”</p>
        </div>}
        <div className="detail-grid">
          <div><span>POLICY REASONS</span><p>{action.reasons.length ? action.reasons.join(" · ") : "No policy exceptions"}</p></div>
          {!hijack && <div><span>MISSION</span><p>{action.mission_text ?? "No active mission"}</p></div>}
          <div><span>INTENT VERDICT</span><p>{verdict ? `${verdict.verdict} · ${displayIntentModel(verdict.model ?? action.intent_model)}` : "unavailable"}</p></div>
          <div><span>TIME</span><p className="data-value">{timeAgo(action.created_at)} · {action.created_at} UTC</p></div>
        </div>
        {action.status === "pending_approval" && <div className="inline-actions">
          <button className="approve-button" disabled={busy} onClick={() => void onTransition(action.id, "approve")}>APPROVE</button>
          <button className="reject-button" disabled={busy} onClick={() => void onTransition(action.id, "reject")}>REJECT</button>
        </div>}
      </div>}
    </article>
  );
}

function AgentRisk({ agent, guidedTone }: { agent: Agent; guidedTone?: GuidedTourTone }) {
  const tone = agent.risk_score >= 70 ? "high" : agent.risk_score >= 35 ? "medium" : "low";
  const riskStyle = { "--risk-width": `${agent.risk_score}%` } as CSSProperties;
  return (
    <div
      id={agent.name === "procurement-bot" ? "tour-agent-procurement" : undefined}
      className={`agent-risk ${guidedTone ? `guided-focus guided-focus-${guidedTone}` : ""}`}
      tabIndex={0}
    >
      <div className="agent-risk-head"><div><strong>{agent.name}</strong><small>{agent.declared_mission}</small></div><b className={`risk-${tone}`}>{agent.risk_score}</b></div>
      <div className="risk-track"><i className="risk-tick risk-tick-low" /><i className="risk-tick risk-tick-high" /><span className={`risk-fill risk-fill-${tone}`} style={riskStyle} /></div>
      <span className="risk-label">{tone.toUpperCase()} RISK</span>
    </div>
  );
}
