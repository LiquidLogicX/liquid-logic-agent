/**
 * Shared treasurer spend policy.
 *
 * Runtime authority on Render is TREASURER_* env (allowlist, max per payment,
 * UTC daily cap). This module is the published mirror of that production
 * policy so the public pre-flight endpoint and the treasurer CLI evaluate
 * the same rules. There is no per-endpoint cap.
 *
 * Spend remaining is summed from the public ledger — the same UTC calendar
 * day window as LedgerStore.spentTodayAtomic / treasurer pay().
 */
import {
  NETWORK_BASE,
  TREASURER_WALLET_ADDRESS,
  atomicToUsdc,
  usdcToAtomic,
} from "./constants.js";
import { isAllowlistedEndpoint } from "./guardrails.js";
import { isPaymentEvent, type LedgerEvent } from "./ledger.js";

export const TREASURER_SPENT_WINDOW = "utc_calendar_day" as const;

export interface TreasurerPolicy {
  walletAddress: string;
  allowlist: string[];
  maxPerPaymentUsdc: string;
  dailyCapUsdc: string;
  network: typeof NETWORK_BASE;
  asset: "USDC";
  spentWindow: typeof TREASURER_SPENT_WINDOW;
}

/** Production Render TREASURER_* as of 2026-09-14 (not a secret). */
export const DEFAULT_TREASURER_POLICY: TreasurerPolicy = {
  walletAddress: TREASURER_WALLET_ADDRESS,
  allowlist: [
    "https://audit.liquidlogicx.com/api/audit",
    "https://liquid-logic-agent-audit.vercel.app/api/audit",
    "https://x402uselessfacts.vercel.app/api/useless-fact",
  ],
  maxPerPaymentUsdc: "1.00",
  dailyCapUsdc: "10.00",
  network: NETWORK_BASE,
  asset: "USDC",
  spentWindow: TREASURER_SPENT_WINDOW,
};

export interface AllowanceReport {
  walletAddress: string;
  endpoint: string | null;
  allowed: boolean;
  reason: string;
  remainingUsdc: number;
  capUsdc: number;
  spentUsdc: number;
  maxPerPaymentUsdc: number;
  day: string;
  network: typeof NETWORK_BASE;
  asset: "USDC";
  source: "treasurer_policy";
  spentWindow: typeof TREASURER_SPENT_WINDOW;
  /** Present when an endpoint was supplied. */
  endpointAllowlisted?: boolean;
  /** Present when endpoint is omitted (wallet-level summary). */
  allowlist?: string[];
}

export function parseAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build policy from TREASURER_* env.
 * - allowlistFallback true (public pre-flight): empty env uses published defaults.
 * - allowlistFallback false (treasurer pay): empty env → empty allowlist (fail closed).
 */
export type EnvMap = { [key: string]: string | undefined };

export function treasurerPolicyFromEnv(
  env: EnvMap = {},
  opts: { allowlistFallback?: boolean } = {},
): TreasurerPolicy {
  const allowlistFallback = opts.allowlistFallback ?? true;
  const fromEnv = parseAllowlist(env.TREASURER_ALLOWLIST);
  const wallet =
    (env.AGENT_WALLET_ADDRESS ?? env.TREASURER_WALLET_ADDRESS ?? "").trim() ||
    DEFAULT_TREASURER_POLICY.walletAddress;
  return {
    walletAddress: wallet,
    allowlist:
      fromEnv.length > 0
        ? fromEnv
        : allowlistFallback
          ? DEFAULT_TREASURER_POLICY.allowlist
          : [],
    maxPerPaymentUsdc:
      env.TREASURER_MAX_PER_PAYMENT_USDC ??
      DEFAULT_TREASURER_POLICY.maxPerPaymentUsdc,
    dailyCapUsdc:
      env.TREASURER_DAILY_CAP_USDC ?? DEFAULT_TREASURER_POLICY.dailyCapUsdc,
    network: NETWORK_BASE,
    asset: "USDC",
    spentWindow: TREASURER_SPENT_WINDOW,
  };
}

/** UTC calendar-day spend — same window treasurer pay() enforces from the ledger. */
export function sumSpentTodayAtomic(
  events: LedgerEvent[],
  now = new Date(),
  walletAddress?: string,
): bigint {
  const day = now.toISOString().slice(0, 10);
  const want = walletAddress?.toLowerCase();
  let sum = 0n;
  for (const e of events) {
    if (!isPaymentEvent(e)) continue;
    if (!e.timestamp.startsWith(day)) continue;
    if (want && e.walletAddress && e.walletAddress.toLowerCase() !== want) {
      continue;
    }
    try {
      sum += usdcToAtomic(e.amountUsdc);
    } catch {
      /* skip malformed amounts */
    }
  }
  return sum;
}

function asUsdcNumber(atomic: bigint): number {
  return Number(atomicToUsdc(atomic));
}

