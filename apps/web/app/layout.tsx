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
            Liquid Logic X
          </a>
          <nav>
            <a href="/#ledger-live">Ledger</a>
            <a href="/#changelog">Changelog</a>
            <a href="/plans">Plans</a>
            <a href="/docs">Endpoint docs</a>
            <a href="/#contact">Contact</a>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>
            USDC on Base for x402 services only. No custom token. No investment
            product. Plans describes intent, not a commitment.
          </p>
        </footer>
      </body>
    </html>
  );
}
