import {
  DEFAULT_TREASURER_POLICY,
  NETWORK_BASE,
  NETWORK_BASE_SEPOLIA,
  USDC_BASE_MAINNET,
  USDC_BASE_SEPOLIA,
  parseAllowlist,
  usdcToAtomic,
} from "@liquid-logic/shared";
import path from "node:path";
import {
  DEFAULT_HOLD_TTL_SECONDS,
  loadApprovingTtlSeconds,
  loadHoldAboveUsdc,
  loadHoldTtlSeconds,
} from "./hold.js";

export interface TreasurerConfig {
  /** Omit / empty = Base mainnet. "development" = Base Sepolia (local testing only). */
  environment: "production" | "development";
  ledgerPath: string;
  allowlist: string[];
  maxPerPaymentUsdc: string;
  dailyCapUsdc: string;
  maxPerPaymentAtomic: bigint;
  dailyCapAtomic: bigint;
  usdcAddress: typeof USDC_BASE_MAINNET | typeof USDC_BASE_SEPOLIA;
  network: typeof NETWORK_BASE | typeof NETWORK_BASE_SEPOLIA;
  walletAccountName: string;
  /**
   * Unset = holds disabled (pay as today).
   * When set, amounts at/above this USDC value are held for operator approve/deny/expire.
   */
  holdAboveUsdc: string | null;
  /** Mandatory TTL for unanswered holds (default 3600). Auto-deny → ledger type `expired`. */
  holdTtlSeconds: number;
  /**
   * How long a hold may stay in `approving` before recovery (default 900).
   * Longer than a live settle. HOLD_APPROVING_TTL_SECONDS.
   */
  approvingTtlSeconds: number;
  /**
   * When set (TREASURER_PAY_TO), the 402 payTo must equal this address.
   * Unset: pin whatever unanimous payTo the 402 names, and require the
   * signed header to pay that address.
   */
  expectedPayTo: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TreasurerConfig {
  const rawEnv = (env.CDP_X402_ENVIRONMENT ?? "").trim().toLowerCase();
  const environment: "production" | "development" =
    rawEnv === "development" ? "development" : "production";

  // Fail-closed: empty TREASURER_ALLOWLIST means pay nothing.
  // Caps fall back to the published production policy (same numbers as Render).
  const allowlist = parseAllowlist(env.TREASURER_ALLOWLIST);

  const maxPerPaymentUsdc =
    env.TREASURER_MAX_PER_PAYMENT_USDC ?? DEFAULT_TREASURER_POLICY.maxPerPaymentUsdc;
  const dailyCapUsdc =
    env.TREASURER_DAILY_CAP_USDC ?? DEFAULT_TREASURER_POLICY.dailyCapUsdc;

  const ledgerPath = path.resolve(
    env.TREASURER_LEDGER_PATH ?? "./data/ledger.jsonl",
  );

  const isDev = environment === "development";
  const holdAboveUsdc = loadHoldAboveUsdc(env);
  const holdTtlSeconds = loadHoldTtlSeconds(env);
  const approvingTtlSeconds = loadApprovingTtlSeconds(env);
  const expectedPayTo = loadExpectedPayTo(env);

  return {
    environment,
    ledgerPath,
    allowlist,
    maxPerPaymentUsdc,
    dailyCapUsdc,
    maxPerPaymentAtomic: usdcToAtomic(maxPerPaymentUsdc),
    dailyCapAtomic: usdcToAtomic(dailyCapUsdc),
    usdcAddress: isDev ? USDC_BASE_SEPOLIA : USDC_BASE_MAINNET,
    network: isDev ? NETWORK_BASE_SEPOLIA : NETWORK_BASE,
    walletAccountName: env.TREASURER_WALLET_ACCOUNT_NAME ?? "x402-client-wallet-1",
    holdAboveUsdc,
    holdTtlSeconds:
      Number.isFinite(holdTtlSeconds) && holdTtlSeconds >= 1
        ? holdTtlSeconds
        : DEFAULT_HOLD_TTL_SECONDS,
    approvingTtlSeconds,
    expectedPayTo,
  };
}

function loadExpectedPayTo(env: NodeJS.ProcessEnv): string | null {
  const raw = (env.TREASURER_PAY_TO ?? "").trim();
  if (!raw) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    throw new Error("TREASURER_PAY_TO must be a 0x address (42 chars) when set");
  }
  return raw;
}
