import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Liquid Logic Agent",
  description:
    "Autonomous USDC operating spend on Base via x402 — services only, public ledger.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a className="logo" href="/">
            Liquid Logic
          </a>
          <nav>
            <a href="/ledger">Ledger</a>
            <a href="/docs">Endpoint docs</a>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>
            USDC on Base for x402 services only. No custom token. No investment or
            treasury-growth framing.
          </p>
        </footer>
      </body>
    </html>
  );
}
