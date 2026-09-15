"use client";

import { useEffect, useState } from "react";
import {
  type LedgerLatest,
  type LedgerPayment,
  endpointShortLabel,
  isSelfTestReason,
  paymentBasescan,
  shortAddr,
} from "@/lib/ledger";

const EMPTY_COPY =
  "No payments yet — the first one will appear here with its BaseScan link.";

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

  const totalPayments = latest.totalPayments ?? 0;
  const recentPayments: LedgerPayment[] = (latest.recentPayments ?? [])
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 3);
  const isEmpty = totalPayments === 0;

  return (
    <aside
      className={`hero-panel${isEmpty ? " hero-panel--empty" : ""}`}
      aria-label="Live ledger summary"
    >
      <p className="hero-panel-kicker">Live from ledger</p>
      <div className={`hero-panel-grid${isEmpty ? " hero-panel-grid--solo" : ""}`}>
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
          <span className="kpi-value">{totalPayments}</span>
        </div>
      </div>
      {isEmpty ? (
        <p className="hero-panel-empty-msg">{EMPTY_COPY}</p>
      ) : (
        <div className="hero-panel-recent">
          <span className="kpi-label">Latest payments</span>
          <ul className="hero-panel-payment-list">
            {recentPayments.map((p, i) => {
              const scan = paymentBasescan(p);
              const label = p.endpoint ? endpointShortLabel(p.endpoint) : null;
              return (
                <li key={`${p.txHash ?? p.timestamp}-${i}`}>
                  <p className="hero-panel-payment-line">
                    <strong>{p.amountUsdc} USDC</strong>
                    {isSelfTestReason(p.reason) ? (
                      <span className="tag-self-test">Self-test</span>
                    ) : null}
                    {label ? (
                      <>
                        {" "}
                        →{" "}
                        <span className="endpoint-label" title={p.endpoint}>
                          {label}
                        </span>
                      </>
                    ) : null}
                  </p>
                  {scan ? (
                    <a href={scan} rel="noopener noreferrer" target="_blank">
                      BaseScan {p.txHash ? shortAddr(p.txHash) : "tx"}
                    </a>
                  ) : (
                    <p className="muted small">
                      No transaction hash recorded yet.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
