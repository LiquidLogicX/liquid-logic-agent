/**
 * Tempo rail config (second rail next to Base, off by default).
 *
 * Everything here is opt-in behind TREASURER_TEMPO_ENABLED=true. The Base rail
 * (CDP wallet + x402, `../config.ts`) does not read any of these variables and
 * is unchanged when they are set or unset.
 *
 * Secrets (never logged, never returned by any route):
 *   TEMPO_PAYER_PRIVATE_KEY   LLX Tempo payer key (Miles pastes it in Render)
 *   TREASURER_SERVICE_TOKEN   shared bearer between LLX Pay (Vercel) and this service
 *   RECORDER_API_KEY          arc-settlement-recorder API key (same value the recorder uses)
 *   LLX_BRIDGE_TOKEN          optional, mirrors flow steps to the LLX Bridge
 */
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  NETWORK_TEMPO,
  NETWORK_TEMPO_TESTNET,
  TEMPO_EXPLORER,
  TEMPO_TESTNET_EXPLORER,
  USDC_E_TEMPO_MAINNET,
} from "@liquid-logic/shared";
import { formatUsd6, parseUsd6 } from "./amount.js";

export const TEMPO_MAINNET_CHAIN_ID = 4217;
export const TEMPO_TESTNET_CHAIN_ID = 42431;
export const DEFAULT_TEMPO_MAINNET_RPC = "https://rpc.tempo.xyz";
export const DEFAULT_TEMPO_TESTNET_RPC = "https://rpc.moderato.tempo.xyz";
export const DEFAULT_RECORDER_URL = "https://arc-settlement-recorder.onrender.com";
export const DEFAULT_BRIDGE_URL = "https://bridge.liquidlogicx.com";
export const DEFAULT_VERIFIER_URL = "https://proofs.liquidlogicx.com";

export const DEFAULT_TEMPO_MAX_PER_PAYMENT_USDC = "5.00";
export const DEFAULT_TEMPO_DAILY_CAP_USDC = "25.00";
export const DEFAULT_TEMPO_HOLD_ABOVE_USDC = "2.00";

export type TempoRailConfig = {
  enabled: true;
  chainId: number;
  network: typeof NETWORK_TEMPO | typeof NETWORK_TEMPO_TESTNET;
  /** "Tempo mainnet" or "Tempo testnet" — shown on the Pay card and receipt. */
  networkLabel: string;
  rpcUrl: string;
  explorer: string;
  /** TIP-20 payment token (USDC.e on mainnet). */
  token: Address;
  tokenSymbol: string;
  /** Fee token set explicitly on every tx (defaults to the payment token). */
  feeToken: Address;
  payerPrivateKey: Hex;
  payerAddress: Address;
  /** Payee addresses the rail may pay. Fail closed: empty = pay nothing. */
  allowlist: Address[];
  /** Pre-filled payee for the demo Pay card (must be on the allowlist). */
  demoPayee: Address;
  demoPayeeName: string;
  maxPerPaymentAtomic: bigint;
  dailyCapAtomic: bigint;
  /** At/above this amount a payment is held for approval (same rule as Base HOLD_ABOVE_USDC). */
  holdAboveAtomic: bigint;
  serviceToken: string;
  recorderUrl: string;
  recorderApiKey: string | null;
  verifierUrl: string;
  bridgeUrl: string;
  bridgeToken: string | null;
  bridgeTopic: string;
  /** Payer must keep this much on top of the amount for fees (6-dec). */
  feeReserveAtomic: bigint;
};

export type TempoRailDisabled = { enabled: false; reason: string };
export type TempoRailLoadResult = TempoRailConfig | TempoRailDisabled;

type Env = Record<string, string | undefined>;

function value(env: Env, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function parseAddress(raw: string, name: string): Address {
  if (!isAddress(raw, { strict: false })) {
    throw new Error(`${name} must be a 0x-prefixed 20-byte address`);
  }
  return getAddress(raw);
}

/** TREASURER_TEMPO_ALLOWLIST: comma-separated payee addresses. */
export function parseTempoAllowlist(raw: string | undefined): Address[] {
  if (!raw?.trim()) return [];
  const out: Address[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const a = parseAddress(t, "TREASURER_TEMPO_ALLOWLIST entry");
    if (!out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a);
  }
  return out;
}

function parseKey(raw: string): Hex {
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    // Never echo the value.
    throw new Error("TEMPO_PAYER_PRIVATE_KEY must be a 32-byte hex key");
  }
  return key;
}

