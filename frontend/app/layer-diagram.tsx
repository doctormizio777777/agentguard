const STAGES = [
  { label: "POLICY FLOOR", className: "layer-stage-policy" },
  { label: "GPT-5.6 INTENT", className: "layer-stage-intent" },
  { label: "HUMAN APPROVAL", className: "layer-stage-approval" },
  { label: "HASH-CHAINED LEDGER", className: "layer-stage-ledger" },
] as const;

const DESTINATIONS = ["PAYMENTS", "EMAIL", "DATA EXPORT", "API CALLS", "SHELL COMMANDS"] as const;


export function LayerDiagram() {
  return (
    <div className="layer-diagram" role="img" aria-label="AgentGuard evaluates an agent action before it can reach payments, email, data exports, API calls, or shell commands">
      <svg className="layer-diagram-svg layer-diagram-desktop" viewBox="0 0 1200 520" aria-hidden="true">
        <g className="layer-agent-node">
          <rect x="24" y="205" width="192" height="108" rx="4" />
          <text x="120" y="250" textAnchor="middle">YOUR AGENT</text>
          <text className="layer-node-detail" x="120" y="277" textAnchor="middle">any framework · via MCP</text>
        </g>

        <path className="layer-connector" d="M216 259H310" />
        <path className="layer-connector layer-connector-exit" d="M790 389H836V278H926" />
        <path className="layer-connector layer-connector-dim" d="M836 98H926M836 188H926M836 368H926M836 458H926" />
        <path className="layer-motion-lane" d="M216 259H330V139V233V327V421V470H836V278H916" />

        <g className="layer-core">
          <rect className="layer-core-frame" x="310" y="35" width="480" height="450" rx="5" />
          <text className="layer-core-label" x="340" y="75">AGENTGUARD</text>
          <text className="layer-core-state" x="758" y="75" textAnchor="end">MISSION-AWARE CONTROL PLANE</text>
          {STAGES.map((stage, index) => {
            const y = 105 + index * 94;
            return (
              <g className={`layer-stage ${stage.className}`} key={stage.label}>
                <rect x="350" y={y} width="400" height="68" rx="3" />
                <circle cx="377" cy={y + 34} r="5" />
                <text x="402" y={y + 39}>{stage.label}</text>
                <text className="layer-stage-index" x="720" y={y + 39} textAnchor="end">0{index + 1}</text>
              </g>
            );
          })}
        </g>

        <g className="layer-destination-stack">
          {DESTINATIONS.map((destination, index) => {
            const y = 62 + index * 90;
            return (
              <g className={`layer-destination ${index === 2 ? "is-target" : ""}`} key={destination}>
                <rect x="926" y={y} width="250" height="72" rx="3" />
                <text x="1051" y={y + 43} textAnchor="middle">{destination}</text>
              </g>
            );
          })}
        </g>

        <circle className="layer-action-dot layer-action-dot-allowed" r="7" />
        <circle className="layer-action-dot layer-action-dot-blocked" r="7" />
        <text className="layer-verdict-label layer-verdict-allowed" x="1004" y="289">ALLOWED</text>
        <text className="layer-verdict-label layer-verdict-blocked" x="598" y="221">BLOCKED</text>
      </svg>

      <svg className="layer-diagram-svg layer-diagram-mobile" viewBox="0 0 360 930" aria-hidden="true">
        <g className="layer-agent-node">
          <rect x="55" y="24" width="250" height="86" rx="4" />
          <text x="180" y="61" textAnchor="middle">YOUR AGENT</text>
          <text className="layer-node-detail" x="180" y="84" textAnchor="middle">any framework · via MCP</text>
        </g>
        <path className="layer-connector" d="M180 110V155" />
        <path className="layer-motion-lane" d="M180 110V140H40V253V354V455V556V680H180V694" />

        <g className="layer-core">
          <rect className="layer-core-frame" x="28" y="155" width="304" height="500" rx="5" />
          <text className="layer-core-label" x="52" y="191">AGENTGUARD</text>
          <text className="layer-core-state" x="308" y="191" textAnchor="end">CONTROL PLANE</text>
          {STAGES.map((stage, index) => {
            const y = 218 + index * 101;
            return (
              <g className={`layer-stage ${stage.className}`} key={`mobile-${stage.label}`}>
                <rect x="50" y={y} width="260" height="70" rx="3" />
                <circle cx="73" cy={y + 35} r="5" />
                <text x="91" y={y + 40}>{stage.label}</text>
                <text className="layer-stage-index" x="288" y={y + 40} textAnchor="end">0{index + 1}</text>
              </g>
            );
          })}
        </g>

        <path className="layer-connector layer-connector-exit" d="M180 655V704" />
        <g className="layer-destination-stack layer-destination-grid">
          {DESTINATIONS.map((destination, index) => {
            const x = index % 2 === 0 ? 18 : 187;
            const y = 704 + Math.floor(index / 2) * 70;
            return (
              <g className={`layer-destination ${index === 4 ? "is-target" : ""}`} key={`mobile-${destination}`}>
                <rect x={x} y={y} width={index === 4 ? 324 : 155} height="56" rx="3" />
                <text x={index === 4 ? 180 : x + 77.5} y={y + 34} textAnchor="middle">{destination}</text>
              </g>
            );
          })}
        </g>

        <circle className="layer-action-dot layer-action-dot-allowed layer-action-dot-mobile" r="6" />
        <circle className="layer-action-dot layer-action-dot-blocked layer-action-dot-mobile-blocked" r="6" />
      </svg>
    </div>
  );
}
