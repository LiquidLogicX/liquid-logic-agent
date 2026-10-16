/**
 * X-Escrow deployments that /api/escrow-status reads. Mirrors llx-lock
 * web/src/lib/escrowChains.ts. Live: all ten mainnets (Base, BNB, Ethereum, Arbitrum,
 * Polygon, Avalanche, Optimism, Arc, Tempo, Robinhood Chain; Oct 15 2026) at one CREATE3
 * address, plus Base Sepolia (testnet fallback). `factory: null` still marks a slot not deployed.
 */
export type XEscrowChain = {
  key: string;
  name: string;
  chainId: number;
  factory: `0x${string}` | null;
  rpcUrls: string[];
  explorer: string;
  testnet?: boolean;
};

export const XESCROW_SITE = "https://xlock.liquidlogicx.com";
/** Base Sepolia testnet: launch-cap redeploy (salt XEscrowT5: USDC 2,500 / 1.0 ETH per escrow, capRequired). Superseded: T4 0x465E…4a62, T3 0x3eB3…1caC, T2 0x7277…F99f, T1 0xAd45…574F. */
export const XESCROW_TESTNET_FACTORY = "0x8247E07B2e821a5f6E6260e74EA3daB0d6867BC3" as const;

/** X-Escrow factory, same address on all ten mainnets (Base block 52642886; CreateX CREATE3, salt XEscrowV1, block 52642886; launch caps 2,500 USDC / 1.0 ETH / 10M LLX per escrow; Basescan verified). */
export const XESCROW_BASE_FACTORY = "0xa01454C9102052a00dd9B7a5a2eDBA159E93e385" as const;

/** Same CREATE3 address on every X-Escrow mainnet (deployer + salt only). */
const live = (key: string, name: string, chainId: number, rpcUrls: string[], explorer: string): XEscrowChain =>
  ({ key, name, chainId, factory: XESCROW_BASE_FACTORY, rpcUrls, explorer });

export const XESCROW_CHAINS: XEscrowChain[] = [
  {
    key: "base", name: "Base", chainId: 8453, factory: XESCROW_BASE_FACTORY,
    rpcUrls: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"], explorer: "https://basescan.org",
  },
  {
    key: "base-sepolia", name: "Base Sepolia", chainId: 84532, factory: XESCROW_TESTNET_FACTORY, testnet: true,
    rpcUrls: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"], explorer: "https://sepolia.basescan.org",
  },
  live("bnb", "BNB Chain", 56, ["https://bsc-dataseed.bnbchain.org"], "https://bscscan.com"),
  live("ethereum", "Ethereum", 1, ["https://ethereum-rpc.publicnode.com"], "https://etherscan.io"),
  live("arbitrum", "Arbitrum", 42161, ["https://arb1.arbitrum.io/rpc"], "https://arbiscan.io"),
  live("polygon", "Polygon", 137, ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"], "https://polygonscan.com"),
  live("avalanche", "Avalanche", 43114, ["https://api.avax.network/ext/bc/C/rpc"], "https://snowtrace.io"),
  live("optimism", "Optimism", 10, ["https://mainnet.optimism.io"], "https://optimistic.etherscan.io"),
  live("arc", "Arc", 5042, ["https://rpc.mainnet.arc.io"], "https://arc.etherscan.io"),
  live("tempo", "Tempo", 4217, ["https://rpc.tempo.xyz"], "https://explore.tempo.xyz"),
  live("robinhood", "Robinhood Chain", 4663, ["https://rpc.mainnet.chain.robinhood.com"], "https://robin.etherscan.io"),
];

export const isLive = (c: XEscrowChain) => c.factory !== null;
export const liveEscrowChains = () => XESCROW_CHAINS.filter(isLive);

/** Accepts key ("base-sepolia"), numeric id ("84532"), CAIP-2 ("eip155:84532") or name. */
export function resolveEscrowChain(input: string): XEscrowChain | undefined {
  const s = input.trim().toLowerCase().replace(/^eip155:/, "");
  return XESCROW_CHAINS.find((c) => c.key === s || String(c.chainId) === s || c.name.toLowerCase() === s);
}

export const escrowUrl = (c: XEscrowChain, id: number | bigint | string) => `${XESCROW_SITE}/escrow/${c.key}/${id}`;
