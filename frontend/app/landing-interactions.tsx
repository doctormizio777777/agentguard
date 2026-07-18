"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ATTACK_CASES,
  DECLARED_MISSION,
  DEFAULT_ATTACK_CASE_ID,
  HERO_CASES,
  INTENT_THRESHOLD,
  RECORDED_RUN_LABEL,
  type AttackCase,
  nextCaseIndex,
} from "./landing-demo-state";


const DEFAULT_ATTACK_CASE = ATTACK_CASES.find(({ id }) => id === DEFAULT_ATTACK_CASE_ID) ?? ATTACK_CASES[0];


export function HeroVerdictCard() {
  const [heroIndex, setHeroIndex] = useState(0);
  const [hasCompared, setHasCompared] = useState(false);
  const evidence = HERO_CASES[heroIndex];

  const compareEvidence = () => {
    setHasCompared(true);
    setHeroIndex(nextCaseIndex(heroIndex, HERO_CASES.length));
  };

  return (
    <button
      aria-label="Compare suspicious and aligned intent evidence"
      className={`landing-threat-card landing-threat-card-${evidence.tone} ${hasCompared ? "has-compared" : ""}`}
      onClick={compareEvidence}
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
        </div>
        <strong>{evidence.amount}</strong>
      </div>
      <p className="landing-threat-payload">Payload: “{evidence.payload}”</p>
      <div className="landing-hero-policy-trace">
        <span>// policy reasons</span>
        {evidence.vendorContext.split(" · ").map((reason) => <span key={reason}>{reason} ✓</span>)}
      </div>
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
  const [activeCase, setActiveCase] = useState<AttackCase>(DEFAULT_ATTACK_CASE);
  const [visibleLineCount, setVisibleLineCount] = useState(DEFAULT_ATTACK_CASE.trace.length + 3);
  const [isAnimating, setIsAnimating] = useState(false);
  const traceLines = [
    { kind: "comment", text: `// payload: ${activeCase.payload}` },
    ...activeCase.trace.map(({ passed, text }) => ({ kind: passed ? "pass" : "fail", text })),
    { kind: "intent", text: activeCase.intentLine },
    { kind: `final final-${activeCase.tone}`, text: activeCase.finalLine },
  ];

  useEffect(() => {
    if (!isAnimating) return;

    let nextLine = 0;
    const timer = window.setInterval(() => {
      nextLine += 1;
      setVisibleLineCount(nextLine);
      if (nextLine >= activeCase.trace.length + 3) {
        window.clearInterval(timer);
        setIsAnimating(false);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [activeCase, isAnimating]);

  function runCase(nextCase: AttackCase) {
    if (isAnimating) return;

    setActiveCase(nextCase);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleLineCount(nextCase.trace.length + 3);
      return;
    }

    setVisibleLineCount(0);
    setIsAnimating(true);
  }

  const evaluationComplete = visibleLineCount >= traceLines.length;

  return (
    <div className="landing-attack-widget">
      <div className="landing-attack-chips" aria-label="Attack payloads">
        {ATTACK_CASES.map((attackCase) => (
          <button
            aria-pressed={attackCase.id === activeCase.id}
            className={attackCase.id === activeCase.id ? "is-active" : ""}
            disabled={isAnimating}
            key={attackCase.id}
            onClick={() => runCase(attackCase)}
            type="button"
          >
            {attackCase.chipLabel}
          </button>
        ))}
      </div>
      <div className={`landing-kernel-trace landing-kernel-trace-${activeCase.tone}`} aria-live="polite" aria-busy={isAnimating}>
        <div className="landing-trace-lines">
          {traceLines.slice(0, visibleLineCount).map((line) => (
            <code className={`landing-trace-line landing-trace-${line.kind.replace(" ", " landing-trace-")}`} key={`${activeCase.id}-${line.text}`}>
              {line.text}
            </code>
          ))}
        </div>
        {evaluationComplete && (
          <div className="landing-trace-verdict">
            <small>{activeCase.caption}</small>
            <blockquote>“{activeCase.quote}”</blockquote>
          </div>
        )}
      </div>
      <Link className="landing-recorded-link" href="/console?demo=1">recorded run · reproducible in console →</Link>
    </div>
  );
}
