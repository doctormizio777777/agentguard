export function AgentGuardMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      role="img"
      aria-label="AgentGuard aperture mark"
      fill="none"
    >
      <path className="mark-stroke" d="M2.5 16C6.4 9.4 11 6.3 16 6.3S25.6 9.4 29.5 16C25.6 22.6 21 25.7 16 25.7S6.4 22.6 2.5 16Z" />
      <path className="mark-stroke" d="M12.2 10.8A6.5 6.5 0 0 1 19.8 10.8" />
      <path className="mark-stroke" d="M21.2 12.2A6.5 6.5 0 0 1 21.2 19.8" />
      <path className="mark-stroke" d="M19.8 21.2A6.5 6.5 0 0 1 12.2 21.2" />
      <path className="mark-stroke" d="M10.8 19.8A6.5 6.5 0 0 1 10.8 12.2" />
      <circle className="mark-dot" cx="16" cy="16" r="2" />
    </svg>
  );
}
