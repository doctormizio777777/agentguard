import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentguard-dusky.vercel.app"),
  title: "AgentGuard — The intelligent firewall for AI agents",
  description: "A GPT-5.6 intent layer that catches hijacked agents static rules can't see. Policy floor, intent firewall, tamper-evident audit chain.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AgentGuard — The intelligent firewall for AI agents",
    description: "A GPT-5.6 intent layer that catches hijacked agents static rules can't see. Policy floor, intent firewall, tamper-evident audit chain.",
    type: "website",
    url: "/",
    images: [{ url: "/banner.png", width: 1200, height: 630, alt: "AgentGuard intent firewall" }],
  },
};
export const viewport: Viewport = { themeColor: "#0f1117" };
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={inter.variable}>{children}</body></html>;
}
