import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = { title: "Agent Payment Guardrail", description: "Safe, auditable autonomous payments for AI agents." };
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={inter.variable}>{children}</body></html>;
}
