"use client";

import { useEffect, useState } from "react";
import {
  basescanAddress,
  type LedgerLatest,
  shortAddr,
} from "@/lib/ledger";

export function StatsBand() {
  const [latest, setLatest] = useState<LedgerLatest | null>(null);

  useEffect(() => {
    fetch("/ledger/latest.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LedgerLatest) => setLatest(data))
      .catch(() => setLatest(null));
  }, []);

  if (!latest) return null;

  const wallet = latest.walletAddress;
  const network =
    latest.network === "eip155:8453"
      ? "Base"
      : latest.network === "eip155:84532"
        ? "Base Sepolia"
        : (latest.network ?? "—");

  return (
    <section className="stats-band" aria-label="Ledger stats">
      <div className="stats-inner">
        <div className="stat">
          <span className="stat-label">Total spent</span>
          <span className="stat-value">
            {Number(latest.totalPaidUsdcApprox ?? 0).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}{" "}
            USDC
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Payments made</span>
          <span className="stat-value">{latest.totalPayments ?? 0}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Chain</span>
          <span className="stat-value">{network}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Agent wallet</span>
          <span className="stat-value mono">
            {wallet ? (
              <a
                href={basescanAddress(wallet)}
                rel="noopener noreferrer"
                target="_blank"
              >
                {shortAddr(wallet)}
              </a>
            ) : (
              "—"
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
