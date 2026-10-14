/** Bazaar discovery for /api/escrow-status: full input/output schema + example. */
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { XESCROW_CHAINS } from "./chains";
import { ESCROW_STATUS_OUTPUT_EXAMPLE } from "./output-example";
import { ESCROW_STATUS_META } from "../bazaar-meta";

export const ESCROW_STATUS_DESCRIPTION = ESCROW_STATUS_META.description;

export const ESCROW_STATUS_EXAMPLE_INPUT = { chain: "base-sepolia", id: 3 };

export const ESCROW_STATUS_INPUT_SCHEMA = {
  properties: {
    chain: {
      type: "string",
      enum: XESCROW_CHAINS.map((c) => c.key),
      description: "Optional. Chain key (chain id or eip155:<id> also accepted). Omit to check every live X-Escrow chain. Live now: base-sepolia (testnet); mainnet keys answer 400 CHAIN_NOT_LIVE (free) until deployed.",
    },
    id: { type: "integer", minimum: 1, description: "Escrow id on that chain. Give id OR address." },
    address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", description: "Buyer or seller wallet: returns its escrows (newest 50 per chain). Give id OR address." },
  },
};

const ITEM = {
  type: "object",
  properties: {
    chain: { type: "string" }, chainId: { type: "integer" }, caip2: { type: "string" }, testnet: { type: "boolean" }, factory: { type: "string" },
    escrowId: { type: "integer" },
    state: { type: "string", enum: ["none", "funded", "released", "refunded"], description: "funded = money held; released = paid to seller; refunded = returned to buyer" },
    buyer: { type: "string" }, seller: { type: "string" },
    token: { type: "object", properties: { address: { type: "string" }, symbol: { type: ["string", "null"] }, decimals: { type: "integer" }, native: { type: "boolean" } } },
    amount: { type: "string", description: "Token units, decimal string" }, amountRaw: { type: "string" },
    deadline: { type: "string", format: "date-time", description: "Anyone can refund the buyer at/after this time" },
    verifier: { type: ["string", "null"], description: "Optional verifier contract that can release before the deadline" },
    createdAt: { type: "string", format: "date-time" }, createdBlock: { type: "integer" },
    refundableNow: { type: "boolean" }, secondsToDeadline: { type: "integer" },
    escrowUrl: { type: "string" },
  },
};

export const ESCROW_STATUS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "object", properties: { chain: { type: ["string", "null"] }, id: { type: ["integer", "null"] }, address: { type: ["string", "null"] } } },
    found: { type: "boolean" },
    checkedAt: { type: "string", format: "date-time" },
    chainsChecked: { type: "array", items: { type: "string" } },
    chainsFailed: { type: "array", items: { type: "string" }, description: "Chains whose RPC failed (results for them unknown)" },
    total: { type: "integer" },
    escrows: { type: "array", items: ITEM },
    chains: {
      type: "array",
      items: { type: "object", properties: { chain: { type: "string" }, chainId: { type: "integer" }, status: { type: "string", enum: ["ok", "error"] }, error: { type: "string" }, found: { type: "integer" }, truncated: { type: "boolean" } } },
    },
    source: { type: "string" },
  },
  required: ["query", "found", "checkedAt", "chainsChecked", "chainsFailed", "total", "escrows", "chains"],
};

const output = { example: ESCROW_STATUS_OUTPUT_EXAMPLE, schema: ESCROW_STATUS_OUTPUT_SCHEMA };

export const getEscrowStatusDiscovery = declareDiscoveryExtension({
  input: ESCROW_STATUS_EXAMPLE_INPUT,
  inputSchema: ESCROW_STATUS_INPUT_SCHEMA,
  output,
});

export const postEscrowStatusDiscovery = declareDiscoveryExtension({
  bodyType: "json",
  input: ESCROW_STATUS_EXAMPLE_INPUT,
  inputSchema: ESCROW_STATUS_INPUT_SCHEMA,
  output,
});
