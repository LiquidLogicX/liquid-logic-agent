/**
 * Bazaar discovery for /api/prove: full input + output schemas and a REAL
 * populated output example (proof #1 on Arc — values read from Base + Arc RPC
 * and the live verifier on 2026-09-24; see scripts/check-prove.ts).
 */
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { MEMO_MAX_CHARS, PROVE_ARC_CHAIN, SETTLEMENT_PROOFS_ARC, verifyUrlFor } from "./config";
import type { ProveResponse } from "./handler";

export const PROVE_DESCRIPTION =
  "Receipts for agent payments. Send a Base USDC tx hash, get a settlement proof on Arc with a public verify link. $0.02 USDC on Base. The paying wallet must be the sender or recipient of the USDC transfer (403 otherwise, not charged). Idempotent: an already-recorded tx returns status \"existing\" with no new Arc write. You are only charged when a proof is returned. Site: https://liquidlogicx.com";

/** Proof #1: Base tx 0x93a1…af4c recorded on Arc in tx 0x2bb3…0bbe (SettlementProofs index 0). */
const PROOF1_REF_ID = "0xe6db5a86740c0e40943c06268bda4e09b45ac0a45fd6c5d7b7f2550e19e0c50e";

export const PROVE_OUTPUT_EXAMPLE: ProveResponse = {
  proofId: 1,
  status: "recorded",
  source: {
    chain: "eip155:8453",
    txHash: "0x93a15735c5b82fb8c9fdc0f7db5d56916a14f6ee4ef343000a29fd55c4bcaf4c",
    from: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
    to: "0x147991A1c25e78f6D9225d2dBA61eD93A6158c7b",
    amountUsdc: "0.001",
    timestamp: "2026-09-15T20:38:57.000Z",
  },
  arc: {
    chain: PROVE_ARC_CHAIN,
    contract: SETTLEMENT_PROOFS_ARC,
    txHash: "0x2bb316073c034140d74d73ca67ad2b71bfaaa9dea531d69290a16efdd0f10bbe",
  },
  verifyUrl: verifyUrlFor(PROOF1_REF_ID),
  recordedAt: "2026-09-22T15:32:28.000Z",
  refId: PROOF1_REF_ID,
  memo: "llx-self-test-0.001",
};

export const PROVE_EXAMPLE_INPUT = {
  txHash: PROVE_OUTPUT_EXAMPLE.source.txHash,
  memo: "invoice-42",
};

export const PROVE_INPUT_SCHEMA = {
  properties: {
    txHash: {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{64}$",
      description:
        "Base mainnet (eip155:8453) transaction hash of a USDC payment (must contain a Transfer from Base USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913). Your paying wallet must be its from or to.",
    },
    memo: {
      type: "string",
      maxLength: MEMO_MAX_CHARS,
      pattern: "^[\\x20-\\x7E]*$",
      description: `Optional plain-text note stored on-chain with the proof (printable ASCII, max ${MEMO_MAX_CHARS} chars). Public.`,
    },
  },
  required: ["txHash"],
};

const hex32 = { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" };
const address = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" };

export const PROVE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    proofId: {
      type: ["integer", "null"],
      description: "1-based position in the SettlementProofs registry on Arc",
    },
    status: { type: "string", enum: ["recorded", "existing"] },
    source: {
      type: "object",
      properties: {
        chain: { type: "string", const: "eip155:8453" },
        txHash: hex32,
        from: address,
        to: address,
        amountUsdc: { type: "string", description: "Decimal USDC, e.g. \"0.05\"" },
        timestamp: { type: "string", description: "Base block time (UTC)" },
      },
      required: ["chain", "txHash", "from", "to", "amountUsdc", "timestamp"],
    },
    arc: {
      type: "object",
      properties: {
        chain: { type: "string", const: PROVE_ARC_CHAIN },
        contract: { type: "string", const: SETTLEMENT_PROOFS_ARC },
        txHash: { ...hex32, type: ["string", "null"], description: "Arc tx that recorded the proof" },
      },
      required: ["chain", "contract", "txHash"],
    },
    verifyUrl: { type: "string", description: "Public verifier page on proofs.liquidlogicx.com" },
    recordedAt: { type: "string" },
    refId: { ...hex32, description: "Settlement ID on Arc = keccak256(srcTxHash, payee, amountUSDC)" },
    memo: { type: "string" },
  },
  required: ["proofId", "status", "source", "arc", "verifyUrl", "recordedAt"],
};

const output = { example: PROVE_OUTPUT_EXAMPLE, schema: PROVE_OUTPUT_SCHEMA };

export const getProveDiscovery = declareDiscoveryExtension({
  input: PROVE_EXAMPLE_INPUT,
  inputSchema: PROVE_INPUT_SCHEMA,
  output,
});

export const postProveDiscovery = declareDiscoveryExtension({
  bodyType: "json",
  input: PROVE_EXAMPLE_INPUT,
  inputSchema: PROVE_INPUT_SCHEMA,
  output,
});
