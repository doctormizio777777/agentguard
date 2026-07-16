import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Agent Payment Guardrail", description: "Safe, auditable autonomous payments for AI agents." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

