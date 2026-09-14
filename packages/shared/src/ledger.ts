/**
 * Append-only ledger event shapes (JSONL).
 * Framing: operating spend for services — never "treasury growth".
 */

export type LedgerEventType =
  | "allowance_set"
  | "top_up"
  | "revocation"
  | "payment"
  | "payment_failed"
  | "wallet_address"
  | "note";

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

export type LedgerEvent =
  | AllowanceSetEvent
  | TopUpEvent
  | RevocationEvent
  | PaymentEvent
  | PaymentFailedEvent
  | WalletAddressEvent
  | NoteEvent;

export function isPaymentEvent(e: LedgerEvent): e is PaymentEvent {
  return e.type === "payment";
}

/** Stable identity for union-merge (tx hash when present; otherwise full row). */
export function ledgerEventKey(e: LedgerEvent): string {
  if ((e.type === "payment" || e.type === "top_up") && "txHash" in e && e.txHash) {
    return `${e.type}:${e.txHash.toLowerCase()}`;
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
      events.push(JSON.parse(t) as LedgerEvent);
    } catch {
      /* skip corrupt lines */
    }
  }
  return events;
}

export function serializeLedgerJsonl(events: LedgerEvent[]): string {
  if (events.length === 0) return "";
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
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
      const k = ledgerEventKey(e);
      const prev = map.get(k);
      map.set(k, prev ? richer(prev, e) : e);
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
