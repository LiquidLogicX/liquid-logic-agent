"use client";

import { useEffect, useState } from "react";
import {
  type LedgerLatest,
  type LedgerPayment,
  paymentBasescan,
  shortAddr,
} from "@/lib/ledger";

export function HeroLedgerPanel() {
  const [latest, setLatest] = useState<LedgerLatest | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/ledger/latest.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<LedgerLatest>;
      })
      .then((data) => {
        if (!cancelled) setLatest(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || !latest) return null;

  const recent: LedgerPayment | undefined = latest.recentPayments?.[0];
  const scan = recent ? paymentBasescan(recent) : undefined;

  return (
    <aside className="hero-panel" aria-label="Live ledger summary">
      <p className="hero-panel-kicker">Live from ledger</p>
      <div className="hero-panel-grid">
        <div>
          <span className="kpi-label">Total USDC spent</span>
          <span className="kpi-value">
            {Number(latest.totalPaidUsdcApprox ?? 0).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}
          </span>
        </div>
        <div>
          <span className="kpi-label">Payments</span>
          <span className="kpi-value">{latest.totalPayments ?? 0}</span>
        </div>
      </div>
      {recent ? (
        <div className="hero-panel-recent">
          <span className="kpi-label">Most recent</span>
          <p>
            <strong>{recent.amountUsdc} USDC</strong>
            {recent.endpoint ? (
              <>
                {" "}
                → <span className="mono truncate">{recent.endpoint}</span>
              </>
            ) : null}
          </p>
          {scan ? (
            <a href={scan} rel="noopener noreferrer" target="_blank">
              BaseScan {recent.txHash ? shortAddr(recent.txHash) : "tx"}
            </a>
          ) : (
            <p className="muted small">No transaction hash recorded yet.</p>
          )}
        </div>
      ) : null}
    </aside>
  );
}
