/** Bazaar discovery for /api/token-check: full input/output schema + generic example. */
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { TOKEN_CHECK_OUTPUT_EXAMPLE } from "./output-example";
import { TOKEN_CHECK_META } from "../bazaar-meta";

export const TOKEN_CHECK_DESCRIPTION = TOKEN_CHECK_META.description;

export const TOKEN_CHECK_EXAMPLE_INPUT = { token: TOKEN_CHECK_OUTPUT_EXAMPLE.token };

export const TOKEN_CHECK_INPUT_SCHEMA = {
  properties: {
    token: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", description: "Base (eip155:8453) ERC-20 token contract address to check before buying." },
    chain: { type: "string", enum: ["base"], description: "Optional. Base only." },
  },
  required: ["token"],
};

const FLAG = {
  type: "object",
  properties: {
    code: { type: "string", description: "e.g. POWER_MINT, POWER_BLACKLIST, UPGRADEABLE, OWNER_HOLDS_MAJORITY, LIQUIDITY_TINY, NO_SELLS_24H, PAIR_NEW, NO_DEX_PAIR, OWNER_RENOUNCED, XLOCK_LOCKED, KNOWN_ISSUER" },
    severity: { type: "string", enum: ["high", "medium", "low", "info"] },
    message: { type: "string" },
  },
};

const PAIR = {
  type: ["object", "null"],
  properties: {
    dex: { type: "string" }, pairAddress: { type: "string" }, url: { type: "string" }, quoteSymbol: { type: ["string", "null"] },
    liquidityUsd: { type: ["number", "null"] }, priceUsd: { type: ["string", "null"] }, volume24hUsd: { type: ["number", "null"] },
    buys24h: { type: ["integer", "null"] }, sells24h: { type: ["integer", "null"] }, createdAt: { type: ["string", "null"], format: "date-time" },
  },
};

export const TOKEN_CHECK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    token: { type: "string" }, chain: { type: "string", enum: ["base"] }, checkedAt: { type: "string", format: "date-time" },
    risk: { type: "string", enum: ["high", "medium", "low"], description: "Worst flag severity found. 'low' is not a guarantee." },
    score: { type: "integer", minimum: 0, maximum: 100, description: "100 minus 35 per high, 15 per medium, 5 per low flag" },
    summary: { type: "string" },
    flags: { type: "array", items: FLAG },
    contract: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] }, symbol: { type: ["string", "null"] }, decimals: { type: ["integer", "null"] }, totalSupply: { type: ["string", "null"] },
        owner: { type: ["string", "null"] }, ownerRenounced: { type: "boolean" },
        upgradeable: { type: "boolean" }, proxyImplementation: { type: ["string", "null"] }, proxyAdmin: { type: ["string", "null"] },
        adminPowersInCode: { type: "array", items: { type: "string", enum: ["mint", "blacklist", "fees", "pause", "trading-switch", "max-tx"] } },
        knownIssuer: { type: ["string", "null"] },
      },
    },
    holders: { type: "object", properties: { ownerPct: { type: ["number", "null"] }, burnedPct: { type: ["number", "null"] } } },
    market: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ok", "unavailable"] }, pairCount: { type: "integer" },
        totalLiquidityUsd: { type: ["number", "null"] }, topPair: PAIR,
      },
    },
    locks: {
      type: "object",
      properties: {
        xlockLocked: { type: "boolean" }, pctOfSupplyLocked: { type: ["number", "null"] },
        nextUnlock: { type: ["string", "null"], format: "date-time" }, lockUrls: { type: "array", items: { type: "string" } },
      },
    },
    notChecked: { type: "array", items: { type: "string" } },
    links: { type: "object", properties: { basescan: { type: "string" }, dexscreener: { type: "string" } } },
    source: { type: "string" },
  },
  required: ["token", "chain", "checkedAt", "risk", "score", "summary", "flags", "contract", "market", "locks"],
};

const output = { example: TOKEN_CHECK_OUTPUT_EXAMPLE, schema: TOKEN_CHECK_OUTPUT_SCHEMA };

export const getTokenCheckDiscovery = declareDiscoveryExtension({
  input: TOKEN_CHECK_EXAMPLE_INPUT,
  inputSchema: TOKEN_CHECK_INPUT_SCHEMA,
  output,
});

export const postTokenCheckDiscovery = declareDiscoveryExtension({
  bodyType: "json",
  input: TOKEN_CHECK_EXAMPLE_INPUT,
  inputSchema: TOKEN_CHECK_INPUT_SCHEMA,
  output,
});