/**
 * Load the Tempo rail. Never throws: misconfiguration disables the rail with a
 * reason (no secret values in the reason) so the Base rail keeps serving.
 */
export function loadTempoRailConfig(env: Env = process.env): TempoRailLoadResult {
  if (value(env, "TREASURER_TEMPO_ENABLED") !== "true") {
    return { enabled: false, reason: "TREASURER_TEMPO_ENABLED is not \"true\" (Tempo rail off)" };
  }
  try {
    return loadEnabled(env);
  } catch (err) {
    return { enabled: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function loadEnabled(env: Env): TempoRailConfig {
  const chainId = Number(value(env, "TEMPO_CHAIN_ID") ?? TEMPO_MAINNET_CHAIN_ID);
  if (chainId !== TEMPO_MAINNET_CHAIN_ID && chainId !== TEMPO_TESTNET_CHAIN_ID) {
    throw new Error(`TEMPO_CHAIN_ID must be ${TEMPO_MAINNET_CHAIN_ID} (mainnet) or ${TEMPO_TESTNET_CHAIN_ID} (testnet fallback)`);
  }
  const mainnet = chainId === TEMPO_MAINNET_CHAIN_ID;

  const tokenRaw = value(env, "TEMPO_PAY_TOKEN") ?? (mainnet ? USDC_E_TEMPO_MAINNET : undefined);
  if (!tokenRaw) {
    throw new Error("TEMPO_PAY_TOKEN is required on the Tempo testnet fallback (no default token)");
  }
  const token = parseAddress(tokenRaw, "TEMPO_PAY_TOKEN");
  const tokenSymbol = value(env, "TEMPO_PAY_TOKEN_SYMBOL") ?? (mainnet ? "USDC.e" : "USD");
  const feeToken = parseAddress(value(env, "TEMPO_FEE_TOKEN") ?? token, "TEMPO_FEE_TOKEN");

  const keyRaw = value(env, "TEMPO_PAYER_PRIVATE_KEY");
  if (!keyRaw) throw new Error("TEMPO_PAYER_PRIVATE_KEY is not set");
  const payerPrivateKey = parseKey(keyRaw);

  const expectedRaw = value(env, "TEMPO_PAYER_ADDRESS");
  if (!expectedRaw) throw new Error("TEMPO_PAYER_ADDRESS is not set (required: the key must match it)");
  const expected = parseAddress(expectedRaw, "TEMPO_PAYER_ADDRESS");
  const derived = privateKeyToAccount(payerPrivateKey).address;
  if (derived.toLowerCase() !== expected.toLowerCase()) {
    // Address-key mismatch guard: never pay from a wallet nobody expects.
    throw new Error(
      `TEMPO_PAYER_PRIVATE_KEY does not belong to TEMPO_PAYER_ADDRESS ${expected} (derived ${derived}); Tempo rail refused`,
    );
  }

  const allowlist = parseTempoAllowlist(value(env, "TREASURER_TEMPO_ALLOWLIST"));
  if (allowlist.length === 0) {
    throw new Error("TREASURER_TEMPO_ALLOWLIST is empty (fail closed: no Tempo payee allowed)");
  }
  const demoPayee = parseAddress(
    value(env, "TEMPO_DEMO_PAYEE_ADDRESS") ?? allowlist[0]!,
    "TEMPO_DEMO_PAYEE_ADDRESS",
  );
  if (!allowlist.some((a) => a.toLowerCase() === demoPayee.toLowerCase())) {
    throw new Error("TEMPO_DEMO_PAYEE_ADDRESS must also be on TREASURER_TEMPO_ALLOWLIST");
  }
  if (allowlist.some((a) => a.toLowerCase() === derived.toLowerCase())) {
    throw new Error("TREASURER_TEMPO_ALLOWLIST must not contain the payer itself");
  }

  const maxPerPaymentAtomic = parseUsd6(
    value(env, "TREASURER_TEMPO_MAX_PER_PAYMENT_USDC") ?? DEFAULT_TEMPO_MAX_PER_PAYMENT_USDC,
    "TREASURER_TEMPO_MAX_PER_PAYMENT_USDC",
  );
  const dailyCapAtomic = parseUsd6(
    value(env, "TREASURER_TEMPO_DAILY_CAP_USDC") ?? DEFAULT_TEMPO_DAILY_CAP_USDC,
    "TREASURER_TEMPO_DAILY_CAP_USDC",
  );
  const holdAboveAtomic = parseUsd6(
    value(env, "TREASURER_TEMPO_HOLD_ABOVE_USDC") ?? DEFAULT_TEMPO_HOLD_ABOVE_USDC,
    "TREASURER_TEMPO_HOLD_ABOVE_USDC",
  );
  if (maxPerPaymentAtomic <= 0n || dailyCapAtomic <= 0n) {
    throw new Error("Tempo caps must be positive");
  }
  if (maxPerPaymentAtomic > dailyCapAtomic) {
    throw new Error("TREASURER_TEMPO_MAX_PER_PAYMENT_USDC must not exceed TREASURER_TEMPO_DAILY_CAP_USDC");
  }

  const serviceToken = value(env, "TREASURER_SERVICE_TOKEN");
  if (!serviceToken || serviceToken.length < 24) {
    throw new Error("TREASURER_SERVICE_TOKEN must be set (24+ characters) for the LLX Pay → treasurer calls");
  }

  const recorderUrl = (value(env, "RECORDER_URL") ?? DEFAULT_RECORDER_URL).replace(/\/+$/, "");
  if (!recorderUrl.startsWith("https://") && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(recorderUrl)) {
    throw new Error("RECORDER_URL must be https");
  }

  return {
    enabled: true,
    chainId,
    network: mainnet ? NETWORK_TEMPO : NETWORK_TEMPO_TESTNET,
    networkLabel: mainnet ? "Tempo mainnet" : "Tempo testnet",
    rpcUrl: value(env, "TEMPO_RPC_URL") ?? (mainnet ? DEFAULT_TEMPO_MAINNET_RPC : DEFAULT_TEMPO_TESTNET_RPC),
    explorer: (value(env, "TEMPO_EXPLORER") ?? (mainnet ? TEMPO_EXPLORER : TEMPO_TESTNET_EXPLORER)).replace(/\/+$/, ""),
    token,
    tokenSymbol,
    feeToken,
    payerPrivateKey,
    payerAddress: derived,
    allowlist,
    demoPayee,
    demoPayeeName: value(env, "TEMPO_DEMO_PAYEE_NAME") ?? "LLX demo payee",
    maxPerPaymentAtomic,
    dailyCapAtomic,
    holdAboveAtomic,
    serviceToken,
    recorderUrl,
    recorderApiKey: value(env, "RECORDER_API_KEY") ?? null,
    verifierUrl: (value(env, "PUBLIC_VERIFIER_URL") ?? DEFAULT_VERIFIER_URL).replace(/\/+$/, ""),
    bridgeUrl: (value(env, "LLX_BRIDGE_URL") ?? DEFAULT_BRIDGE_URL).replace(/\/+$/, ""),
    bridgeToken: value(env, "LLX_BRIDGE_TOKEN") ?? null,
    bridgeTopic: value(env, "LLX_BRIDGE_TOPIC") ?? "demo-pay",
    feeReserveAtomic: parseUsd6(value(env, "TEMPO_FEE_RESERVE_USDC") ?? "0.01", "TEMPO_FEE_RESERVE_USDC"),
  };
}

/** Public, secret-free view (health + LLX Pay card config). */
export function publicTempoConfig(cfg: TempoRailConfig) {
  return {
    enabled: true as const,
    chainId: cfg.chainId,
    network: cfg.network,
    networkLabel: cfg.networkLabel,
    explorer: cfg.explorer,
    token: cfg.token,
    tokenSymbol: cfg.tokenSymbol,
    feeToken: cfg.feeToken,
    payer: cfg.payerAddress,
    demoPayee: cfg.demoPayee,
    demoPayeeName: cfg.demoPayeeName,
    maxPerPaymentUsdc: formatUsd6(cfg.maxPerPaymentAtomic),
    dailyCapUsdc: formatUsd6(cfg.dailyCapAtomic),
    holdAboveUsdc: formatUsd6(cfg.holdAboveAtomic),
    recorderConfigured: Boolean(cfg.recorderApiKey),
    bridgeMirror: Boolean(cfg.bridgeToken),
  };
}
