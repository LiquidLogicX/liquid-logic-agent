/**
 * Strict 6-decimal TIP-20 amounts for the Tempo rail.
 *
 * USDC.e on Tempo is a TIP-20 token with 6 decimals (confirmed on chain 4217:
 * decimals() == 6). Tempo has no 18-decimal native token to mix this up with,
 * but we still never route an amount through anything except these helpers.
 * Unlike the Base helper `usdcToAtomic`, this refuses more than 6 decimals
 * instead of truncating.
 */
export const TIP20_DECIMALS = 6;
const SCALE = 1_000_000n;

export function parseUsd6(amount: string | number, label = "amount"): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) {
    throw new Error(
      `${label} must be a positive decimal with at most 6 places (got "${amount}")`,
    );
  }
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole!) * SCALE + BigInt((frac + "000000").slice(0, 6));
}

export function formatUsd6(atomic: bigint): string {
  const neg = atomic < 0n;
  const v = neg ? -atomic : atomic;
  const whole = v / SCALE;
  const frac = (v % SCALE).toString().padStart(6, "0");
  // Always show at least 2 decimals ("1.00"), trim the rest.
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${neg ? "-" : ""}${whole}.${trimmed}`;
}
