/** Official $LLX contract — do not invent addresses. */
export const LLX_CONTRACT =
  "0xB9Dd507a5b352783b25e14c9b6E77D9f0067380f";

export const LLX_BASESCAN = `https://basescan.org/token/${LLX_CONTRACT}`;

export const LLX_VIRTUALS = `https://app.virtuals.io/prototypes/${LLX_CONTRACT}`;

export const TREASURER_WALLET =
  "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D";

export const SITE_URL = "https://liquidlogicx.com";

export const SITE_TITLE =
  "Liquid Logic X — Spending controls for autonomous agents";

export const SITE_DESCRIPTION =
  "Capped, allowlisted USDC spending for AI agents on Base, with every payment published and verifiable on BaseScan.";

export const AUDIT_URL =
  process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.liquidlogicx.com";
