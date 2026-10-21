/**
 * Base x402 rail: serialization, quotes and daily-cap reservations.
 *
 * - One process-wide async lock (same pattern as TempoRail.withLock) wraps every
 *   Base payment: cap check → `reserved` row → sign/settle → payment or release.
 * - The price is read from the very 402 the x402 client is about to pay, and is
 *   checked before any payment payload is created. Unknown price ⇒ refuse.
 * - One CdpX402Client per process so CDP's 24h cumulative spend control accumulates.
 */
import { randomUUID } from "node:crypto";
import { atomicToUsdc, sumSpentTodayAtomic, TREASURER_WALLET_ADDRESS, type LedgerEvent } from "@liquid-logic/shared";
import type { LedgerStore } from "./ledger-store.js";

// ── lock ────────────────────────────────────────────────────────────────────
let lock: Promise<unknown> = Promise.resolve();
export function withBasePaymentLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

// ── quotes ──────────────────────────────────────────────────────────────────
export type PriceQuote = { atomic: bigint; network: string; asset: string; payTo?: string };

type Accept = { network?: string; asset?: string; amount?: string; maxAmountRequired?: string; payTo?: string };

function decodeHeaderJson(v: string): unknown {
  for (const candidate of [v, (() => {
    try {
      const pad = "=".repeat((4 - (v.length % 4)) % 4);
      return Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
    } catch {
      return "";
    }
  })()]) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Highest price among the 402's `accepts` entries on our network + asset
 * (the x402 client may pick any matching entry, so assume the worst).
 * v2: base64 JSON in the PAYMENT-REQUIRED header; v1: JSON body.
 * Returns null when nothing parseable matches — callers must refuse.
 */
export async function quoteFrom402(
  response: Response,
  want: { network: string; asset: string },
): Promise<PriceQuote | null> {
  let doc: unknown = null;
  const h = response.headers.get("payment-required");
  if (h) doc = decodeHeaderJson(h.trim());
  if (!doc) {
    try {
      doc = JSON.parse(await response.clone().text());
    } catch {
      doc = null;
    }
  }
  const accepts = (doc as { accepts?: Accept[] } | null)?.accepts;
  if (!Array.isArray(accepts)) return null;
  const v1Network = want.network === "eip155:8453" ? "base" : want.network === "eip155:84532" ? "base-sepolia" : "";
  let best: PriceQuote | null = null;
  for (const a of accepts) {
    if (!a || typeof a !== "object") continue;
    const net = String(a.network ?? "");
    if (net !== want.network && net !== v1Network) continue;
    if (String(a.asset ?? "").toLowerCase() !== want.asset.toLowerCase()) continue;
    const raw = String(a.amount ?? a.maxAmountRequired ?? "");
    if (!/^\d{1,30}$/.test(raw)) return null; // malformed price in a matching entry ⇒ unknown
    const atomic = BigInt(raw);
    if (!best || atomic > best.atomic) best = { atomic, network: want.network, asset: want.asset, payTo: a.payTo };
  }
  return best;
}

/**
 * fetch wrapper handed to wrapFetchWithPayment: on the unpaid 402 it calls
 * `onQuote` (which may throw to refuse) before the x402 client builds a payment.
 */
export function quoteGuardedFetch(
  inner: typeof fetch,
  want: { network: string; asset: string },
  onQuote: (q: PriceQuote | null) => void,
): typeof fetch {
  let quoted = false;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await inner(input, init);
    if (res.status === 402 && !quoted) {
      quoted = true;
      onQuote(await quoteFrom402(res, want));
    }
    return res;
  }) as typeof fetch;
}

// ── reservations ────────────────────────────────────────────────────────────
/** Open (unsettled, unreleased) reservations from today (UTC). */
export function openReservedTodayAtomic(events: readonly LedgerEvent[], now = new Date()): bigint {
  const day = now.toISOString().slice(0, 10);
  const closed = new Set<string>();
  for (const e of events) {
    if (e.type === "reservation_released") closed.add(e.reservationId);
    else if (e.type === "payment" && e.reservationId) closed.add(e.reservationId);
  }
  let sum = 0n;
  for (const e of events) {
    if (e.type !== "reserved" || closed.has(e.reservationId)) continue;
    if (!e.timestamp.startsWith(day)) continue;
    try {
      const [w, f = ""] = e.amountUsdc.split(".");
      sum += BigInt(w!) * 1_000_000n + BigInt((f + "000000").slice(0, 6));
    } catch {
      /* skip malformed */
    }
  }
  return sum;
}

/** Settled payments + open reservations for today, treasurer wallet only. */
export function committedTodayAtomic(events: readonly LedgerEvent[], now = new Date()): bigint {
  return sumSpentTodayAtomic([...events], now, TREASURER_WALLET_ADDRESS) + openReservedTodayAtomic(events, now);
}

export function reserve(
  ledger: LedgerStore,
  opts: { endpoint: string; atomic: bigint; network: string; holdId?: string },
): string {
  const reservationId = randomUUID();
  ledger.append({
    type: "reserved",
    reservationId,
    timestamp: new Date().toISOString(),
    endpoint: opts.endpoint,
    amountUsdc: atomicToUsdc(opts.atomic),
    network: opts.network as never,
    holdId: opts.holdId,
    walletAddress: TREASURER_WALLET_ADDRESS,
  });
  return reservationId;
}

export function release(ledger: LedgerStore, reservationId: string, error: string): void {
  ledger.append({
    type: "reservation_released",
    reservationId,
    timestamp: new Date().toISOString(),
    error: error.slice(0, 300),
  });
}
