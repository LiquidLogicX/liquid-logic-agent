/**
 * Takeover step 3 — hold threshold + approve/deny/expire.
 * State is append-only in the ledger (held → payment|denied|expired).
 */
import { randomUUID } from "node:crypto";
import { usdcToAtomic, type HeldEvent, type LedgerEvent } from "@liquid-logic/shared";
import type { LedgerStore } from "./ledger-store.js";

export const DEFAULT_HOLD_TTL_SECONDS = 3600;

/**
 * How long an `approving` hold may stay there before recovery.
 * Must be longer than a live settle. Default 15 minutes.
 * Override with HOLD_APPROVING_TTL_SECONDS (minimum 30).
 */
export const DEFAULT_APPROVING_TTL_SECONDS = 900;

export type HoldResolution =
  | "pending"
  | "approving"
  | "denied"
  | "expired"
  | "paid"
  | "needs_review";

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

export function loadApprovingTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.HOLD_APPROVING_TTL_SECONDS ?? "").trim();
  if (!raw) return DEFAULT_APPROVING_TTL_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 30) return DEFAULT_APPROVING_TTL_SECONDS;
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

/**
 * Fold one hold's rows. `approvingAt` is the timestamp of the approving row
 * that is still in effect (a later approve_failed clears it).
 */
export function foldHold(
  events: readonly LedgerEvent[],
  holdId: string,
): { status: HoldResolution | null; approvingAt: number | null } {
  let status: HoldResolution | null = null;
  let approvingAt: number | null = null;
  for (const e of events) {
    if (e.type === "held" && e.holdId === holdId) {
      status = "pending";
      approvingAt = null;
    } else if (e.type === "denied" && e.holdId === holdId) {
      status = "denied";
      approvingAt = null;
    } else if (e.type === "expired" && e.holdId === holdId) {
      status = "expired";
      approvingAt = null;
    } else if (e.type === "payment" && e.holdId === holdId) {
      status = "paid";
      approvingAt = null;
    } else if (e.type === "needs_review" && e.holdId === holdId) {
      status = "needs_review";
      approvingAt = null;
    } else if (e.type === "approving" && e.holdId === holdId && status === "pending") {
      status = "approving";
      const at = Date.parse(e.timestamp);
      approvingAt = Number.isFinite(at) ? at : null;
    } else if (e.type === "approve_failed" && e.holdId === holdId && status === "approving") {
      status = "pending";
      approvingAt = null;
    }
  }
  return { status, approvingAt: status === "approving" ? approvingAt : null };
}

export function getHoldResolution(
  events: readonly LedgerEvent[],
  holdId: string,
): HoldResolution | null {
  return foldHold(events, holdId).status;
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
 * Also recovers holds stuck in `approving` (see recoverStaleApprovals).
 * Mandatory: unanswered holds never wait forever.
 */
export function expireStaleHolds(
  ledger: LedgerStore,
  ttlSeconds: number = loadHoldTtlSeconds(),
  now = new Date(),
  approvingTtlSeconds: number = loadApprovingTtlSeconds(),
): string[] {
  recoverStaleApprovals(ledger, approvingTtlSeconds, now);
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

/**
 * Atomic pending → approving transition for a hold. Synchronous on purpose: the
 * read and the append happen in one turn of the event loop with no await in
 * between, so of N concurrent approvers in this process exactly one wins.
 * Returns the resolution that blocked the claim when it fails.
 */
export function claimHoldForApproval(
  ledger: LedgerStore,
  holdId: string,
  approvedBy: string,
): { ok: true } | { ok: false; resolution: HoldResolution | null } {
  const resolution = getHoldResolution(ledger.readAll(), holdId);
  if (resolution !== "pending") return { ok: false, resolution };
  ledger.append({
    type: "approving",
    holdId,
    approvedBy,
    timestamp: new Date().toISOString(),
  });
  return { ok: true };
}

/**
 * Approval finished and the spend was not submitted: hold goes back to pending.
 * No-op unless the hold is still `approving` (a needs_review hold stays there).
 */
export function releaseHoldApproval(ledger: LedgerStore, holdId: string, error: string): void {
  if (getHoldResolution(ledger.readAll(), holdId) !== "approving") return;
  ledger.append({
    type: "approve_failed",
    holdId,
    error: error.slice(0, 300),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Settlement is ambiguous or a reservation could not be closed safely.
 * Terminal: the hold cannot be approved again. Does not release a reservation.
 */
export function flagNeedsReview(
  ledger: LedgerStore,
  opts: { holdId?: string; reservationId?: string; error: string },
): void {
  ledger.append({
    type: "needs_review",
    holdId: opts.holdId,
    reservationId: opts.reservationId,
    error: opts.error.slice(0, 300),
    timestamp: new Date().toISOString(),
  });
}

function holdHasOpenReservation(events: readonly LedgerEvent[], holdId: string): boolean {
  const closed = new Set<string>();
  for (const e of events) {
    if (e.type === "reservation_released") closed.add(e.reservationId);
    else if (e.type === "payment" && e.reservationId) closed.add(e.reservationId);
  }
  return events.some(
    (e) => e.type === "reserved" && e.holdId === holdId && !closed.has(e.reservationId),
  );
}

/**
 * Recovery for holds stuck in `approving` (process died mid-approve).
 * - Open reservation: money may have moved → `needs_review`, reservation kept.
 * - No reservation: signing never started → back to pending, safe to retry.
 * In-flight approvals younger than `ttlSeconds` are left alone.
 * Returns the hold ids that were recovered.
 */
export function recoverStaleApprovals(
  ledger: LedgerStore,
  ttlSeconds: number = loadApprovingTtlSeconds(),
  now = new Date(),
): string[] {
  const events = ledger.readAll();
  const ids = new Set<string>();
  for (const e of events) {
    if (e.type === "approving") ids.add(e.holdId);
  }
  const recovered: string[] = [];
  const nowMs = now.getTime();
  for (const holdId of ids) {
    const folded = foldHold(events, holdId);
    if (folded.status !== "approving" || folded.approvingAt == null) continue;
    if (folded.approvingAt + ttlSeconds * 1000 > nowMs) continue;
    if (holdHasOpenReservation(events, holdId)) {
      flagNeedsReview(ledger, {
        holdId,
        error: `approving for over ${ttlSeconds}s with an open reservation — kept for review`,
      });
    } else {
      releaseHoldApproval(
        ledger,
        holdId,
        `approving for over ${ttlSeconds}s with no reservation — returned to pending`,
      );
    }
    recovered.push(holdId);
  }
  return recovered;
}

export function listNeedsReviewHolds(
  events: readonly LedgerEvent[],
): { holdId: string; error?: string }[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.type === "held" && !seen.has(e.holdId)) {
      seen.add(e.holdId);
      ids.push(e.holdId);
    }
  }
  const out: { holdId: string; error?: string }[] = [];
  for (const holdId of ids) {
    if (getHoldResolution(events, holdId) !== "needs_review") continue;
    let error: string | undefined;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e?.type === "needs_review" && e.holdId === holdId) {
        error = e.error;
        break;
      }
    }
    out.push({ holdId, error });
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
