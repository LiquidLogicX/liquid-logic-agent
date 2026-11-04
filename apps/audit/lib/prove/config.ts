/**
 * /api/prove configuration. Price lives in @liquid-logic/shared
 * (PROVE_PRICE_USDC / PROVE_PRICE_LABEL) — the single config constant.
 *
 * Env (Vercel):
 *   RECORDER_API_KEY   required — server-to-server key for arc-settlement-recorder
 *   RECORDER_URL       optional — default https://arc-settlement-recorder.onrender.com (must be https)
 *   BASE_RPC_URL       optional — Base JSON-RPC for receipt lookups (default https://mainnet.base.org)
 *   RECORDER_MIN_GAS_WEI optional — low-balance threshold (18-dec native USDC wei on Arc)
 */
import { NETWORK_ARC, NETWORK_BASE, USDC_BASE_MAINNET } from "@liquid-logic/shared";

export const PROVE_SOURCE_CHAIN = NETWORK_BASE; // eip155:8453
/** Arc mainnet — matches recorder/web code (chain id 5042 = rpc.mainnet.arc.io eth_chainId 0x13b2). */
export const PROVE_ARC_CHAIN = NETWORK_ARC; // eip155:5042
export const SETTLEMENT_PROOFS_ARC = "0x1de52cbc4490a7873ef007e51cb91a5b374facb1" as const;
export const BASE_USDC = USDC_BASE_MAINNET;
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export const DEFAULT_RECORDER_URL = "https://arc-settlement-recorder.onrender.com";
export const DEFAULT_BASE_RPC_URL = "https://mainnet.base.org";
export const VERIFIER_BASE_URL = "https://proofs.liquidlogicx.com";

/**
 * Chain-time age required before /api/prove will record a Base payment.
 * `block.timestamp` stays in seconds, so this does not shrink when Base
 * Denim cuts block time from 2s to 200ms (mainnet 2026-11-05 18:00 UTC).
 * Same threshold as arc-settlement-recorder (`BASE_MIN_SETTLEMENT_SECONDS`).
 */
export const MIN_BASE_SETTLEMENT_SECONDS = 60;
/**
 * Extra confirmation floor on top of the time / L1-safe rule.
 * At the post-Denim 200ms cadence, 300 blocks is 60 seconds. It is not a
 * substitute for {@link MIN_BASE_SETTLEMENT_SECONDS}: a payment still has to
 * be 60s old or at/behind the `safe` head. 12 blocks is ~2.4s after Denim
 * and is not a wait.
 */
export const MIN_BASE_CONFIRMATIONS = 300;
/** 0.05 native USDC (18-dec) — same default as the recorder's MIN_RECORDER_GAS_WEI. */
export const DEFAULT_RECORDER_MIN_GAS_WEI = 50_000_000_000_000_000n;

export const MEMO_MAX_CHARS = 64;
export const RECORDER_TIMEOUT_MS = 45_000;
export const BASE_RPC_TIMEOUT_MS = 10_000;

/**
 * Public verify link. proofs.liquidlogicx.com has no numeric /proofs/<n> route
 * (404), so link the search page with the refId — it renders "Found" for a
 * recorded proof and never 404s.
 */
export function verifyUrlFor(refId: string): string {
  return `${VERIFIER_BASE_URL}/proofs?q=${refId}`;
}

export type ProveEnv = {
  recorderUrl: string;
  recorderApiKey: string | null;
  baseRpcUrl: string;
  minGasWei: bigint;
};

export function loadProveEnv(env: Record<string, string | undefined> = process.env): ProveEnv {
  const recorderUrl = (env.RECORDER_URL?.trim() || DEFAULT_RECORDER_URL).replace(/\/+$/, "");
  if (!/^https:\/\//i.test(recorderUrl)) {
    throw new Error("RECORDER_URL must be https:// (server-to-server over TLS)");
  }
  const rawGas = env.RECORDER_MIN_GAS_WEI?.trim();
  return {
    recorderUrl,
    recorderApiKey: env.RECORDER_API_KEY?.trim() || null,
    baseRpcUrl: env.BASE_RPC_URL?.trim() || DEFAULT_BASE_RPC_URL,
    minGasWei: rawGas && /^\d+$/.test(rawGas) ? BigInt(rawGas) : DEFAULT_RECORDER_MIN_GAS_WEI,
  };
}
