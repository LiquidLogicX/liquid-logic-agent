"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  eventTypeLabel,
  fetchLedgerLatest,
  isNonPaymentType,
  paymentBasescan,
  shortAddr,
  type LedgerEventRow,
  type LedgerLatest,
} from "@/lib/ledger";

function detailFor(e: LedgerEventRow): string {
  if (e.endpoint) return e.endpoint;
  if (e.message) return e.message;
  if (e.error) return e.error;
  if (e.holdId) return `hold ${e.holdId}`;
  if (e.walletAddress) return e.walletAddress;
  return e.reason ?? "—";
}

function EventRow({ e }: { e: LedgerEventRow }) {
  const type = e.type || "payment";
  const nonPay = isNonPaymentType(type) || type !== "payment";
  const href = paymentBasescan(e);
  const amount =
    e.amountUsdc != null && e.amountUsdc !== ""
      ? `${e.amountUsdc} USDC`
      : null;

  return (
    <li className={`ledger-event ${nonPay ? `ledger-event--${type}` : "ledger-event--payment"}`}>
      <div className="ledger-event-meta">
        <span className={`ledger-type-badge ledger-type-badge--${type}`}>
          {eventTypeLabel(type)}
        </span>
        <time className="muted small mono" dateTime={e.timestamp}>
          {e.timestamp}
        </time>
      </div>
      <div className="ledger-event-body">
        {amount && type === "payment" ? (
          <strong>{amount}</strong>
        ) : amount && type !== "payment" ? (
          <span className="muted">{amount}</span>
        ) : null}
        {amount && type === "payment" ? " → " : amount ? " · " : null}
        <span className="mono truncate">{detailFor(e)}</span>
      </div>
      {e.reason && type !== "payment" ? (
        <p className="muted small ledger-event-reason">{e.reason}</p>
      ) : null}
      {href ? (
        <a href={href} rel="noopener noreferrer" target="_blank">
          BaseScan {e.txHash ? shortAddr(e.txHash) : "tx"}
        </a>
      ) : type === "payment" ? (
        <p className="muted small">No transaction hash — not counted as settled spend.</p>
      ) : null}
    </li>
  );
}

export function LedgerLive() {
  const [latest, setLatest] = useState<LedgerLatest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLedgerLatest("");
      if (!data) {
        setError("Could not load ledger latest.json");
        setLatest(null);
      } else {
        setLatest(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLatest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const events: LedgerEventRow[] =
    latest?.recentEvents?.length
      ? latest.recentEvents
      : (latest?.recentPayments ?? []).map((p) => ({
          ...p,
          type: p.type ?? "payment",
        }));

  const nonPayments = events.filter((e) => (e.type ?? "payment") !== "payment");
  const payments = events.filter((e) => (e.type ?? "payment") === "payment");

  return (
    <>
      <section className="card">
        <div className="ledger-summary-head">
          <h2>Summary</h2>
          <button type="button" className="btn btn-ghost ledger-refresh" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {loading && !latest ? (
          <p className="muted">Loading live ledger…</p>
        ) : error && !latest ? (
          <p className="muted">{error}</p>
        ) : latest ? (
          <>
            <ul>
              <li>Generated: {latest.generatedAt ?? "—"}</li>
              <li>Events: {latest.totalEvents ?? 0}</li>
              <li>Payments: {latest.totalPayments ?? 0}</li>
              <li>Approx USDC paid: {latest.totalPaidUsdcApprox ?? 0}</li>
              {latest.walletAddress ? (
                <li>
                  Wallet:{" "}
                  <a
                    href={`https://basescan.org/address/${latest.walletAddress}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {latest.walletAddress}
                  </a>
                </li>
              ) : null}
            </ul>
            <p className="muted small ledger-reset-note">
              Ledger reset for launch on September 15, 2026. Earlier test payments are listed in the changelog.
            </p>
          </>
        ) : (
          <p className="muted">No published summary yet.</p>
        )}
        <p>
          <Link href={`/ledger/latest.json?t=${Date.now()}`}>latest.json</Link> ·{" "}
          <a href="/ledger/index.html">Daily HTML</a>
        </p>
        <p className="muted small">
          Live fetch with cache bypass — Liquid Logic X public proof of operating spend.
        </p>
      </section>

      <section className="card">
        <h2>Recent activity</h2>
        <p className="muted small">
          Payments require a BaseScan hash. Holds, denials, expiries, and freeze
          events are shown as their own types — never as fake payments.
        </p>
        <ul className="ledger-event-list">
          {events.length ? (
            events.map((e, i) => (
              <EventRow key={`${e.type}-${e.timestamp}-${i}`} e={e} />
            ))
          ) : (
            <li className="muted">None yet.</li>
          )}
        </ul>
        {nonPayments.length > 0 || payments.length > 0 ? (
          <p className="muted small">
            Showing {payments.length} payment
            {payments.length === 1 ? "" : "s"} and {nonPayments.length} other
            event{nonPayments.length === 1 ? "" : "s"} in this window.
          </p>
        ) : null}
      </section>
    </>
  );
}
