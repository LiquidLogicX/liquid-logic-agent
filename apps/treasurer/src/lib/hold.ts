/**
 * Takeover step 3 — hold threshold + approve/deny/expire.
 * State is append-only in the ledger (held → payment|denied|expired).
 */
import { randomUUID } from "node:crypto";
import { usdcToAtomic, type HeldEvent, type LedgerEvent } from "@liquid-logic/shared";
import type { LedgerStore } from "./ledger-store.js";

export const DEFAULT_HOLD_TTL_SECONDS = 3600;

export type HoldResolution = "pending" | "denied" | "expired" | "paid";

export type PendingHold = {
  holdId: string;
  endpoint: string;
  amountUsdc: string;
  timestamp: string;
  expiresAt: string;
  reason?: string;
  network?: HeldEvent["network"];
};

export function loadHoldTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.HOLD_TTL_SECONDS ?? "").trim();
  if (!raw) return DEFAULT_HOLD_TTL_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_HOLD_TTL_SECONDS;
  return Math.floor(n);
}

/**
 * Unset / empty HOLD_ABOVE_USDC ⇒ holds disabled (pay as today).
 * Returns null when disabled.
 */
export function loadHoldAboveUsdc(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = (env.HOLD_ABOVE_USDC ?? "").trim();
  if (!raw) return null;
  // Validate early so misconfig fails closed at load/compare time.
  usdcToAtomic(raw);
  return raw;
}

export function amountMeetsHoldThreshold(
  amountUsdc: string,
  holdAboveUsdc: string,
): boolean {
  return usdcToAtomic(amountUsdc) >= usdcToAtomic(holdAboveUsdc);
}

export function getHoldResolution(
  events: readonly LedgerEvent[],
  holdId: string,
): HoldResolution | null {
  let status: HoldResolution | null = null;
  for (const e of events) {
    if (e.type === "held" && e.holdId === holdId) status = "pending";
    else if (e.type === "denied" && e.holdId === holdId) status = "denied";
    else if (e.type === "expired" && e.holdId === holdId) status = "expired";
    else if (e.type === "payment" && e.holdId === holdId) status = "paid";
  }
  return status;
}

export function findHeldEvent(
  events: readonly LedgerEvent[],
  holdId: string,
): HeldEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === "held" && e.holdId === holdId) return e;
  }
  return null;
}

export function listPendingHolds(
  ledger: LedgerStore,
  ttlSeconds: number = loadHoldTtlSeconds(),
  now = new Date(),
): PendingHold[] {
  const events = ledger.readAll();
  const out: PendingHold[] = [];
  for (const e of events) {
    if (e.type !== "held") continue;
    if (getHoldResolution(events, e.holdId) !== "pending") continue;
    const heldAt = Date.parse(e.timestamp);
    const expiresAtMs =
      (Number.isFinite(heldAt) ? heldAt : now.getTime()) + ttlSeconds * 1000;
    out.push({
      holdId: e.holdId,
      endpoint: e.endpoint,
      amountUsdc: e.amountUsdc,
      timestamp: e.timestamp,
      expiresAt: new Date(expiresAtMs).toISOString(),
      reason: e.reason,
      network: e.network,
    });
  }
  return out;
}

export function recordHeld(
  ledger: LedgerStore,
  opts: {
    endpoint: string;
    amountUsdc: string;
    network: HeldEvent["network"];
    reason?: string;
    holdId?: string;
    timestamp?: string;
  },
): HeldEvent {
  const event: HeldEvent = {
    type: "held",
    holdId: opts.holdId ?? randomUUID(),
    timestamp: opts.timestamp ?? new Date().toISOString(),
    endpoint: opts.endpoint,
    amountUsdc: opts.amountUsdc,
    asset: "USDC",
    network: opts.network,
    reason:
      opts.reason ??
      `Hold: amount ${opts.amountUsdc} USDC at/above HOLD_ABOVE_USDC`,
  };
  ledger.append(event);
  return event;
}

export function recordDenied(
  ledger: LedgerStore,
  opts: { holdId: string; reason?: string },
): { type: "denied"; holdId: string; timestamp: string; reason?: string } {
  const event = {
    type: "denied" as const,
    holdId: opts.holdId,
    timestamp: new Date().toISOString(),
    reason: opts.reason ?? "Operator denied hold",
  };
  ledger.append(event);
  return event;
}

export function recordExpired(
  ledger: LedgerStore,
  opts: { holdId: string; reason?: string },
): { type: "expired"; holdId: string; timestamp: string; reason?: string } {
  const event = {
    type: "expired" as const,
    holdId: opts.holdId,
    timestamp: new Date().toISOString(),
    reason: opts.reason ?? "Hold TTL elapsed — auto-deny",
  };
  ledger.append(event);
  return event;
}

/**
 * Append `expired` for any pending hold past TTL. Returns expired holdIds.
 * Mandatory: unanswered holds never wait forever.
 */
export function expireStaleHolds(
  ledger: LedgerStore,
  ttlSeconds: number = loadHoldTtlSeconds(),
  now = new Date(),
): string[] {
  const pending = listPendingHolds(ledger, ttlSeconds, now);
  const expiredIds: string[] = [];
  const nowMs = now.getTime();
  for (const h of pending) {
    if (Date.parse(h.expiresAt) <= nowMs) {
      recordExpired(ledger, { holdId: h.holdId });
      expiredIds.push(h.holdId);
    }
  }
  return expiredIds;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
