/**
 * Base x402 rail: serialization, quotes and daily-cap reservations.
 *
 * - One process-wide async lock (same pattern as TempoRail.withLock) wraps every
 *   Base payment: cap check → `reserved` row → sign/settle → payment or release.
 *   CLI and server on the same host also take the ledger file lock
 *   (file-lock.ts). Two hosts must not share one ledger file.
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
export type PriceQuote = {
  atomic: bigint;
  network: string;
  asset: string;
  /** Set only when every matching accept names this same address. */
  payTo?: string;
  /** Matching accepts omit payTo or name more than one. Refuse before signing. */
  payToConflict?: boolean;
};

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
  const v1Network = v1NetworkName(want.network);
  let bestAtomic: bigint | null = null;
  let pinned: string | undefined;
  let conflict = false;
  let matched = false;
  for (const a of accepts) {
    if (!a || typeof a !== "object") continue;
    const net = String(a.network ?? "");
    if (net !== want.network && net !== v1Network) continue;
    if (String(a.asset ?? "").toLowerCase() !== want.asset.toLowerCase()) continue;
    const raw = String(a.amount ?? a.maxAmountRequired ?? "");
    if (!/^\d{1,30}$/.test(raw)) return null; // malformed price in a matching entry ⇒ unknown
    matched = true;
    const atomic = BigInt(raw);
    if (bestAtomic == null || atomic > bestAtomic) bestAtomic = atomic;
    const addr = typeof a.payTo === "string" ? a.payTo.trim() : "";
    if (!ADDR_RE.test(addr)) conflict = true;
    else if (pinned && pinned.toLowerCase() !== addr.toLowerCase()) conflict = true;
    else pinned = addr;
  }
  if (!matched || bestAtomic == null) return null;
  if (conflict || !pinned) {
    return { atomic: bestAtomic, network: want.network, asset: want.asset, payToConflict: true };
  }
  return { atomic: bestAtomic, network: want.network, asset: want.asset, payTo: pinned };
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function v1NetworkName(caip2: string): string {
  if (caip2 === "eip155:8453") return "base";
  if (caip2 === "eip155:84532") return "base-sepolia";
  return "";
}

export function networksEquivalent(got: string, want: string): boolean {
  if (got === want) return true;
  const v1 = v1NetworkName(want);
  return v1 !== "" && got === v1;
}

/**
 * fetch wrapper handed to wrapFetchWithPayment: on the unpaid 402 it calls
 * `onQuote` (which may throw to refuse) before the x402 client builds a payment.
 */
function headerValue(init: RequestInit | undefined, name: string): string | null {
  if (!init?.headers) return null;
  try {
    return new Headers(init.headers).get(name);
  } catch {
    return null;
  }
}

/** Raw PAYMENT-SIGNATURE (v2) or X-PAYMENT (v1) on an outgoing retry, if any. */
export function paymentHeaderValue(init: RequestInit | undefined): string | null {
  return headerValue(init, "payment-signature") ?? headerValue(init, "x-payment");
}

export type SignedPaymentFields = {
  amountAtomic: bigint;
  payTo: string;
  network: string;
  asset?: string;
};

function parseAtomic(v: unknown): bigint | null {
  if (typeof v === "bigint") return v >= 0n ? v : null;
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{1,30}$/.test(s)) return BigInt(s);
  if (/^0x[0-9a-fA-F]{1,64}$/.test(s)) return BigInt(s);
  return null;
}

