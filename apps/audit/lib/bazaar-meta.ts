/**
 * x402 Bazaar listing metadata (resource.serviceName / tags / description)
 * for every paid route on audit.liquidlogicx.com. Metadata only — prices,
 * networks and payTo live in @liquid-logic/shared and x402-server.ts.
 *
 * Bazaar ranking weighs name > tags > description text, so names and the
 * first sentence of each description lead with the terms agents search for.
 *
 * Limits (x402 v2 spec + CDP Facilitator), checked by `npm run check-bazaar-meta`:
 *   serviceName  1–32 printable ASCII
 *   tags         ≤ 5 entries, each 1–32 printable ASCII (the SDK/spec cap is 5)
 *   description  ≤ 500 chars (CDP rejects verify/settle above that)
 *
 * Accuracy: /api/prove records proofs on Arc mainnet only. The Tempo mainnet
 * registry (0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A) is written by the
 * recorder's Tempo route, not by this endpoint, so the copy says so.
 */

export type BazaarMeta = {
  serviceName: string;
  tags: string[];
  description: string;
};

export const BAZAAR_ICON_URL = "https://liquidlogicx.com/llx-logo.png";

export const PROVE_META: BazaarMeta = {
  serviceName: "Payment Receipt/Settlement Proof",
  tags: ["payment-receipt", "settlement-proof", "verify", "x402", "usdc"],
  description:
    "Get an onchain receipt for a Base USDC payment from Liquid Logic X: send a tx hash (+ optional memo), get proofId, payer, payee, amount, Arc tx and a public verify link. Payer or payee must be the caller. $0.02 USDC on Base.",
};

export const AUDIT_META: BazaarMeta = {
  serviceName: "x402 Agent Spend Audit",
  tags: ["audit", "agent-spend", "x402", "usdc", "base"],
  description:
    "Audit an x402 agent wallet on Base with Liquid Logic X: send a wallet address, get payment count, USDC total, per-endpoint breakdown and recent payments with Basescan links, from the public ledger. $0.03 USDC on Base.",
};

export const ALLOWANCE_META: BazaarMeta = {
  serviceName: "x402 Spend Cap/Allowance Check",
  tags: ["allowance", "spend-controls", "agent-payments", "x402", "usdc"],
  description:
    "Check an agent wallet's x402 spend cap before it pays, via Liquid Logic X: send a wallet and optional endpoint URL, get allowed, reason, remainingUsdc, capUsdc, spentUsdc from the published policy. $0.001 USDC on Base.",
};

export const LOCK_STATUS_META: BazaarMeta = {
  serviceName: "Token Lock/Vesting Check",
  tags: ["token-lock", "vesting", "rug-check", "liquidity-lock", "multichain"],
  description:
    "Check if a token or LP is locked before you buy, via X-Lock by Liquid Logic X: send an ERC-20 address (optional chain; default all 11, incl. Base, Ethereum, BNB, XRPL EVM), get locks, unlock dates, claimable and % of supply locked. $0.005 USDC on Base.",
};

export const ESCROW_STATUS_META: BazaarMeta = {
  serviceName: "Escrow Status Check",
  tags: ["escrow", "agent-payments", "payment-status", "usdc", "x-escrow"],
  description:
    "Check an X-Escrow before you deliver paid work, via Liquid Logic X: send chain + escrow id or a buyer/seller wallet (default all 10 mainnets), get state, parties, amount, deadline and refundable-now. $0.005 USDC on Base.",
};
