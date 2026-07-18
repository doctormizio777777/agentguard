import Link from "next/link";

import { AgentGuardMark } from "./agentguard-mark";


export default function LandingPage() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <div className="brand-lockup">
          <span className="brand-mark"><AgentGuardMark className="agentguard-mark" /></span>
          <div><strong>AGENTGUARD</strong><span>THE INTELLIGENT FIREWALL FOR AI AGENTS</span></div>
        </div>
        <Link className="landing-console-link" href="/console">OPEN CONSOLE →</Link>
      </nav>

      <section className="landing-route-intro">
        <span className="eyebrow">AGENTGUARD</span>
        <h1>It knows if your agent is still yours.</h1>
        <p>The intelligent firewall for AI agents — a GPT-5.6 intent layer that catches hijacked agents static rules can&apos;t see.</p>
        <Link className="landing-primary-link" href="/console">OPEN CONSOLE →</Link>
      </section>
    </main>
  );
}
