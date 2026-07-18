"use client";

import { useState } from "react";

import {
  COMPARISON_CASES,
  DECLARED_MISSION,
  HERO_CASES,
  INTENT_THRESHOLD,
  RECORDED_RUN_LABEL,
  nextCaseIndex,
} from "./landing-demo-state";


export function HeroVerdictCard() {
  const [heroIndex, setHeroIndex] = useState(0);
  const evidence = HERO_CASES[heroIndex];

  return (
    <button
      aria-label="Compare suspicious and aligned intent evidence"
      className={`landing-threat-card landing-threat-card-${evidence.tone}`}
      onClick={() => setHeroIndex(nextCaseIndex(heroIndex, HERO_CASES.length))}
      type="button"
    >
      <div className="landing-threat-topline">
        <span><i />{evidence.intentLabel}</span>
        <small>{RECORDED_RUN_LABEL}</small>
      </div>
      <div className="landing-threat-action">
        <div>
          <span>PAYMENT REQUEST</span>
          <strong>{evidence.vendor}</strong>
          <small>{evidence.vendorContext}</small>
        </div>
        <strong>{evidence.amount}</strong>
      </div>
      <p className="landing-threat-payload">Payload: “{evidence.payload}”</p>
      <div className="landing-threat-confidence">
        <span>INTENT CONFIDENCE</span><strong>{evidence.confidence}</strong>
      </div>
      <blockquote>“{evidence.reasoning}”</blockquote>
      <small className="landing-intent-threshold">{INTENT_THRESHOLD}</small>
      <div className="landing-threat-mission"><span>DECLARED MISSION</span><p>“{DECLARED_MISSION}”</p></div>
      <small className="landing-click-hint">click to compare</small>
      <div className="landing-threat-decision"><span>FINAL DECISION</span><strong>{evidence.decision}</strong></div>
    </button>
  );
}


export function IntentComparison() {
  const [comparisonIndex, setComparisonIndex] = useState(0);
  const evidence = COMPARISON_CASES[comparisonIndex];

  return (
    <>
      <div className="landing-comparison-control">
        <span>COMPARE THE SAME €300 REQUEST</span>
        <button onClick={() => setComparisonIndex(nextCaseIndex(comparisonIndex, COMPARISON_CASES.length))} type="button">
          {evidence.toggleLabel} →
        </button>
      </div>
      <div className="landing-contrast-grid" aria-live="polite">
        <article className="landing-rules-card">
          <span>STATIC RULES</span>
          <strong>€300.00</strong>
          <p>{evidence.vendor} · {evidence.vendorContext}</p>
          <p>Payload: “{evidence.payload}”</p>
          <div><i />{evidence.staticDecision}</div>
        </article>
        <article className={`landing-intent-card landing-intent-card-${evidence.tone}`}>
          <span>AGENTGUARD</span>
          <strong>€300.00</strong>
          <p>Payload: “{evidence.payload}”</p>
          <div><i />{evidence.intentDecision}</div>
          <small className="landing-intent-threshold">{INTENT_THRESHOLD}</small>
          <blockquote>“{evidence.reasoning}”</blockquote>
        </article>
      </div>
    </>
  );
}
