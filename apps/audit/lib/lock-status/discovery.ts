/** Bazaar discovery for /api/lock-status: full input/output schema + generic example. */
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { XLOCK_CHAINS } from "./chains";
import { LOCK_STATUS_OUTPUT_EXAMPLE } from "./output-example";
import { LOCK_STATUS_META } from "../bazaar-meta";

export const LOCK_STATUS_DESCRIPTION = LOCK_STATUS_META.description;

export const LOCK_STATUS_EXAMPLE_INPUT = {
  token: LOCK_STATUS_OUTPUT_EXAMPLE.token,
  chain: "base",
};

export const LOCK_STATUS_INPUT_SCHEMA = {
  properties: {
    token: {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{40}$",
      description: "ERC-20 token contract address (or LP token) to check.",
    },
    chain: {
      type: "string",
      enum: XLOCK_CHAINS.map((c) => c.key),
      description: "Optional. One chain key (chain id or eip155:<id> also accepted). Omit to scan all 10 X-Lock chains.",
    },
  },
  required: ["token"],
};

const LOCK_ITEM = {
  type: "object",
  properties: {
    lockId: { type: "integer" }, kind: { type: "string", enum: ["timelock", "vesting"] },
    lockWallet: { type: "string", description: "Per-lock wallet contract holding the tokens" },
    beneficiary: { type: "string" }, creator: { type: "string" },
    amount: { type: "string", description: "Amount deposited (token units, decimal string)" },
    amountRaw: { type: "string", description: "Amount in base units" },
    start: { type: "string", format: "date-time" }, cliff: { type: "string", format: "date-time" },
    end: { type: "string", format: "date-time", description: "Fully unlocked at" },
    released: { type: "string", description: "Already withdrawn by beneficiary" },
    claimable: { type: "string", description: "Vested but not yet withdrawn" },
    stillLocked: { type: "string", description: "Not yet vested/unlocked" },
    status: { type: "string", enum: ["locked", "vesting", "unlocked", "fully_released"] },
    lockUrl: { type: "string", description: "Public X-Lock page for this lock" },
  },
};

const NEXT = {
  type: ["object", "null"],
  properties: { chain: { type: "string" }, lockId: { type: "integer" }, at: { type: "string", format: "date-time" }, amount: { type: "string" }, lockUrl: { type: "string" } },
};

export const LOCK_STATUS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    token: { type: "string" },
    isLocked: { type: "boolean", description: "true if any amount is still locked on any checked chain" },
    checkedAt: { type: "string", format: "date-time" },
    chainsChecked: { type: "array", items: { type: "string" }, description: "Chains read successfully" },
    chainsFailed: { type: "array", items: { type: "string" }, description: "Chains whose RPC failed (results for them unknown)" },
    totalLocks: { type: "integer" },
    nextUnlock: NEXT,
    chains: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chain: { type: "string" }, chainId: { type: "integer" }, caip2: { type: "string" }, factory: { type: "string" },
          status: { type: "string", enum: ["ok", "error"] }, error: { type: "string" },
          token: { type: "object", properties: { symbol: { type: ["string", "null"] }, decimals: { type: "integer" }, totalSupply: { type: ["string", "null"] } } },
          lockCount: { type: "integer" }, totalLockedAmount: { type: "string" }, totalLockedRaw: { type: "string" },
          pctOfSupplyLocked: { type: ["number", "null"], description: "Still-locked / totalSupply on that chain, percent" },
          nextUnlock: NEXT, locks: { type: "array", items: LOCK_ITEM },
        },
      },
    },
    source: { type: "string" },
  },
  required: ["token", "isLocked", "checkedAt", "chainsChecked", "chainsFailed", "totalLocks", "chains"],
};

const output = { example: LOCK_STATUS_OUTPUT_EXAMPLE, schema: LOCK_STATUS_OUTPUT_SCHEMA };

export const getLockStatusDiscovery = declareDiscoveryExtension({
  input: LOCK_STATUS_EXAMPLE_INPUT,
  inputSchema: LOCK_STATUS_INPUT_SCHEMA,
  output,
});

export const postLockStatusDiscovery = declareDiscoveryExtension({
  bodyType: "json",
  input: LOCK_STATUS_EXAMPLE_INPUT,
  inputSchema: LOCK_STATUS_INPUT_SCHEMA,
  output,
});
