/**
 * /api/escrow-status core: read-only XEscrowFactory lookups.
 * RPC access goes through an injectable `EscrowReader` so tests can mock it.
 */
import { createPublicClient, fallback, formatUnits, http } from "viem";
import { escrowUrl, liveEscrowChains, type XEscrowChain } from "./chains";

export const ESCROW_ABI = [
  { type: "function", name: "escrowCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "getEscrow", stateMutability: "view", inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "buyer", type: "address" }, { name: "seller", type: "address" }, { name: "token", type: "address" },
      { name: "verifier", type: "address" }, { name: "amount", type: "uint256" }, { name: "deadline", type: "uint64" },
      { name: "createdAt", type: "uint64" }, { name: "createdBlock", type: "uint64" }, { name: "status", type: "uint8" },
    ] }],
  },
  { type: "function", name: "escrowsByBuyer", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "escrowsBySeller", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256[]" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export const ZERO = "0x0000000000000000000000000000000000000000";
export const STATES = ["none", "funded", "released", "refunded"] as const;
export type EscrowState = (typeof STATES)[number];

export type RawEscrow = {
  buyer: `0x${string}`; seller: `0x${string}`; token: `0x${string}`; verifier: `0x${string}`;
  amount: bigint; deadline: bigint; createdAt: bigint; createdBlock: bigint; status: number;
};

export type EscrowReader = {
  escrowCount(): Promise<bigint>;
  getEscrow(id: bigint): Promise<RawEscrow>;
  escrowsByBuyer(a: `0x${string}`): Promise<readonly bigint[]>;
  escrowsBySeller(a: `0x${string}`): Promise<readonly bigint[]>;
  tokenInfo(token: `0x${string}`): Promise<{ decimals: number; symbol: string | null }>;
};

export function viemEscrowReader(c: XEscrowChain, timeoutMs = 8000): EscrowReader {
  if (!c.factory) throw new Error(`${c.key}: X-Escrow not deployed`);
  const client = createPublicClient({ transport: fallback(c.rpcUrls.map((u) => http(u, { timeout: timeoutMs, retryCount: 1 }))) });
  const f = { address: c.factory, abi: ESCROW_ABI } as const;
  return {
    escrowCount: () => client.readContract({ ...f, functionName: "escrowCount" }),
    getEscrow: async (id) => (await client.readContract({ ...f, functionName: "getEscrow", args: [id] })) as RawEscrow,
    escrowsByBuyer: (a) => client.readContract({ ...f, functionName: "escrowsByBuyer", args: [a] }),
    escrowsBySeller: (a) => client.readContract({ ...f, functionName: "escrowsBySeller", args: [a] }),
    tokenInfo: async (token) => {
      if (token === ZERO) return { decimals: 18, symbol: "ETH" };
      const [d, s] = await Promise.allSettled([
        client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
        client.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }),
      ]);
      return { decimals: d.status === "fulfilled" ? Number(d.value) : 18, symbol: s.status === "fulfilled" ? s.value : null };
    },
  };
}

export type EscrowItem = {
  chain: string;
  chainId: number;
  caip2: string;
  testnet: boolean;
  factory: string;
  escrowId: number;
  state: EscrowState;
  buyer: string;
  seller: string;
  token: { address: string; symbol: string | null; decimals: number; native: boolean };
  amount: string;
  amountRaw: string;
  deadline: string;
  verifier: string | null;
  createdAt: string;
  createdBlock: number;
  refundableNow: boolean;
  secondsToDeadline: number;
  escrowUrl: string;
};

export type EscrowChainResult = { chain: string; chainId: number; status: "ok" | "error"; error?: string; found: number; truncated?: boolean };

export type EscrowStatusResponse = {
  query: { chain: string | null; id: number | null; address: string | null };
  found: boolean;
  checkedAt: string;
  chainsChecked: string[];
  chainsFailed: string[];
  total: number;
  escrows: EscrowItem[];
  chains: EscrowChainResult[];
  source: string;
};

/** Address queries return at most this many escrows per chain (newest first). */
export const MAX_PER_CHAIN = 50;
const iso = (s: bigint) => new Date(Number(s) * 1000).toISOString();

