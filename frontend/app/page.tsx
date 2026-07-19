import Link from "next/link";

import { AgentGuardMark } from "./agentguard-mark";
import { HeroVerdictCard, IntentComparison } from "./landing-interactions";
import { LayerDiagram } from "./layer-diagram";
import { LiveProofStrip } from "./live-proof-strip";


const COMPARISON_ROWS = [
  ["Spend caps & allowlists", "FULL", "FULL", "FULL", "PARTIAL"],
  ["Human approval loop", "FULL", "PARTIAL", "PARTIAL", "FULL"],
  ["Tamper-evident audit chain", "PARTIAL", "PARTIAL", "PARTIAL", "FULL"],
  ["Reads intent vs a declared mission", "NO", "NO", "PARTIAL", "FULL"],
  ["Catches attacks that pass every rule", "NO", "NO", "NO", "FULL"],
  ["Fail-closed by design", "PARTIAL", "PARTIAL", "PARTIAL", "FULL"],
  ["Plugs into any agent (MCP)", "PARTIAL", "PARTIAL", "PARTIAL", "FULL"],
] as const;


export default function LandingPage() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="landing-wordmark" href="/" aria-label="AgentGuard home">
          <span className="brand-mark"><AgentGuardMark className="agentguard-mark" /></span>
          <span><strong>AGENTGUARD</strong><small>INTENT SECURITY FOR AUTONOMOUS AGENTS</small></span>
        </Link>
        <Link className="landing-console-link" href="/console">OPEN CONSOLE →</Link>
      </nav>

      <section className="landing-hero" data-section="hero">
        <div className="landing-hero-copy">
          <span className="landing-kicker"><i />MISSION-AWARE EXECUTION CONTROL</span>
          <h1>It knows if your agent is still yours.</h1>
          <p>The firewall for AI agents — a GPT-5.6 intent layer that catches hijacked agents static rules can&apos;t see.</p>
          <p className="landing-model-line">the firewall IS GPT-5.6 judging GPT-5.6</p>
          <div className="landing-hero-actions">
            <Link className="landing-secondary-link" href="/console">Launch live console →</Link>
            <Link className="landing-primary-link" href="/console?demo=1">Run the attack demo</Link>
          </div>
          <small className="landing-hero-note">PUBLIC, KEYLESS DEMO · REAL POLICY AND LEDGER PATH</small>
        </div>

        <HeroVerdictCard />
      </section>

      <section className="landing-section landing-layer" data-section="layer">
        <div className="landing-section-index"><span>01</span><small>THE LAYER</small></div>
        <div className="landing-section-body">
          <header className="landing-section-heading">
            <span>MISSION-AWARE CONTROL PLANE</span>
            <h2>One layer between your agent and everything it can touch.</h2>
            <p>Every high-risk action — payments, email, data, APIs, shell — is judged against the mission before it executes.</p>
          </header>
          <LayerDiagram />
        </div>
      </section>

      <section className="landing-section landing-signature" data-section="signature">
        <div className="landing-section-index"><span>02</span><small>THE BLIND SPOT</small></div>
        <div className="landing-section-body">
          <header className="landing-section-heading"><span>THE ATTACK RULES CAN&apos;T SEE</span><h2>Rules see numbers. The firewall reads intent.</h2></header>
          <IntentComparison />
        </div>
      </section>

      <section className="landing-section landing-problem" data-section="problem">
        <div className="landing-section-index"><span>03</span><small>THE FAILURE MODE</small></div>
        <div className="landing-problem-copy">
          <h2>Your agent follows instructions. All of them.</h2>
          <div className="landing-problem-lines">
            <p>Agents read emails, webpages, invoices, and documents to decide what to do.</p>
            <p>A poisoned document can redirect the agent without changing its permissions.</p>
            <p>By the time it acts, every numeric rule can still be green.</p>
          </div>
          <div className="landing-source-line">
            <p>Gartner predicts that by 2028, 1 in 4 enterprise breaches will be traced back to AI agent abuse — from both external and malicious internal actors.</p>
            <small>— Gartner, 2025</small>
          </div>
        </div>
      </section>

      <section className="landing-proof-section" data-section="live-proof" aria-label="Live system proof">
        <LiveProofStrip />
      </section>

      <section className="landing-section" data-section="two-judges">
        <div className="landing-section-index"><span>04</span><small>HOW IT WORKS</small></div>
        <div className="landing-section-body">
          <header className="landing-section-heading"><span>THE TWO JUDGES</span><h2>Every action has to clear policy and intent.</h2></header>
          <div className="landing-judge-grid">
            <article><span>01 / MISSION</span><h3>Declare a mission</h3><p>The agent registers its purpose. Every proposed action is judged against that declared mission.</p><small className="landing-judge-micro">set by the operator · every change is ledgered</small></article>
            <article><span>02 / FUSION</span><h3>Judged twice</h3><p>A deterministic policy floor checks caps, allowlists, and integer cents. GPT-5.6 reads intent against the mission. If the model is unavailable, fusion fails closed.</p><small className="landing-judge-micro">deterministic floor + gpt-5.6 · fails closed</small></article>
            <article><span>03 / EVIDENCE</span><h3>Chained forever</h3><p>Every decision is hash-chained with SHA-256. Historical tampering breaks the chain and is verifiable live.</p><Link href="/console">break it yourself → open the console</Link><small className="landing-judge-micro">hash-chained · break it yourself in the console</small></article>
          </div>
        </div>
      </section>

      <section className="landing-section" data-section="comparison">
        <div className="landing-section-index"><span>05</span><small>POSITIONING</small></div>
        <div className="landing-section-body">
          <header className="landing-section-heading"><span>HONEST COMPARISON</span><h2>Controls compose. Intent is the missing layer.</h2></header>
          <div className="landing-table-wrap">
            <table className="landing-comparison-table">
              <thead><tr><th scope="col">CAPABILITY</th><th scope="col">Spend management tools</th><th scope="col">Agent wallets</th><th scope="col">Deterministic kernels</th><th scope="col">AgentGuard</th></tr></thead>
              <tbody>{COMPARISON_ROWS.map(([label, ...values]) => <tr key={label}><th scope="row">{label}</th>{values.map((value, index) => <td className={index === 3 ? "is-agentguard" : ""} key={`${label}-${index}`}><span className={`comparison-${value.toLowerCase()}`}>{value}</span></td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="landing-comparison-note">Deterministic layers catch rule violations. AgentGuard catches betrayed intent — they compose, not compete.</p>
          <p className="landing-comparison-note">AgentGuard does not hold funds or replace spend controls — it composes with them.</p>
        </div>
      </section>

      <section className="landing-section" data-section="verification">
        <div className="landing-section-index"><span>06</span><small>OPEN EVIDENCE</small></div>
        <div className="landing-section-body">
          <header className="landing-section-heading"><span>VERIFY, DON&apos;T TRUST</span><h2>Every core claim is reproducible.</h2></header>
          <div className="landing-proof-links">
            <a href="https://github.com/doctormizio777777/agentguard" target="_blank" rel="noreferrer"><span>SOURCE</span><strong>GitHub repo</strong><small>Read the implementation →</small></a>
            <a href="https://github.com/doctormizio777777/agentguard/blob/main/docs/VERIFICATION.md" target="_blank" rel="noreferrer"><span>PROOF</span><strong>VERIFICATION.md</strong><small>Every claim → proof → real output</small></a>
            <a href="https://github.com/doctormizio777777/agentguard/blob/main/docs/reviews/2026-07-18-final-security-audit.md" target="_blank" rel="noreferrer"><span>SECURITY</span><strong>Final security audit</strong><small>Exposure and accepted risks →</small></a>
          </div>
          <p className="landing-tamper-line">You can even tamper with the ledger yourself — the chain will catch you. <Link href="/console">→ open the console</Link></p>
          <div className="landing-local-run"><div><span>LOCAL / 60 SECONDS</span><strong>No API key required</strong></div><pre><code>git clone https://github.com/doctormizio777777/agentguard.git{`\n`}cd agentguard{`\n`}docker compose up --build</code></pre></div>
        </div>
      </section>

      <section className="landing-built-with" data-section="built-with">
        <div className="landing-built-copy"><span>BUILT WITH</span><p>Codex + GPT-5.6 <small>· FastAPI · SQLite · Next.js · MCP</small></p><strong>OpenAI Build Week 2026 entry</strong></div>
        <footer className="landing-footer"><span>AGENTGUARD · MIT</span><nav aria-label="Footer navigation"><a href="https://github.com/doctormizio777777/agentguard">REPO</a><Link href="/console">CONSOLE</Link><a href="https://github.com/doctormizio777777/agentguard/blob/main/LICENSE">LICENSE</a></nav></footer>
      </section>
    </main>
  );
}
