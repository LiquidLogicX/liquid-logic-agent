/**
 * X-Escrow deployments that /api/escrow-status reads. Mirrors llx-lock
 * web/src/lib/escrowChains.ts. Only Base Sepolia (testnet) is live; mainnet
 * slots are configured with `factory: null` and get filled one chain at a time
 * as each XEscrowFactory mainnet deploy is verified.
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
/** Review-fix redeploy (salt XEscrowT2). Superseded pre-review factory: 0xAd45eFa49A7BD027823b01453dC8468AA756574F. */
export const XESCROW_TESTNET_FACTORY = "0x72770D23497950EbA870154a6C5B4087Ab47F99f" as const;

const soon = (key: string, name: string, chainId: number, rpcUrls: string[], explorer: string): XEscrowChain =>
  ({ key, name, chainId, factory: null, rpcUrls, explorer });

export const XESCROW_CHAINS: XEscrowChain[] = [
  {
    key: "base-sepolia", name: "Base Sepolia", chainId: 84532, factory: XESCROW_TESTNET_FACTORY, testnet: true,
    rpcUrls: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"], explorer: "https://sepolia.basescan.org",
  },
  soon("base", "Base", 8453, ["https://mainnet.base.org"], "https://basescan.org"),
  soon("bnb", "BNB Chain", 56, ["https://bsc-dataseed.bnbchain.org"], "https://bscscan.com"),
  soon("ethereum", "Ethereum", 1, ["https://ethereum-rpc.publicnode.com"], "https://etherscan.io"),
  soon("arbitrum", "Arbitrum", 42161, ["https://arb1.arbitrum.io/rpc"], "https://arbiscan.io"),
  soon("polygon", "Polygon", 137, ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"], "https://polygonscan.com"),
  soon("avalanche", "Avalanche", 43114, ["https://api.avax.network/ext/bc/C/rpc"], "https://snowtrace.io"),
  soon("optimism", "Optimism", 10, ["https://mainnet.optimism.io"], "https://optimistic.etherscan.io"),
  soon("arc", "Arc", 5042, ["https://rpc.mainnet.arc.io"], "https://arc.etherscan.io"),
  soon("tempo", "Tempo", 4217, ["https://rpc.tempo.xyz"], "https://explore.tempo.xyz"),
  soon("robinhood", "Robinhood Chain", 4663, ["https://rpc.mainnet.chain.robinhood.com"], "https://robin.etherscan.io"),
];

export const isLive = (c: XEscrowChain) => c.factory !== null;
export const liveEscrowChains = () => XESCROW_CHAINS.filter(isLive);

/** Accepts key ("base-sepolia"), numeric id ("84532"), CAIP-2 ("eip155:84532") or name. */
export function resolveEscrowChain(input: string): XEscrowChain | undefined {
  const s = input.trim().toLowerCase().replace(/^eip155:/, "");
  return XESCROW_CHAINS.find((c) => c.key === s || String(c.chainId) === s || c.name.toLowerCase() === s);
}

export const escrowUrl = (c: XEscrowChain, id: number | bigint | string) => `${XESCROW_SITE}/escrow/${c.key}/${id}`;
