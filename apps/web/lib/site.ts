import { BRIDGE_CHAINS, LLX_V2_TOKEN } from "./bridge";

/**
 * Original $LLX (V1) contract on Virtuals (Base) — do not invent addresses.
 * Single source of truth: the homepage V1 card (LlxSection), /about and
 * /addresses all read this value. V1 is being replaced by $LLX V2.
 */
export const LLX_CONTRACT =
  "0xB9Dd507a5b352783b25e14c9b6E77D9f0067380f";

/** V1 holder snapshot for the V2 migration (crew, Oct 28 2026). */
export const LLX_V1_SNAPSHOT_BLOCK = "53,205,869";
export const LLX_V1_SNAPSHOT_TIME = "October 28, 2026, 8:24 AM PT";

export const LLX_BASESCAN = `https://basescan.org/token/${LLX_CONTRACT}`;

/**
 * $LLX V2 (LayerZero OFT). Same address on all six chains; the literal lives in
 * ./bridge. HyperEVM is listed first (Miles, Nov 2 2026).
 */
export { LLX_V2_TOKEN as LLX_V2_CONTRACT } from "./bridge";

const V2_ORDER = ["hyperevm", "bsc", "base", "arc", "robinhood", "tempo"] as const;

/** Explorer token links for $LLX V2, HyperEVM first. */
export const LLX_V2_EXPLORERS: readonly { label: string; href: string }[] = V2_ORDER.map((id) => {
  const c = BRIDGE_CHAINS.find((x) => x.id === id);
  if (!c) throw new Error(`missing chain ${id}`);
  const label = id === "hyperevm" ? "HyperEVM" : c.name;
  return { label, href: `${c.explorer}/token/${LLX_V2_TOKEN}` };
});

/** PinkLock page listing the $LLX V2 team, treasury and partnership locks (BNB Chain). */
export const LLX_V2_PINKLOCK = `https://www.pinksale.finance/pinklock/bsc/${LLX_V2_TOKEN}`;

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
