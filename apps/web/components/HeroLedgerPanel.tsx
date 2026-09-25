"use client";

/**
 * Compact live ledger summary (optional hero/aside use).
 * Institutional home uses PolicyTermsheet in the hero; this stays for reuse.
 */
import { useEffect, useState } from "react";
import {
  type LedgerLatest,
  type LedgerPayment,
  endpointShortLabel,
  paymentLabel,
  paymentLabelText,
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
      className={`termsheet${isEmpty ? " hero-panel--empty" : ""}`}
      aria-label="Live ledger summary"
    >
      <h2>Live from ledger</h2>
      <p className="asof">Published at liquidlogicx.com/ledger/latest.json</p>
      <dl className="terms">
        <dt>Total USDC spent</dt>
        <dd>
          {Number(latest.totalPaidUsdcApprox ?? 0).toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}
        </dd>
        <dt>Payments</dt>
        <dd>{totalPayments}</dd>
      </dl>
      {isEmpty ? (
        <p className="src">{EMPTY_COPY}</p>
      ) : (
        <ul className="hero-panel-payment-list">
          {recentPayments.map((p, i) => {
            const scan = paymentBasescan(p);
            const label = p.endpoint ? endpointShortLabel(p.endpoint) : null;
            return (
              <li key={`${p.txHash ?? p.timestamp}-${i}`}>
                <p className="hero-panel-payment-line">
                  <strong>{p.amountUsdc} USDC</strong>
                  {paymentLabel(p) ? (
                    <span className="tag">{paymentLabelText(paymentLabel(p)!)}</span>
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
                  <p className="note">No transaction hash recorded yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
