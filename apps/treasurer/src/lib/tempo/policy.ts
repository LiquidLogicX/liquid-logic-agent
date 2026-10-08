/**
 * Treasurer policy for the Tempo rail: same rules as the Base rail, applied to
 * the LLX Tempo payer wallet.
 *
 *   freeze      → refuse (operator freeze halts every outbound payment, both rails)
 *   allowlist   → payee must be on TREASURER_TEMPO_ALLOWLIST (addresses, fail closed)
 *   max/payment → refuse above TREASURER_TEMPO_MAX_PER_PAYMENT_USDC
 *   daily cap   → refuse when today's (UTC) Tempo spend + amount > TREASURER_TEMPO_DAILY_CAP_USDC
 *   hold        → amounts at/above TREASURER_TEMPO_HOLD_ABOVE_USDC are held for approval
 *                 (same "at/above" rule as Base HOLD_ABOVE_USDC)
 *
 * Pure: the ledger rows and clock are passed in, so tests need no chain.
 */
import type { LedgerEvent } from "@liquid-logic/shared";
import { isFrozenFromLedger, isPaymentEvent } from "@liquid-logic/shared";
import type { Address } from "viem";
import { formatUsd6, parseUsd6 } from "./amount.js";
import type { TempoRailConfig } from "./config.js";

export type TempoPolicyDecision =
  | { decision: "allow"; reason: string; spentTodayAtomic: bigint; remainingAtomic: bigint }
  | { decision: "hold"; reason: string; spentTodayAtomic: bigint; remainingAtomic: bigint }
  | { decision: "refuse"; code: TempoRefusalCode; reason: string; spentTodayAtomic: bigint; remainingAtomic: bigint };

export type TempoRefusalCode =
  | "FROZEN"
  | "BAD_AMOUNT"
  | "PAYEE_NOT_ALLOWLISTED"
  | "OVER_MAX_PER_PAYMENT"
  | "OVER_DAILY_CAP";

type PolicyCfg = Pick<
  TempoRailConfig,
  | "network"
  | "payerAddress"
  | "allowlist"
  | "maxPerPaymentAtomic"
  | "dailyCapAtomic"
  | "holdAboveAtomic"
  | "tokenSymbol"
>;

/** Today's (UTC calendar day) Tempo spend by the Tempo payer, from ledger payment rows. */
export function tempoSpentTodayAtomic(
  events: readonly LedgerEvent[],
  cfg: Pick<TempoRailConfig, "network" | "payerAddress">,
  now = new Date(),
): bigint {
  const day = now.toISOString().slice(0, 10);
  const payer = cfg.payerAddress.toLowerCase();
  let sum = 0n;
  for (const e of events) {
    if (!isPaymentEvent(e)) continue;
    if (e.network !== cfg.network) continue;
    if ((e.walletAddress ?? "").toLowerCase() !== payer) continue;
    if (!e.timestamp.startsWith(day)) continue;
    try {
      sum += parseUsd6(e.amountUsdc);
    } catch {
      /* skip malformed */
    }
  }
  return sum;
}

export function isAllowlistedPayee(payee: string, allowlist: readonly Address[]): boolean {
  const p = payee.toLowerCase();
  return allowlist.some((a) => a.toLowerCase() === p);
}

export function evaluateTempoPayment(opts: {
  cfg: PolicyCfg;
  events: readonly LedgerEvent[];
  payee: string;
  amountUsdc: string;
  now?: Date;
  /** Operator approve path: the hold was already answered, re-check everything else. */
  skipHold?: boolean;
}): TempoPolicyDecision {
  const { cfg, events } = opts;
  const now = opts.now ?? new Date();
  const spentTodayAtomic = tempoSpentTodayAtomic(events, cfg, now);
  const remainingAtomic =
    spentTodayAtomic >= cfg.dailyCapAtomic ? 0n : cfg.dailyCapAtomic - spentTodayAtomic;
  const sym = cfg.tokenSymbol;
  const base = { spentTodayAtomic, remainingAtomic };

  if (isFrozenFromLedger(events)) {
    return { ...base, decision: "refuse", code: "FROZEN", reason: "Payments are frozen by the operator" };
  }

  let amount: bigint;
  try {
    amount = parseUsd6(opts.amountUsdc);
  } catch (err) {
    return { ...base, decision: "refuse", code: "BAD_AMOUNT", reason: err instanceof Error ? err.message : String(err) };
  }
  if (amount <= 0n) {
    return { ...base, decision: "refuse", code: "BAD_AMOUNT", reason: "Amount must be greater than 0" };
  }

  if (!isAllowlistedPayee(opts.payee, cfg.allowlist)) {
    return {
      ...base,
      decision: "refuse",
      code: "PAYEE_NOT_ALLOWLISTED",
      reason: `Payee ${opts.payee} is not on the Tempo allowlist`,
    };
  }

  if (amount > cfg.maxPerPaymentAtomic) {
    return {
      ...base,
      decision: "refuse",
      code: "OVER_MAX_PER_PAYMENT",
      reason: `${formatUsd6(amount)} ${sym} is over the ${formatUsd6(cfg.maxPerPaymentAtomic)} ${sym} per-payment cap`,
    };
  }

  if (spentTodayAtomic + amount > cfg.dailyCapAtomic) {
    return {
      ...base,
      decision: "refuse",
      code: "OVER_DAILY_CAP",
      reason: `Daily cap: ${formatUsd6(spentTodayAtomic)} of ${formatUsd6(cfg.dailyCapAtomic)} ${sym} spent today (UTC); ${formatUsd6(amount)} more would exceed it`,
    };
  }

  if (!opts.skipHold && amount >= cfg.holdAboveAtomic) {
    return {
      ...base,
      decision: "hold",
      reason: `${formatUsd6(amount)} ${sym} is at/above the ${formatUsd6(cfg.holdAboveAtomic)} ${sym} hold threshold; needs approval`,
    };
  }

  return {
    ...base,
    decision: "allow",
    reason: `Within policy: ${formatUsd6(amount)} ${sym} to an allowlisted payee, under the ${formatUsd6(cfg.maxPerPaymentAtomic)} ${sym} cap, ${formatUsd6(remainingAtomic - amount)} ${sym} left today`,
  };
}
