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
  };
}
