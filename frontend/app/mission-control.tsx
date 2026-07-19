"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL, DEMO_LINKS } from "./api-config";
import { AgentGuardMark } from "./agentguard-mark";
import { actionStatusTitle, buildHourlySeries, displayIntentModel, sparklinePoints } from "./dashboard-utils";
import { GUIDED_TOUR_STEPS, requestScenarioStep, type GuidedTourTone, type ScenarioStepResult } from "./guided-demo";
import {
  DEFAULT_LIVE_SCENARIO_ID,
  LIVE_INTENT_PROGRESS,
  LIVE_SCENARIOS,
  requestLiveIntent,
  truncateResponseId,
  type LiveIntentResult,
  type LiveScenarioId,
} from "./live-intent";
import { useCountUp } from "./motion-values";

type IntentVerdict = {
  verdict: "aligned" | "suspicious" | "hijack_suspected";
  confidence: number;
  reasoning: string;
  model?: string;
  response_id?: string;
  evaluated_at?: string;
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
type GuidedTourSpotlightTone = GuidedTourTone | "ok";
type GuidedTourHighlight = {
  kind: "agent" | "action" | "approval" | "evidence" | "tamper";
  tone: GuidedTourSpotlightTone;
  actionId?: number;
};

const TOUR_SPOTLIGHT_TONES = ["info", "ok", "warn", "danger", "warn", "info"] as const;

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

function isLiveRun(action: Action): boolean {
  const metadata = action.payload.metadata;
  return typeof metadata === "object" && metadata !== null && (metadata as { live_run?: unknown }).live_run === true;
}

function progressPause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const [initialTourWarming, setInitialTourWarming] = useState(initialDemoOpen);
  const [tourClosing, setTourClosing] = useState(false);
  const [tourHighlight, setTourHighlight] = useState<GuidedTourHighlight | null>(null);
  const [tamperVerification, setTamperVerification] = useState<LedgerVerification | null>(null);
  const [tamperBusy, setTamperBusy] = useState<"tamper" | "restore" | null>(null);
  const [tamperError, setTamperError] = useState<string | null>(null);
  const [liveScenarioId, setLiveScenarioId] = useState<LiveScenarioId>(DEFAULT_LIVE_SCENARIO_ID);
  const [liveProgressIndex, setLiveProgressIndex] = useState<number | null>(null);
  const [liveIntentResult, setLiveIntentResult] = useState<LiveIntentResult | null>(null);
  const [liveIntentError, setLiveIntentError] = useState<string | null>(null);
  const [, setClockTick] = useState(0);
  const knownActionIds = useRef<Set<number> | null>(null);
  const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tourCloseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (tourCloseTimeout.current) clearTimeout(tourCloseTimeout.current);
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
    initialTourStarted.current = true;
    setTourBusy(false);
    setTourError(null);
    setTourClosing(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (tourCloseTimeout.current) clearTimeout(tourCloseTimeout.current);
    tourCloseTimeout.current = setTimeout(() => {
      setGuidedTourOpen(false);
      setTourHighlight(null);
      setTourClosing(false);
    }, reducedMotion ? 0 : 250);
  }, []);

  const focusTourTarget = useCallback((step: number, result: ScenarioStepResult) => {
    const tone = TOUR_SPOTLIGHT_TONES[step];
    let highlight: GuidedTourHighlight;
    let targetId: string;

    if (step === 0) {
      highlight = { kind: "agent", tone };
      targetId = "tour-agent-procurement";
    } else if (step === 1) {
      const actionId = result.action?.id;
      if (actionId) lastScenarioActionId.current = actionId;
      highlight = { kind: "action", tone, actionId };
      targetId = actionId ? `action-${actionId}` : "feed-panel";
    } else if (step === 2) {
      const actionId = lastScenarioActionId.current ?? undefined;
      highlight = { kind: "action", tone, actionId };
      targetId = actionId ? `action-${actionId}` : "feed-panel";
    } else if (step === 3) {
      const actionId = result.action?.id;
      if (actionId) {
        lastScenarioActionId.current = actionId;
        setExpanded((current) => new Set(current).add(actionId));
      }
      highlight = { kind: "action", tone, actionId };
      targetId = actionId ? `action-${actionId}-hijack` : "feed-panel";
    } else if (step === 4) {
      const actionId = result.action?.id;
      if (actionId) lastScenarioActionId.current = actionId;
      highlight = { kind: "approval", tone, actionId };
      targetId = actionId ? `approval-${actionId}` : "approval-panel";
    } else {
      highlight = { kind: "evidence", tone };
      targetId = "audit-panel";
    }

    setTourHighlight(highlight);
    setTimeout(() => {
      const target = document.getElementById(targetId) ?? document.getElementById("agents-panel");
      if (!target) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView(reducedMotion
        ? { behavior: "auto", block: "center" }
        : { behavior: "smooth", block: "center" });
      setTimeout(() => {
        const card = document.getElementById("guided-tour-card");
        if (!card) return;
        const targetRect = target.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const overlap = targetRect.bottom + 18 - cardRect.top;
        if (overlap > 0) {
          window.scrollBy({ top: overlap, behavior: reducedMotion ? "auto" : "smooth" });
        }
      }, reducedMotion ? 0 : 420);
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
    if (tourCloseTimeout.current) clearTimeout(tourCloseTimeout.current);
    setGuidedTourOpen(true);
    setInitialTourWarming(false);
    setTourClosing(false);
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
    setTourHighlight({ kind: "tamper", tone: "warn" });
    setTimeout(() => {
      document.getElementById("audit-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, []);

  useEffect(() => {
    if (initialDemoOpen && summary !== null && !initialTourStarted.current) {
      initialTourStarted.current = true;
      startGuidedTour();
    }
  }, [initialDemoOpen, startGuidedTour, summary]);

  useEffect(() => {
    if (!guidedTourOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitGuidedTour();
      const target = event.target as HTMLElement | null;
      const interactiveTarget = target?.closest("button,a,input,textarea,select");
      if (event.key === "Enter" && !event.repeat && !interactiveTarget && !initialTourWarming && !tourComplete) {
        event.preventDefault();
        advanceGuidedTour();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [advanceGuidedTour, exitGuidedTour, guidedTourOpen, initialTourWarming, tourComplete]);

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

  const runLiveIntent = async () => {
    setLiveIntentError(null);
    setLiveIntentResult(null);
    try {
      setLiveProgressIndex(0);
      await progressPause(120);
      setLiveProgressIndex(1);
      const result = await requestLiveIntent(API_BASE_URL, liveScenarioId);
      setLiveProgressIndex(2);
      await progressPause(120);
      setLiveProgressIndex(3);
      setLiveIntentResult(result);
      await refresh();
      setExpanded((current) => new Set(current).add(result.action_id));
    } catch (reason) {
      setLiveIntentError(reason instanceof Error ? reason.message : "Live intent check failed");
    } finally {
      setLiveProgressIndex(null);
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
          <span className="live-intent-launcher">
            <select
              aria-label="Live intent scenario"
              disabled={liveProgressIndex !== null}
              value={liveScenarioId}
              onChange={(event) => setLiveScenarioId(event.target.value as LiveScenarioId)}
            >
              {LIVE_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
            </select>
            <button
              type="button"
              className="live-intent-trigger"
              disabled={liveProgressIndex !== null}
              onClick={() => void runLiveIntent()}
            >RUN LIVE GPT-5.6 CHECK</button>
          </span>
          {DEMO_LINKS.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>)}
        </nav>
      </section>}

      {summary?.demo && (liveProgressIndex !== null || liveIntentResult !== null || liveIntentError !== null) && <LiveIntentPanel
        error={liveIntentError}
        progressIndex={liveProgressIndex}
        result={liveIntentResult}
        onRetry={() => void runLiveIntent()}
      />}

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
            className={`panel audit-panel ${chainBroken ? "audit-panel-danger" : ""} ${tourHighlight?.kind === "evidence" || tourHighlight?.kind === "tamper" ? `guided-focus guided-focus-${tourHighlight.tone}` : ""} ${tourHighlight?.kind === "tamper" ? "guided-tamper-pulse" : ""}`}
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
        <div className={`guided-tour-scrim ${tourClosing ? "is-exiting" : ""}`} aria-hidden="true" />
        <aside
          id="guided-tour-card"
          className={`guided-tour-card ${tourClosing ? "is-exiting" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-tour-title"
          aria-live="polite"
        >
          <div className="guided-tour-meta">
            {initialTourWarming
              ? <span className="guided-tour-counter">GUIDED TOUR / LIVE SYSTEM</span>
              : tourComplete
                ? <span className="guided-tour-counter">TOUR COMPLETE</span>
                : <span className="guided-tour-counter">STEP {tourStepIndex + 1} / 6</span>}
            <button type="button" className="guided-tour-exit" onClick={exitGuidedTour}>EXIT TOUR</button>
          </div>
          {initialTourWarming && summary === null ? <>
            <h2 id="guided-tour-title">warming up the live system…</h2>
            <p>The public backend is waking from its free-tier sleep. The tour will start automatically as soon as live dashboard data arrives.</p>
            <div className="guided-tour-warming" role="status"><i className="guided-tour-spinner" aria-hidden="true" />CONNECTING TO MISSION CONTROL</div>
            {error && <div className="guided-tour-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void refresh()}>RETRY CONNECTION</button>
            </div>}
          </> : !tourComplete ? <>
            <h2 id="guided-tour-title">{tourStep.title}</h2>
            <p>{tourStep.narration}</p>
            {tourBusy && <div className="guided-tour-progress">STAGING SCENARIO STEP {tourStep.scenarioStep}…</div>}
            {tourError && <div className="guided-tour-error" role="alert">
              <span>{tourError}</span>
              <button type="button" onClick={retryGuidedTourStep}>RETRY STEP</button>
            </div>}
            <div className="guided-tour-actions">
              {!tourError && (tourStepIndex === GUIDED_TOUR_STEPS.length - 1
                ? <button type="button" className="guided-tour-next" disabled={tourBusy} onClick={advanceGuidedTour}>FINISH</button>
                : <button type="button" className="guided-tour-next" disabled={tourBusy} onClick={advanceGuidedTour}>NEXT →</button>)}
            </div>
          </> : <>
            <span className="sr-only">TOUR COMPLETE — now break something yourself</span>
            <h2 id="guided-tour-title">Now break something yourself</h2>
            <p>The incident is preserved below. Test the real ledger integrity control or replay the six-step tour.</p>
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
  guidedTone?: GuidedTourSpotlightTone;
  onToggle: () => void;
  onTransition: (id: number, verb: "approve" | "reject") => Promise<void>;
}) {
  const verdict = action.intent_verdict;
  const hijack = verdict?.verdict === "hijack_suspected";
  const liveRun = isLiveRun(action);
  const rowStyle = { "--row-delay": `${Math.min(index, 12) * 35}ms` } as CSSProperties;
  return (
    <article
      id={`action-${action.id}`}
      className={`action-row status-${action.status} ${hijack ? "hijack-row" : ""} ${isNew ? "new-row" : "feed-entry"} ${guidedTone && !hijack ? `guided-focus guided-focus-${guidedTone}` : ""}`}
      style={rowStyle}
    >
      <button className="action-summary" onClick={onToggle} aria-expanded={expanded}>
        <span className="status-pip" />
        <span className="action-main"><strong>{actionLabel(action)}{liveRun && <span className="live-run-chip">LIVE RUN</span>}</strong><small>{action.counterparty} · agent #{action.agent_id}</small></span>
        <span className="action-amount">{formatMoney(action.amount)}</span>
        <span className="action-status" title={actionStatusTitle(action.status)}>{action.status.replaceAll("_", " ")}</span>
        <span className="chevron">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && <div className="action-detail">
        {hijack && verdict && <div id={`action-${action.id}-hijack`} className={`hijack-alert ${guidedTone ? `guided-focus guided-focus-${guidedTone}` : ""}`}>
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

function LiveIntentPanel({ error, progressIndex, result, onRetry }: {
  error: string | null;
  progressIndex: number | null;
  result: LiveIntentResult | null;
  onRetry: () => void;
}) {
  const unavailable = error !== null || result?.verdict === null;
  return (
    <section className={`live-intent-result ${unavailable ? "is-unavailable" : ""}`} aria-live="polite">
      {progressIndex !== null && <div className="live-intent-progress" role="status">
        <span>LIVE OPENAI</span>
        <ol>{LIVE_INTENT_PROGRESS.map((label, index) => <li className={index === progressIndex ? "is-active" : index < progressIndex ? "is-complete" : ""} key={label}>{label}</li>)}</ol>
      </div>}
      {progressIndex === null && unavailable && <div className="live-intent-unavailable">
        <div><strong>LIVE INTENT UNAVAILABLE — held for human review</strong><span>{error ?? result?.message}</span></div>
        <button type="button" onClick={onRetry}>RETRY LIVE CHECK</button>
      </div>}
      {progressIndex === null && result && <div className="live-intent-output">
        {result.verdict && <div className="live-intent-verdict"><span>{result.verdict.verdict.replaceAll("_", " ")}</span><strong>{result.verdict.confidence.toFixed(2)}</strong><p>{result.verdict.reasoning}</p></div>}
        <div className="live-intent-provenance">
          <strong>LIVE OPENAI</strong>
          <span>{result.provenance.model}</span>
          <span title={result.provenance.response_id ?? undefined}>response {truncateResponseId(result.provenance.response_id)}</span>
          <span>{result.provenance.latency_ms} ms</span>
          <time dateTime={result.provenance.timestamp}>{result.provenance.timestamp} UTC</time>
          {result.cached && <small>CACHED RESULT · NO SECOND MODEL CALL</small>}
        </div>
      </div>}
    </section>
  );
}

function AgentRisk({ agent, guidedTone }: { agent: Agent; guidedTone?: GuidedTourSpotlightTone }) {
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
