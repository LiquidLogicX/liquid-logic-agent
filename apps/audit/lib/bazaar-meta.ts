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
    "Payment receipt and settlement proof for x402 and agent payments, by Liquid Logic X. " +
    "Input: a Base USDC tx hash (optional memo). " +
    "Output: JSON proof recorded onchain on Arc mainnet (proofId, from/to/amount, Arc tx, refId) plus a public verify link anyone can check. " +
    "$0.02 USDC on Base, charged only when a proof is returned. " +
    "Your paying wallet must be the tx sender or recipient. " +
    "Liquid Logic X also records proofs on Tempo mainnet. Site: https://liquidlogicx.com",
};

export const AUDIT_META: BazaarMeta = {
  serviceName: "x402 Agent Spend Audit",
  tags: ["audit", "agent-spend", "x402", "usdc", "base"],
  description:
    "x402 agent spend audit by Liquid Logic X: where an agent wallet's USDC went. " +
    "Input: a wallet address (0x...). " +
    "Output: JSON spend summary of x402 payments in Base USDC (count, total, per-endpoint breakdown, recent payments with Basescan tx links, holds/denials). " +
    "Source: the Liquid Logic X public ledger (its treasurer agent's spend); anyone can verify each payment onchain. " +
    "$0.05 USDC on Base. Site: https://liquidlogicx.com",
};

export const ALLOWANCE_META: BazaarMeta = {
  serviceName: "x402 Spend Cap/Allowance Check",
  tags: ["allowance", "spend-controls", "agent-payments", "x402", "usdc"],
  description:
    "x402 spend cap and allowance check by Liquid Logic X: call it before paying an x402 endpoint. " +
    "Input: wallet (the Liquid Logic X treasurer, 0xEA24...) and optional endpoint URL. " +
    "Output: JSON { allowed, reason, remainingUsdc, capUsdc, spentUsdc } from the published spend policy (allowlist, max per payment, UTC daily cap) and public ledger. " +
    "Omit endpoint for remaining cap + allowlist. " +
    "$0.001 USDC on Base. Site: https://liquidlogicx.com",
};
