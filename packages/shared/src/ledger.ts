/**
 * Append-only ledger event shapes (JSONL).
 * Framing: operating spend for services — never "treasury growth".
 *
 * Takeover types (held / denied / expired / frozen / unfrozen) are reserved
 * in the schema so parsers and summaries can ignore them until writers land.
 * Do not invent hold/freeze behavior here — step 1 is type + default only.
 */

/** Default when a row omits `type` (backward compatible with early payment rows). */
export const DEFAULT_LEDGER_EVENT_TYPE = "payment" as const;

export type LedgerEventType =
  | "allowance_set"
  | "top_up"
  | "revocation"
  | "payment"
  | "payment_failed"
  | "wallet_address"
  | "note"
  // Takeover (writers land in later PRs)
  | "held"
  | "denied"
  | "expired"
  | "frozen"
  | "unfrozen";

export interface LedgerEventBase {
  type: LedgerEventType;
  timestamp: string;
  reason?: string;
  walletAddress?: string;
}

export interface AllowanceSetEvent extends LedgerEventBase {
  type: "allowance_set";
  maxPerPaymentUsdc: string;
  dailyCapUsdc: string;
  allowlist: string[];
}

export interface TopUpEvent extends LedgerEventBase {
  type: "top_up";
  amountUsdc: string;
  txHash?: string;
  basescanUrl?: string;
}

export interface RevocationEvent extends LedgerEventBase {
  type: "revocation";
  detail: string;
}

export interface PaymentEvent extends LedgerEventBase {
  type: "payment";
  endpoint: string;
  amountUsdc: string;
  asset: "USDC";
  network: "eip155:8453" | "eip155:84532";
  txHash?: string;
  basescanUrl?: string;
  /** Present when payment followed an operator-approved hold (later). */
  holdId?: string;
  approvedBy?: string;
}

export interface PaymentFailedEvent extends LedgerEventBase {
  type: "payment_failed";
  endpoint: string;
  amountUsdc?: string;
  error: string;
}

export interface WalletAddressEvent extends LedgerEventBase {
  type: "wallet_address";
  walletAddress: string;
}

export interface NoteEvent extends LedgerEventBase {
  type: "note";
  message: string;
}

/** Schema reserved for takeover hold threshold — no writer in this PR. */
export interface HeldEvent extends LedgerEventBase {
  type: "held";
  holdId: string;
  endpoint: string;
  amountUsdc: string;
  asset?: "USDC";
  network?: "eip155:8453" | "eip155:84532";
}

/** Schema reserved for operator deny — no writer in this PR. */
export interface DeniedEvent extends LedgerEventBase {
  type: "denied";
  holdId: string;
}

/** Schema reserved for hold TTL expiry — no writer in this PR. */
export interface ExpiredEvent extends LedgerEventBase {
  type: "expired";
  holdId: string;
}

/** Schema reserved for operator freeze — no writer in this PR. */
export interface FrozenEvent extends LedgerEventBase {
  type: "frozen";
}

/** Schema reserved for operator unfreeze — no writer in this PR. */
export interface UnfrozenEvent extends LedgerEventBase {
  type: "unfrozen";
}

export type LedgerEvent =
  | AllowanceSetEvent
  | TopUpEvent
  | RevocationEvent
  | PaymentEvent
  | PaymentFailedEvent
  | WalletAddressEvent
  | NoteEvent
  | HeldEvent
  | DeniedEvent
  | ExpiredEvent
  | FrozenEvent
  | UnfrozenEvent;

/**
 * True for spend that counts toward payment totals / daily cap.
 * Missing or empty `type` counts as `payment` for backward compatibility.
 * Unknown / takeover types are ignored.
 */
export function isPaymentEvent(e: { type?: string }): e is PaymentEvent {
  const t = e.type == null || e.type === "" ? DEFAULT_LEDGER_EVENT_TYPE : e.type;
  return t === "payment";
}

/** Ensure every row has an explicit `type` (default `payment`). */
export function normalizeLedgerEvent(raw: unknown): LedgerEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const type =
    typeof obj.type === "string" && obj.type.length > 0
      ? obj.type
      : DEFAULT_LEDGER_EVENT_TYPE;
  if (typeof obj.timestamp !== "string" || !obj.timestamp) return null;
  return { ...obj, type } as LedgerEvent;
}

/** Stable identity for union-merge (tx hash when present; otherwise full row). */
export function ledgerEventKey(e: LedgerEvent): string {
  if ((e.type === "payment" || e.type === "top_up") && "txHash" in e && e.txHash) {
    return `${e.type}:${e.txHash.toLowerCase()}`;
  }
  if (
    (e.type === "held" || e.type === "denied" || e.type === "expired") &&
    "holdId" in e &&
    e.holdId
  ) {
    return `${e.type}:${e.holdId}`;
  }
  if (e.type === "wallet_address" && e.walletAddress) {
    return `${e.type}:${e.walletAddress.toLowerCase()}`;
  }
  return JSON.stringify(e);
}

export function parseLedgerJsonl(raw: string): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const normalized = normalizeLedgerEvent(JSON.parse(t));
      if (normalized) events.push(normalized);
    } catch {
      /* skip corrupt lines */
    }
  }
  return events;
}

export function serializeLedgerJsonl(events: LedgerEvent[]): string {
  if (events.length === 0) return "";
  return (
    events
      .map((e) =>
        JSON.stringify({
          ...e,
          type: e.type ?? DEFAULT_LEDGER_EVENT_TYPE,
        }),
      )
      .join("\n") + "\n"
  );
}

/** Prefer the record with more populated fields when keys collide. */
function richer(a: LedgerEvent, b: LedgerEvent): LedgerEvent {
  const score = (e: LedgerEvent) => JSON.stringify(e).length;
  return score(b) > score(a) ? b : a;
}

/** Union events from one or more logs; sort by timestamp. Later lists overwrite on richer. */
export function mergeLedgerEvents(...lists: LedgerEvent[][]): LedgerEvent[] {
  const map = new Map<string, LedgerEvent>();
  for (const list of lists) {
    for (const e of list) {
      const normalized = normalizeLedgerEvent(e);
      if (!normalized) continue;
      const k = ledgerEventKey(normalized);
      const prev = map.get(k);
      map.set(k, prev ? richer(prev, normalized) : normalized);
    }
  }
  return [...map.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Strip query/hash so the same resource is one destination. */
export function resourceEndpoint(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "") || url;
  } catch {
    return url.replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}
