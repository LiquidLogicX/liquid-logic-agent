/**
 * X-Lock deployments that /api/lock-status scans. Mirrors llx-lock
 * web/src/lib/chains.ts (keys, chain ids, public RPCs, lock page paths).
 * Base runs the original XLockFactory; the other 10 chains share the
 * CreateX-deployed XLockFactoryV2. Both expose the same read ABI.
 */
export type XLockChain = {
  key: string;
  name: string;
  chainId: number;
  factory: `0x${string}`;
  rpcUrls: string[];
  explorer: string;
};

export const XLOCK_SITE = "https://xlock.liquidlogicx.com";
export const BASE_FACTORY = "0xD47326d2B5822355D9c4dfF5265849a5bb5D20ec" as const;
export const V2_FACTORY = "0x54b3019acBBf9aeFDc545d5CeA75e10322eA9D44" as const;

const v2 = (key: string, name: string, chainId: number, rpcUrls: string[], explorer: string): XLockChain =>
  ({ key, name, chainId, factory: V2_FACTORY, rpcUrls, explorer });

export const XLOCK_CHAINS: XLockChain[] = [
  { key: "base", name: "Base", chainId: 8453, factory: BASE_FACTORY, rpcUrls: ["https://mainnet.base.org"], explorer: "https://basescan.org" },
  v2("bnb", "BNB Chain", 56, ["https://bsc-dataseed.bnbchain.org"], "https://bscscan.com"),
  v2("ethereum", "Ethereum", 1, ["https://ethereum-rpc.publicnode.com"], "https://etherscan.io"),
  v2("arbitrum", "Arbitrum", 42161, ["https://arb1.arbitrum.io/rpc"], "https://arbiscan.io"),
  v2("polygon", "Polygon", 137, ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"], "https://polygonscan.com"),
  v2("avalanche", "Avalanche", 43114, ["https://api.avax.network/ext/bc/C/rpc"], "https://snowtrace.io"),
  v2("optimism", "Optimism", 10, ["https://mainnet.optimism.io"], "https://optimistic.etherscan.io"),
  v2("arc", "Arc", 5042, ["https://rpc.mainnet.arc.io"], "https://arc.etherscan.io"),
  v2("tempo", "Tempo", 4217, ["https://rpc.tempo.xyz"], "https://explore.tempo.xyz"),
  v2("robinhood", "Robinhood Chain", 4663, ["https://rpc.mainnet.chain.robinhood.com"], "https://robin.etherscan.io"),
  v2("xrplevm", "XRPL EVM", 1440000, ["https://rpc.xrplevm.org"], "https://explorer.xrplevm.org"),
];

/** Accepts key ("bnb"), numeric id ("56"), or CAIP-2 ("eip155:56"). */
export function resolveChain(input: string): XLockChain | undefined {
  const s = input.trim().toLowerCase().replace(/^eip155:/, "");
  return XLOCK_CHAINS.find((c) => c.key === s || String(c.chainId) === s || c.name.toLowerCase() === s);
}

/** Lock pages: Base keeps /lock/{id}; other chains live under /c/{key}/lock/{id}. */
export function lockUrl(c: XLockChain, id: number | bigint | string): string {
  return c.key === "base" ? `${XLOCK_SITE}/lock/${id}` : `${XLOCK_SITE}/c/${c.key}/lock/${id}`;
}
