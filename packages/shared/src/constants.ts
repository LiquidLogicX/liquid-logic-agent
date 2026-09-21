/** Base mainnet USDC (Circle). Agent spend is USDC only; do not invent a substitute payment asset. */
export const USDC_BASE_MAINNET =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/** Base Sepolia USDC — development / docs only. */
export const USDC_BASE_SEPOLIA =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

/** CAIP-2 Base mainnet. */
export const NETWORK_BASE = "eip155:8453" as const;

/** CAIP-2 Base Sepolia. */
export const NETWORK_BASE_SEPOLIA = "eip155:84532" as const;

export const BASESCAN_TX = "https://basescan.org/tx/";
export const BASESCAN_ADDRESS = "https://basescan.org/address/";

export const AUDIT_PRICE_USDC = "0.05";
export const AUDIT_PRICE_LABEL = "$0.05";

/** Allowance pre-flight — cheaper than audit so agents can ask before spending. */
export const ALLOWANCE_PRICE_USDC = "0.001";
export const ALLOWANCE_PRICE_LABEL = "$0.001";

/** CDP-managed Liquid Logic Agent treasurer (Base). */
export const TREASURER_WALLET_ADDRESS =
  "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D" as const;

/** Atomic units: USDC has 6 decimals. */
export function usdcToAtomic(amount: string | number): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  const [whole, frac = ""] = s.split(".");
  const padded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(padded);
}

export function atomicToUsdc(atomic: bigint): string {
  const neg = atomic < 0n;
  const v = neg ? -atomic : atomic;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  const body = frac.length ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function basescanTxUrl(txHash: string): string {
  const h = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  return `${BASESCAN_TX}${h}`;
}

/** CAIP-2 Arc mainnet (Circle). Gas is USDC. */
export const NETWORK_ARC = "eip155:5042" as const;

/** Arc mainnet USDC (Circle native / Gateway asset, 6 decimals for x402). */
export const USDC_ARC_MAINNET =
  "0x3600000000000000000000000000000000000000" as const;

/** Circle GatewayWalletBatched verifying contract (Arc + other Gateway rails). */
export const ARC_GATEWAY_WALLET =
  "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE" as const;

/**
 * Dedicated OKX Arc rail payTo — NOT the Base treasurer (0xEA24…167D).
 * Override with ARC_PAY_TO_EVM when needed.
 */
export const ARC_PAY_TO_DEFAULT =
  "0xe9bf3457f1e59ffa507141e64e8eb259f966c2c2" as const;

/** Official Arc Blockscout explorer (tx). */
export const ARCSCAN_TX = "https://explorer.arc.io/tx/";
export const ARCSCAN_ADDRESS = "https://explorer.arc.io/address/";

export type PaymentNetwork =
  | typeof NETWORK_BASE
  | typeof NETWORK_BASE_SEPOLIA
  | typeof NETWORK_ARC;

export function arcscanTxUrl(txHash: string): string {
  const h = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  return `${ARCSCAN_TX}${h}`;
}

/**
 * Explorer tx URL selected off CAIP-2 network.
 * Missing / unknown network → BaseScan (legacy rows).
 */
export function explorerTxUrl(
  network: string | undefined | null,
  txHash: string,
): string {
  if (network === NETWORK_ARC || network === "eip155:5042") {
    return arcscanTxUrl(txHash);
  }
  return basescanTxUrl(txHash);
}

/** Default ledger network when a historical row omits `network`. */
export const LEDGER_NETWORK_BACKFILL = NETWORK_BASE;
