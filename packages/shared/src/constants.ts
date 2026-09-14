/** Base mainnet USDC (Circle). Never invent another token. */
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
