"use client";

import { useCallback, useEffect, useState } from "react";
import {
  endpointShortLabel,
  eventTypeLabel,
  fetchLedgerLatest,
  isSelfTestReason,
  paymentBasescan,
  shortAddr,
  type LedgerEventRow,
  type LedgerLatest,
} from "@/lib/ledger";

function formatUtcShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isLaunchGenesisReset(e: LedgerEventRow): boolean {
  return e.message === "LAUNCH_GENESIS_RESET" || e.reason === "LAUNCH_GENESIS_RESET";
}

/** Public destination column — never surface internal note reason strings. */
function destinationFor(e: LedgerEventRow): { label: string; title?: string } {
  if (e.endpoint) {
    return { label: endpointShortLabel(e.endpoint), title: e.endpoint };
  }
  if (e.type === "top_up") return { label: "Treasurer wallet" };
  if (e.type === "note") {
    if (isLaunchGenesisReset(e)) {
      return { label: "Ledger reset for launch" };
    }
    return { label: "—" };
  }
  if (e.error) return { label: e.error };
  if (e.holdId) return { label: `hold ${e.holdId}` };
  if (e.walletAddress) return { label: shortAddr(e.walletAddress), title: e.walletAddress };
  // Do not fall through to e.reason for public UI
  return { label: "—" };
}

function amountFor(e: LedgerEventRow): string {
  if (e.amountUsdc != null && e.amountUsdc !== "") {
    return `${e.amountUsdc} USDC`;
  }
  return "—";
}

type Props = {
  /** Compact home-section mode vs full /ledger page */
  variant?: "section" | "page";
};

export function LedgerLive({ variant = "section" }: Props) {
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

  const events: LedgerEventRow[] = latest?.recentEvents?.length
    ? latest.recentEvents
    : (latest?.recentPayments ?? []).map((p) => ({
        ...p,
        type: p.type ?? "payment",
      }));

  // Prefer payments + top-ups for the table; keep all events on page variant
  const filtered =
    variant === "section"
      ? events.filter((e) => {
          const t = e.type ?? "payment";
          return t === "payment" || t === "top_up";
        })
      : events;

  // Newest first (same order as the home ledger panel expects)
  const rows = [...filtered].sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });

  const updated = latest?.generatedAt
    ? formatUtcShort(latest.generatedAt) + " UTC"
    : "—";

  return (
    <div className="ledger-live" style={{ minWidth: 0 }}>
      <div className="summary">
        <div>
          <span>Payments</span>
          <strong>{latest?.totalPayments ?? (loading ? "…" : 0)}</strong>
        </div>
        <div>
          <span>Total paid</span>
          <strong>
            {latest
              ? `${Number(latest.totalPaidUsdcApprox ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
              : loading
                ? "…"
                : "—"}
          </strong>
        </div>
        <div>
          <span>Last updated</span>
          <strong>{loading && !latest ? "…" : updated}</strong>
        </div>
        {variant === "page" ? (
          <div>
            <button
              type="button"
              className="btn secondary"
              onClick={() => void load()}
            >
              Refresh
            </button>
          </div>
        ) : null}
      </div>

      {error && !latest ? (
        <p className="note">{error}</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Type</th>
                <th>Destination</th>
                <th className="num">Amount</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5}>No ledger events yet.</td>
                </tr>
              ) : null}
              {rows.map((e, i) => {
                const type = e.type || "payment";
                const dest = destinationFor(e);
                const href = paymentBasescan(e);
                return (
                  <tr key={`${type}-${e.timestamp}-${i}`}>
                    <td>
                      <time dateTime={e.timestamp}>
                        {formatUtcShort(e.timestamp)}
                      </time>
                    </td>
                    <td>
                      {eventTypeLabel(type)}
                      {type === "payment" && isSelfTestReason(e.reason) ? (
                        <span className="tag">Self-test</span>
                      ) : null}
                    </td>
                    <td title={dest.title}>{dest.label}</td>
                    <td className="num">{amountFor(e)}</td>
                    <td>
                      {href ? (
                        <a
                          className="mono"
                          href={href}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {e.txHash ? shortAddr(e.txHash) : "tx"}
                        </a>
                      ) : type === "payment" ? (
                        <span className="muted">No hash</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="note ledger-reset-note">
        Ledger reset for launch on September 15, 2026. Earlier test payments are
        listed in the changelog.
      </p>
      <p className="note">
        Live from{" "}
        <a href="/ledger/latest.json">latest.json</a>
        {variant === "section" ? (
          <>
            {" · "}
            <a href="/ledger">Full ledger</a>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