function sameAddr(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Decode a signed x402 payment header. Returns null when amount, payTo or
 * network cannot be read, or when the header's own fields disagree.
 */
export function parseSignedPayment(headerValue: string): SignedPaymentFields | null {
  const doc = decodeHeaderJson(headerValue.trim()) as {
    network?: unknown;
    accepted?: Accept;
    payload?: {
      authorization?: { to?: unknown; value?: unknown };
      permit2Authorization?: { permitted?: { token?: unknown; amount?: unknown } };
      permit2?: { permitted?: { token?: unknown; amount?: unknown } };
    };
  } | null;
  if (!doc || typeof doc !== "object") return null;
  const accepted = doc.accepted ?? {};
  const auth = doc.payload?.authorization ?? {};
  const permit = doc.payload?.permit2Authorization?.permitted ?? doc.payload?.permit2?.permitted;

  const amounts = [auth.value, permit?.amount, accepted.amount, accepted.maxAmountRequired]
    .map(parseAtomic)
    .filter((v): v is bigint => v != null);
  if (amounts.length === 0) return null;
  if (!amounts.every((a) => a === amounts[0])) return null;

  const payees = [auth.to, accepted.payTo].filter((v): v is string => typeof v === "string" && ADDR_RE.test(v.trim()));
  if (payees.length === 0) return null;
  if (!payees.every((p) => sameAddr(p, payees[0]!))) return null;

  const network = String(accepted.network ?? doc.network ?? "").trim();
  if (!network) return null;

  const assetRaw = typeof accepted.asset === "string" ? accepted.asset.trim() : "";
  return {
    amountAtomic: amounts[0]!,
    payTo: payees[0]!.trim(),
    network,
    asset: ADDR_RE.test(assetRaw) ? assetRaw : undefined,
  };
}

/**
 * Empty string when the signed header matches the pinned reservation.
 * Otherwise a short reason. Unreadable headers do not match.
 */
export function signedPaymentMismatch(
  header: string,
  expected: { atomic: bigint; payTo: string; network: string; asset?: string },
): string {
  const signed = parseSignedPayment(header);
  if (!signed) return "payment header is missing amount, payTo or network";
  if (signed.amountAtomic !== expected.atomic) {
    return `amount ${signed.amountAtomic} != reserved ${expected.atomic}`;
  }
  if (!sameAddr(signed.payTo, expected.payTo)) {
    return `payTo ${signed.payTo} != pinned ${expected.payTo}`;
  }
  if (!networksEquivalent(signed.network, expected.network)) {
    return `network ${signed.network} != ${expected.network}`;
  }
  if (
    expected.asset &&
    signed.asset &&
    !sameAddr(signed.asset, expected.asset)
  ) {
    return `asset ${signed.asset} != ${expected.asset}`;
  }
  return "";
}

export function quoteGuardedFetch(
  inner: typeof fetch,
  want: { network: string; asset: string },
  onQuote: (q: PriceQuote | null) => void,
  /** Called with the outgoing init BEFORE the signed retry is sent. Throw to refuse. */
  onSignedPayment?: (init: RequestInit | undefined) => void,
): typeof fetch {
  let quoted = false;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (onSignedPayment && paymentHeaderValue(init)) onSignedPayment(init);
    const res = await inner(input, init);
    if (res.status === 402 && !quoted) {
      quoted = true;
      onQuote(await quoteFrom402(res, want));
    }
    return res;
  }) as typeof fetch;
}

// ── reservations ────────────────────────────────────────────────────────────
function isBaseNetwork(network: string | undefined): boolean {
  return network == null || network === "" || network === "eip155:8453" || network === "eip155:84532";
}

/** Open (unsettled, unreleased) reservations from today (UTC). */
export function openReservedTodayAtomic(
  events: readonly LedgerEvent[],
  now = new Date(),
  opts?: { baseOnly?: boolean },
): bigint {
  const day = now.toISOString().slice(0, 10);
  const closed = new Set<string>();
  for (const e of events) {
    if (e.type === "reservation_released") closed.add(e.reservationId);
    else if (e.type === "payment" && e.reservationId) closed.add(e.reservationId);
  }
  let sum = 0n;
  for (const e of events) {
    if (e.type !== "reserved" || closed.has(e.reservationId)) continue;
    if (opts?.baseOnly && !isBaseNetwork(e.network)) continue;
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

/** Open Base-rail reservations (today, UTC). Tempo's cap adds these. */
export function openBaseReservedTodayAtomic(events: readonly LedgerEvent[], now = new Date()): bigint {
  return openReservedTodayAtomic(events, now, { baseOnly: true });
}

/** Settled payments + open reservations for today, treasurer wallet only. */
export function committedTodayAtomic(events: readonly LedgerEvent[], now = new Date()): bigint {
  return sumSpentTodayAtomic([...events], now, TREASURER_WALLET_ADDRESS) + openReservedTodayAtomic(events, now);
}

export function reserve(
  ledger: LedgerStore,
  opts: { endpoint: string; atomic: bigint; network: string; holdId?: string; payTo?: string },
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
    payTo: opts.payTo,
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
