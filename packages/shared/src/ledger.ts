/**
 * Append-only ledger event shapes (JSONL).
 * Framing: operating spend for services — never "treasury growth".
 *
 * Takeover: held / denied / expired written by treasurer hold threshold (step 3).
 * frozen / unfrozen written by treasurer operator freeze API (step 2).
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
  // Takeover (freeze + hold writers in treasurer)
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
  /** Present when payment followed an operator-approved hold. */
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

/** Hold threshold — treasurer writes when amount ≥ HOLD_ABOVE_USDC. */
export interface HeldEvent extends LedgerEventBase {
  type: "held";
  holdId: string;
  endpoint: string;
  amountUsdc: string;
  asset?: "USDC";
  network?: "eip155:8453" | "eip155:84532";
}

/** Operator deny of a pending hold. */
export interface DeniedEvent extends LedgerEventBase {
  type: "denied";
  holdId: string;
}

/** Hold TTL auto-deny (mandatory; default HOLD_TTL_SECONDS=3600). */
export interface ExpiredEvent extends LedgerEventBase {
  type: "expired";
  holdId: string;
}

/** Operator freeze — stops outbound treasurer payments until unfrozen. */
export interface FrozenEvent extends LedgerEventBase {
  type: "frozen";
}

/** Operator unfreeze — resumes outbound treasurer payments. */
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


/**
 * Freeze state from the append-only ledger: last `frozen` without a later
 * `unfrozen` means outbound payments must halt. Restarts honor this.
 */
export function isFrozenFromLedger(events: readonly { type?: string }[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i]?.type;
    if (t === "frozen") return true;
    if (t === "unfrozen") return false;
  }
  return false;
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

/** Message substring that marks day-one launch truncate on the public ledger. */
export const LAUNCH_GENESIS_RESET_MESSAGE = "LAUNCH_GENESIS_RESET";

/**
 * Find the LAUNCH_GENESIS_RESET note (earliest if several).
 * Used to cut pre-reset phantoms out of union-merge inputs.
 */
export function findLaunchGenesisResetMarker(
  events: readonly LedgerEvent[],
): NoteEvent | undefined {
  const markers = events.filter(
    (e): e is NoteEvent =>
      e.type === "note" &&
      typeof e.message === "string" &&
      e.message.includes(LAUNCH_GENESIS_RESET_MESSAGE),
  );
  if (markers.length === 0) return undefined;
  return [...markers].sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
}

/**
 * Drop events timestamped strictly before the LAUNCH_GENESIS_RESET marker.
 *
 * Rule: keep event iff `event.timestamp >= marker.timestamp`.
 * No marker → return `events` unchanged.
 *
 * Intended for merge/push only — callers must not rewrite Render disk with
 * the filtered list. Remote genesis rows that pre-date the marker stay via
 * the remote side of the union; local pre-marker phantoms are excluded.
 */
export function excludeEventsBeforeGenesisReset(
  events: readonly LedgerEvent[],
  marker: Pick<NoteEvent, "timestamp"> | undefined,
): LedgerEvent[] {
  if (!marker?.timestamp) return [...events];
  return events.filter((e) => e.timestamp >= marker.timestamp);
}

/**
 * Prepare local (disk) events for GitHub union-merge when a launch marker
 * exists on remote: strip anything before the marker timestamp.
 */
export function localEventsForGenesisAwareMerge(
  localEvents: readonly LedgerEvent[],
  remoteEvents: readonly LedgerEvent[],
): { marker: NoteEvent | undefined; localForMerge: LedgerEvent[] } {
  const marker = findLaunchGenesisResetMarker(remoteEvents);
  return {
    marker,
    localForMerge: excludeEventsBeforeGenesisReset(localEvents, marker),
  };
}
