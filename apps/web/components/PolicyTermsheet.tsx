"use client";

import { useEffect, useState } from "react";
import {
  fetchPolicy,
  networkLabel,
  type SpendingPolicy,
} from "@/lib/policy";
import { shortAddr } from "@/lib/ledger";

export function PolicyTermsheet() {
  const [policy, setPolicy] = useState<SpendingPolicy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPolicy("")
      .then((data) => {
        if (cancelled) return;
        if (!data) setFailed(true);
        else setPolicy(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wallet = policy?.walletAddress;
  const allowCount = policy?.allowlist?.length ?? 0;

  return (
    <aside className="termsheet" aria-labelledby="ts-title">
      <h2 id="ts-title">Current spending policy</h2>
      <p className="asof">Published at liquidlogicx.com/policy.json</p>
      {failed && !policy ? (
        <p className="asof">Could not load policy.json</p>
      ) : !policy ? (
        <p className="asof">Loading policy…</p>
      ) : (
        <>
          <dl className="terms">
            <dt>Network</dt>
            <dd>{networkLabel(policy.network)}</dd>
            <dt>Settlement asset</dt>
            <dd>{policy.asset ?? "USDC"}</dd>
            <dt>Maximum per payment</dt>
            <dd>{policy.maxPerPaymentUsdc ?? "—"} USDC</dd>
            <dt>Daily limit</dt>
            <dd>
              {policy.dailyCapUsdc ?? "—"} USDC
              {policy.spentWindow === "utc_calendar_day"
                ? " per UTC day"
                : ""}
            </dd>
            <dt>Approved destinations</dt>
            <dd>
              {allowCount} endpoint{allowCount === 1 ? "" : "s"}
            </dd>
            <dt>Treasurer wallet</dt>
            <dd>
              {wallet ? (
                <a
                  className="mono"
                  href={`https://basescan.org/address/${wallet}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {shortAddr(wallet)}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </dl>
          <p className="src">
            Payments outside these limits are refused. The agent spends USDC on
            services only and never buys, sells or holds $LLX.
          </p>
        </>
      )}
    </aside>
  );
}
