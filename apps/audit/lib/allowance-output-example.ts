import type { AllowanceReport } from "@liquid-logic/shared";

/**
 * Canonical paid GET /api/allowance body for wallet 0xEA24…167D
 * asking about https://audit.liquidlogicx.com/api/audit on UTC 2026-09-14.
 * Remaining is ledger daily spend vs published treasurer policy — must match live.
 * Key order matches evaluateAllowance() so check-allowance can stringify-compare.
 */
export const ALLOWANCE_OUTPUT_EXAMPLE: AllowanceReport = {
  walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
  endpoint: "https://audit.liquidlogicx.com/api/audit",
  network: "eip155:8453",
  asset: "USDC",
  source: "treasurer_policy",
  spentWindow: "utc_calendar_day",
  day: "2026-09-14",
  maxPerPaymentUsdc: 1,
  allowed: true,
  reason:
    "Allowlisted; 9.9 USDC remaining under the UTC daily cap (2026-09-14). Max per payment 1.00 USDC.",
  remainingUsdc: 9.9,
  capUsdc: 10,
  spentUsdc: 0.1,
  endpointAllowlisted: true,
};

export const ALLOWANCE_OUTPUT_EXAMPLE_WALLET_ONLY: AllowanceReport = {
  walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
  endpoint: null,
  network: "eip155:8453",
  asset: "USDC",
  source: "treasurer_policy",
  spentWindow: "utc_calendar_day",
  day: "2026-09-14",
  maxPerPaymentUsdc: 1,
  allowed: true,
  reason:
    "9.9 USDC remaining under the UTC daily cap (2026-09-14). 3 allowlisted endpoint(s). Max per payment 1.00 USDC.",
  remainingUsdc: 9.9,
  capUsdc: 10,
  spentUsdc: 0.1,
  allowlist: [
    "https://audit.liquidlogicx.com/api/audit",
    "https://liquid-logic-agent-audit.vercel.app/api/audit",
    "https://x402uselessfacts.vercel.app/api/useless-fact",
  ],
};
