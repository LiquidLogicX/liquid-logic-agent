import { USDC_BASE_MAINNET, USDC_BASE_SEPOLIA } from "./constants.js";

const FORBIDDEN = [
  /\bswap\b/i,
  /\bbuy\s+(?!usdc)/i,
  /\btrade\b/i,
  /\byield\b/i,
  /\bapy\b/i,
  /\btreasury\s+growth\b/i,
  /\binvest(ment|ing)?\b/i,
];

/**
 * Hard-fail if a code path would swap/buy non-USDC or use growth framing.
 * Call before any outbound payment or asset transfer helper.
 */
export function assertUsdcOnlyOperation(opts: {
  assetAddress?: string;
  assetSymbol?: string;
  intent?: string;
  allowSepolia?: boolean;
}): void {
  const symbol = (opts.assetSymbol ?? "USDC").toUpperCase();
  if (symbol !== "USDC") {
    throw new Error(
      `GUARDRAIL: only USDC is allowed (got ${symbol}). Never invent or buy another token.`,
    );
  }

  if (opts.assetAddress) {
    const a = opts.assetAddress.toLowerCase();
    const main = USDC_BASE_MAINNET.toLowerCase();
    const sepolia = USDC_BASE_SEPOLIA.toLowerCase();
    const ok = a === main || (opts.allowSepolia && a === sepolia);
    if (!ok) {
      throw new Error(
        `GUARDRAIL: asset address ${opts.assetAddress} is not Base USDC. Aborting.`,
      );
    }
  }

  if (opts.intent) {
    for (const re of FORBIDDEN) {
      if (re.test(opts.intent) && !/usdc/i.test(opts.intent)) {
        throw new Error(
          `GUARDRAIL: forbidden intent "${opts.intent}". USDC services-only; no swap/buy/yield.`,
        );
      }
    }
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Same matching rules the treasurer uses at pay time:
 * exact URL (trailing slash ignored) or allowlisted prefix + "/".
 */
export function isAllowlistedEndpoint(url: string, allowlist: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  const normalized = stripTrailingSlash(parsed.toString());
  const allowed = allowlist.map(stripTrailingSlash);
  return allowed.some(
    (a) => normalized === a || normalized.startsWith(a + "/"),
  );
}

/**
 * Normalize and validate an allowlisted HTTP(S) endpoint URL.
 */
export function assertAllowlistedEndpoint(
  url: string,
  allowlist: string[],
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid endpoint URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Endpoint must be http(s): ${url}`);
  }
  if (!isAllowlistedEndpoint(url, allowlist)) {
    const allowed = allowlist.map(stripTrailingSlash);
    throw new Error(
      `GUARDRAIL: endpoint not on allowlist: ${url}. Allowed: ${allowed.join(", ") || "(empty)"}`,
    );
  }
  return parsed.toString();
}