async function toItem(c: XEscrowChain, id: bigint, e: RawEscrow, r: EscrowReader, nowSec: bigint): Promise<EscrowItem> {
  const t = await r.tokenInfo(e.token);
  const state = STATES[e.status] ?? "none";
  return {
    chain: c.key,
    chainId: c.chainId,
    caip2: `eip155:${c.chainId}`,
    testnet: !!c.testnet,
    factory: c.factory!,
    escrowId: Number(id),
    state,
    buyer: e.buyer,
    seller: e.seller,
    token: { address: e.token, symbol: t.symbol, decimals: t.decimals, native: e.token === ZERO },
    amount: formatUnits(e.amount, t.decimals),
    amountRaw: e.amount.toString(),
    deadline: iso(e.deadline),
    verifier: e.verifier === ZERO ? null : e.verifier,
    createdAt: iso(e.createdAt),
    createdBlock: Number(e.createdBlock),
    refundableNow: state === "funded" && nowSec >= e.deadline,
    secondsToDeadline: Math.max(0, Number(e.deadline - nowSec)),
    escrowUrl: escrowUrl(c, id),
  };
}

type Query = { id?: bigint; address?: `0x${string}` };

async function scanChain(c: XEscrowChain, q: Query, r: EscrowReader, nowSec: bigint): Promise<{ result: EscrowChainResult; items: EscrowItem[] }> {
  const base = { chain: c.key, chainId: c.chainId };
  try {
    let ids: bigint[];
    let truncated = false;
    if (q.id !== undefined) {
      ids = q.id >= 1n && q.id <= (await r.escrowCount()) ? [q.id] : [];
    } else {
      const [b, s] = await Promise.all([r.escrowsByBuyer(q.address!), r.escrowsBySeller(q.address!)]);
      const all = [...new Set([...b, ...s].map(String))].map(BigInt).sort((x, y) => (y > x ? 1 : y < x ? -1 : 0));
      truncated = all.length > MAX_PER_CHAIN;
      ids = all.slice(0, MAX_PER_CHAIN);
    }
    const items = await Promise.all(ids.map(async (id) => toItem(c, id, await r.getEscrow(id), r, nowSec)));
    return { result: { ...base, status: "ok", found: items.length, ...(truncated ? { truncated } : {}) }, items };
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : String(e);
    return { result: { ...base, status: "error", error: `RPC read failed: ${msg}`, found: 0 }, items: [] };
  }
}

type CacheEntry = { at: number; value: Awaited<ReturnType<typeof scanChain>> };
const cache = new Map<string, CacheEntry>();
/** Shorter than lock-status: escrow state flips on release/refund. */
export const CACHE_TTL_MS = 15_000;
export function clearEscrowStatusCache() { cache.clear(); }

export async function buildEscrowStatus(opts: {
  id?: number;
  address?: `0x${string}`;
  chain?: string | null;
  chains?: XEscrowChain[];
  readerFor?: (c: XEscrowChain) => EscrowReader;
  now?: Date;
}): Promise<EscrowStatusResponse> {
  const chains = (opts.chains ?? liveEscrowChains()).filter((c) => c.factory);
  const readerFor = opts.readerFor ?? ((c) => viemEscrowReader(c));
  const now = opts.now ?? new Date();
  const nowSec = BigInt(Math.floor(now.getTime() / 1000));
  const q: Query = opts.id !== undefined ? { id: BigInt(opts.id) } : { address: opts.address!.toLowerCase() as `0x${string}` };
  const scans = await Promise.all(chains.map(async (c) => {
    const k = `${c.chainId}:${q.id ?? q.address}`;
    const hit = cache.get(k);
    if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.value;
    const v = await scanChain(c, q, readerFor(c), nowSec);
    if (v.result.status === "ok") cache.set(k, { at: now.getTime(), value: v }); // never cache failures
    return v;
  }));
  const escrows = scans.flatMap((s) => s.items);
  return {
    query: { chain: opts.chain ?? null, id: opts.id ?? null, address: opts.address ?? null },
    found: escrows.length > 0,
    checkedAt: now.toISOString(),
    chainsChecked: scans.filter((s) => s.result.status === "ok").map((s) => s.result.chain),
    chainsFailed: scans.filter((s) => s.result.status === "error").map((s) => s.result.chain),
    total: escrows.length,
    escrows,
    chains: scans.map((s) => s.result),
    source: "X-Escrow factory contracts (onchain reads). Verify any escrow at its escrowUrl.",
  };
}