export function evaluateAllowance(opts: {
  policy: TreasurerPolicy;
  events: LedgerEvent[];
  walletAddress: string;
  endpoint?: string | null;
  amountUsdc?: string | null;
  now?: Date;
}): AllowanceReport {
  const now = opts.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const policyWallet = opts.policy.walletAddress.toLowerCase();
  const queryWallet = opts.walletAddress.trim();
  const endpoint = (opts.endpoint ?? "").trim() || null;

  const capAtomic = usdcToAtomic(opts.policy.dailyCapUsdc);
  const maxAtomic = usdcToAtomic(opts.policy.maxPerPaymentUsdc);
  const capUsdc = asUsdcNumber(capAtomic);
  const maxPerPaymentUsdc = asUsdcNumber(maxAtomic);

  const base = {
    walletAddress: queryWallet,
    endpoint,
    network: opts.policy.network,
    asset: "USDC" as const,
    source: "treasurer_policy" as const,
    spentWindow: TREASURER_SPENT_WINDOW,
    day,
    maxPerPaymentUsdc,
  };

  if (!/^0x[a-fA-F0-9]{40}$/.test(queryWallet)) {
    return {
      ...base,
      allowed: false,
      reason: "wallet must be a 0x-prefixed 40-hex EVM address",
      remainingUsdc: 0,
      capUsdc: 0,
      spentUsdc: 0,
    };
  }

  if (queryWallet.toLowerCase() !== policyWallet) {
    return {
      ...base,
      allowed: false,
      reason: `No treasurer policy for this wallet. This pre-flight reports Liquid Logic Agent (${opts.policy.walletAddress}) remaining cap only.`,
      remainingUsdc: 0,
      capUsdc: 0,
      spentUsdc: 0,
    };
  }

  const spentAtomic = sumSpentTodayAtomic(
    opts.events,
    now,
    opts.policy.walletAddress,
  );
  const remainingAtomic = spentAtomic >= capAtomic ? 0n : capAtomic - spentAtomic;
  const spentUsdc = asUsdcNumber(spentAtomic);
  const remainingUsdc = asUsdcNumber(remainingAtomic);

  if (endpoint) {
    let parsedOk = true;
    try {
      const u = new URL(endpoint);
      parsedOk = u.protocol === "https:" || u.protocol === "http:";
    } catch {
      parsedOk = false;
    }
    if (!parsedOk) {
      return {
        ...base,
        allowed: false,
        reason: `Invalid endpoint URL: ${endpoint}`,
        remainingUsdc,
        capUsdc,
        spentUsdc,
        endpointAllowlisted: false,
      };
    }

    const endpointAllowlisted = isAllowlistedEndpoint(
      endpoint,
      opts.policy.allowlist,
    );
    if (!endpointAllowlisted) {
      return {
        ...base,
        allowed: false,
        reason: `Endpoint is not on the treasurer allowlist: ${endpoint}`,
        remainingUsdc,
        capUsdc,
        spentUsdc,
        endpointAllowlisted: false,
      };
    }

    if (remainingAtomic <= 0n) {
      return {
        ...base,
        allowed: false,
        reason: `Allowlisted, but the UTC daily cap is reached (${opts.policy.dailyCapUsdc} USDC on ${day}).`,
        remainingUsdc: 0,
        capUsdc,
        spentUsdc,
        endpointAllowlisted: true,
      };
    }

    const amountRaw = (opts.amountUsdc ?? "").trim();
    if (amountRaw) {
      let hint: bigint;
      try {
        hint = usdcToAtomic(amountRaw);
      } catch {
        return {
          ...base,
          allowed: false,
          reason: `Invalid USDC amount: ${amountRaw}`,
          remainingUsdc,
          capUsdc,
          spentUsdc,
          endpointAllowlisted: true,
        };
      }
      if (hint > maxAtomic) {
        return {
          ...base,
          allowed: false,
          reason: `Amount ${amountRaw} exceeds max per payment ${opts.policy.maxPerPaymentUsdc} USDC.`,
          remainingUsdc,
          capUsdc,
          spentUsdc,
          endpointAllowlisted: true,
        };
      }
      if (spentAtomic + hint > capAtomic) {
        return {
          ...base,
          allowed: false,
          reason: `Payment would exceed the UTC daily cap (${opts.policy.dailyCapUsdc} USDC).`,
          remainingUsdc,
          capUsdc,
          spentUsdc,
          endpointAllowlisted: true,
        };
      }
    }

    return {
      ...base,
      allowed: true,
      reason: `Allowlisted; ${atomicToUsdc(remainingAtomic)} USDC remaining under the UTC daily cap (${day}). Max per payment ${opts.policy.maxPerPaymentUsdc} USDC.`,
      remainingUsdc,
      capUsdc,
      spentUsdc,
      endpointAllowlisted: true,
    };
  }

  const allowlistEmpty = opts.policy.allowlist.length === 0;
  if (allowlistEmpty) {
    return {
      ...base,
      allowed: false,
      reason: "Treasurer allowlist is empty — no endpoints may be paid.",
      remainingUsdc,
      capUsdc,
      spentUsdc,
      allowlist: [],
    };
  }
  if (remainingAtomic <= 0n) {
    return {
      ...base,
      allowed: false,
      reason: `UTC daily cap reached (${opts.policy.dailyCapUsdc} USDC on ${day}).`,
      remainingUsdc: 0,
      capUsdc,
      spentUsdc,
      allowlist: [...opts.policy.allowlist],
    };
  }

  return {
    ...base,
    allowed: true,
    reason: `${atomicToUsdc(remainingAtomic)} USDC remaining under the UTC daily cap (${day}). ${opts.policy.allowlist.length} allowlisted endpoint(s). Max per payment ${opts.policy.maxPerPaymentUsdc} USDC.`,
    remainingUsdc,
    capUsdc,
    spentUsdc,
    allowlist: [...opts.policy.allowlist],
  };
}
