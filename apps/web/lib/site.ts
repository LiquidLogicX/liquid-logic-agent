/**
 * Official $LLX contract — do not invent addresses.
 * Single source of truth: the homepage token section (LlxSection) and the
 * /about page both read this value. It changes when $LLX graduates on
 * Virtuals — update it here only.
 */
export const LLX_CONTRACT =
  "0xB9Dd507a5b352783b25e14c9b6E77D9f0067380f";

export const LLX_BASESCAN = `https://basescan.org/token/${LLX_CONTRACT}`;

export const LLX_VIRTUALS = "https://app.virtuals.io/virtuals/141523";

export const TREASURER_WALLET =
  "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D";

export const SITE_URL = "https://liquidlogicx.com";

export const SITE_TITLE =
  "Liquid Logic X — Lock, pay and send privately on-chain";

export const SITE_DESCRIPTION =
  "On-chain payment tools for businesses, token teams and AI agents: token locks on 11 chains, approved USDC payments, private sends on Base and escrow. Every step verifiable on a block explorer.";

export const AUDIT_URL =
  process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.liquidlogicx.com";

export const XLOCK_URL = "https://xlock.liquidlogicx.com";
