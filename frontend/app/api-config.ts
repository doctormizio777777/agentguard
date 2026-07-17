export const DEMO_LINKS = [
  { label: "GitHub repo", href: "https://github.com/doctormizio777777/agentguard" },
  {
    label: "Verification proof",
    href: "https://github.com/doctormizio777777/agentguard/blob/main/docs/VERIFICATION.md",
  },
  {
    label: "Run locally in 60s",
    href: "https://github.com/doctormizio777777/agentguard#3-try-it-in-60-seconds",
  },
] as const;

export function apiBaseUrl(environmentValue: string | undefined): string {
  const configured = environmentValue?.trim();
  return configured ? configured.replace(/\/+$/, "") : "http://localhost:8000";
}

export const API_BASE_URL = apiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
