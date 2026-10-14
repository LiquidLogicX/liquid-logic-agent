/**
 * /api/lock-status core: read-only X-Lock lookups across chains.
 * RPC access goes through an injectable `Reader` so tests can mock it.
 */
import { createPublicClient, fallback, formatUnits, http } from "viem";
import { XLOCK_CHAINS, lockUrl, type XLockChain } from "./chains";

export const FACTORY_ABI = [
  { type: "function", name: "locksByToken", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256[]" }] },
  {
    type: "function", name: "getLock", stateMutability: "view", inputs: [{ name: "lockId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "wallet", type: "address" }, { name: "token", type: "address" }, { name: "creator", type: "address" },
      { name: "beneficiary", type: "address" }, { name: "amount", type: "uint256" }, { name: "start", type: "uint64" },
      { name: "cliffDuration", type: "uint64" }, { name: "duration", type: "uint64" }, { name: "createdAt", type: "uint64" },
      { name: "createdBlock", type: "uint64" }, { name: "kind", type: "uint8" },
    ] }],
  },
] as const;

export const WALLET_ABI = [
  { type: "function", name: "released", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "releasable", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export type RawLock = {
  wallet: `0x${string}`; token: `0x${string}`; creator: `0x${string}`; beneficiary: `0x${string}`;
  amount: bigint; start: bigint; cliffDuration: bigint; duration: bigint; createdAt: bigint; createdBlock: bigint; kind: number;
};

/** Minimal read surface (one per chain). */
export type Reader = {
  locksByToken(token: `0x${string}`): Promise<readonly bigint[]>;
  getLock(id: bigint): Promise<RawLock>;
  released(wallet: `0x${string}`, token: `0x${string}`): Promise<bigint>;
  releasable(wallet: `0x${string}`, token: `0x${string}`): Promise<bigint>;
  tokenInfo(token: `0x${string}`): Promise<{ decimals: number; symbol: string | null; totalSupply: bigint | null }>;
};

export function viemReader(c: XLockChain, timeoutMs = 8000): Reader {
  const client = createPublicClient({
    transport: fallback(c.rpcUrls.map((u) => http(u, { timeout: timeoutMs, retryCount: 1 }))),
  });
  const f = { address: c.factory, abi: FACTORY_ABI } as const;
  return {
    locksByToken: (token) => client.readContract({ ...f, functionName: "locksByToken", args: [token] }),
    getLock: async (id) => (await client.readContract({ ...f, functionName: "getLock", args: [id] })) as RawLock,
    released: (wallet, token) => client.readContract({ address: wallet, abi: WALLET_ABI, functionName: "released", args: [token] }),
    releasable: (wallet, token) => client.readContract({ address: wallet, abi: WALLET_ABI, functionName: "releasable", args: [token] }),
    tokenInfo: async (token) => {
      const [d, s, t] = await Promise.allSettled([
        client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
        client.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }),
        client.readContract({ address: token, abi: ERC20_ABI, functionName: "totalSupply" }),
      ]);
      return {
        decimals: d.status === "fulfilled" ? Number(d.value) : 18,
        symbol: s.status === "fulfilled" ? s.value : null,
        totalSupply: t.status === "fulfilled" ? t.value : null,
      };
    },
  };
}

export type LockStatusLock = {
  lockId: number;
  kind: "timelock" | "vesting";
  lockWallet: string;
  beneficiary: string;
  creator: string;
  amount: string;
  amountRaw: string;
  start: string;
  cliff: string;
  end: string;
  released: string;
  claimable: string;
  stillLocked: string;
  status: "locked" | "vesting" | "unlocked" | "fully_released";
  lockUrl: string;
};

export type ChainResult = {
  chain: string;
  chainId: number;
  caip2: string;
  factory: string;
  status: "ok" | "error";
  error?: string;
  token?: { symbol: string | null; decimals: number; totalSupply: string | null };
  lockCount: number;
  totalLockedAmount: string;
  totalLockedRaw: string;
  pctOfSupplyLocked: number | null;
  nextUnlock: { lockId: number; at: string; amount: string; lockUrl: string } | null;
  locks: LockStatusLock[];
};

export type LockStatusResponse = {
  token: string;
  isLocked: boolean;
  checkedAt: string;
  chainsChecked: string[];
  chainsFailed: string[];
  totalLocks: number;
  nextUnlock: { chain: string; lockId: number; at: string; amount: string; lockUrl: string } | null;
  chains: ChainResult[];
  source: string;
};

const iso = (s: bigint) => new Date(Number(s) * 1000).toISOString();

/** Vested-to-date, same rule as the XLockWallet (OZ VestingWalletCliff) schedule. */
export function vestedAt(l: RawLock, now: bigint): bigint {
  if (l.kind === 0) return now >= l.start ? l.amount : 0n;
  const cliff = l.start + l.cliffDuration;
  const end = l.start + l.duration;
  if (now < cliff) return 0n;
  if (now >= end || l.duration === 0n) return l.amount;
  return (l.amount * (now - l.start)) / l.duration;
}

export async function scanChain(c: XLockChain, token: `0x${string}`, r: Reader, nowSec: bigint): Promise<ChainResult> {
  const base: ChainResult = {
    chain: c.key, chainId: c.chainId, caip2: `eip155:${c.chainId}`, factory: c.factory, status: "ok",
    lockCount: 0, totalLockedAmount: "0", totalLockedRaw: "0", pctOfSupplyLocked: null, nextUnlock: null, locks: [],
  };
  try {
    const ids = await r.locksByToken(token);
    if (ids.length === 0) return base;
    const info = await r.tokenInfo(token);
    const fmt = (v: bigint) => formatUnits(v, info.decimals);
    let lockedSum = 0n;
    let next: ChainResult["nextUnlock"] = null;
    let nextAt = 0n;
    const locks = await Promise.all(ids.map(async (id) => {
      const l = await r.getLock(id);
      const [released, claimable] = await Promise.all([r.released(l.wallet, token), r.releasable(l.wallet, token)]);
      const vested = vestedAt(l, nowSec);
      const stillLocked = l.amount > vested ? l.amount - vested : 0n;
      lockedSum += stillLocked;
      const cliff = l.kind === 0 ? l.start : l.start + l.cliffDuration;
      const end = l.kind === 0 ? l.start : l.start + l.duration;
      // Next unlock event: time lock -> unlock time; vesting -> cliff if ahead, else vesting end (linear until then).
      const evAt = nowSec < cliff ? cliff : nowSec < end ? end : 0n;
      const evAmt = nowSec < cliff ? (l.kind === 0 ? l.amount : vestedAt(l, cliff)) : stillLocked;
      const url = lockUrl(c, id);
      if (evAt > 0n && stillLocked > 0n && (next === null || evAt < nextAt)) {
        nextAt = evAt;
        next = { lockId: Number(id), at: iso(evAt), amount: fmt(evAmt), lockUrl: url };
      }
      const status: LockStatusLock["status"] =
        stillLocked === 0n ? (released >= l.amount ? "fully_released" : "unlocked") : vested > 0n ? "vesting" : "locked";
      return {
        lockId: Number(id), kind: l.kind === 0 ? "timelock" : "vesting", lockWallet: l.wallet,
        beneficiary: l.beneficiary, creator: l.creator, amount: fmt(l.amount), amountRaw: l.amount.toString(),
        start: iso(l.start), cliff: iso(cliff), end: iso(end), released: fmt(released), claimable: fmt(claimable),
        stillLocked: fmt(stillLocked), status, lockUrl: url,
      } satisfies LockStatusLock;
    }));
    locks.sort((a, b) => a.lockId - b.lockId);
    const pct = info.totalSupply && info.totalSupply > 0n
      ? Number((lockedSum * 1_000_000n) / info.totalSupply) / 10_000 : null;
    return {
      ...base,
      token: { symbol: info.symbol, decimals: info.decimals, totalSupply: info.totalSupply === null ? null : fmt(info.totalSupply) },
      lockCount: locks.length, totalLockedAmount: fmt(lockedSum), totalLockedRaw: lockedSum.toString(),
      pctOfSupplyLocked: pct, nextUnlock: next, locks,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : String(e);
    return { ...base, status: "error", error: `RPC read failed: ${msg}` };
  }
}

type CacheEntry = { at: number; value: ChainResult };
const cache = new Map<string, CacheEntry>();
export const CACHE_TTL_MS = 60_000;
export function clearLockStatusCache() { cache.clear(); }

export async function buildLockStatus(opts: {
  token: `0x${string}`;
  chains?: XLockChain[];
  readerFor?: (c: XLockChain) => Reader;
  now?: Date;
}): Promise<LockStatusResponse> {
  const chains = opts.chains ?? XLOCK_CHAINS;
  const readerFor = opts.readerFor ?? ((c) => viemReader(c));
  const now = opts.now ?? new Date();
  const nowSec = BigInt(Math.floor(now.getTime() / 1000));
  const token = opts.token.toLowerCase() as `0x${string}`;
  const results = await Promise.all(chains.map(async (c) => {
    const k = `${c.chainId}:${token}`;
    const hit = cache.get(k);
    if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.value;
    const v = await scanChain(c, token, readerFor(c), nowSec);
    if (v.status === "ok") cache.set(k, { at: now.getTime(), value: v }); // never cache failures
    return v;
  }));
  let next: LockStatusResponse["nextUnlock"] = null;
  for (const r of results) {
    if (r.nextUnlock && (!next || r.nextUnlock.at < next.at)) next = { chain: r.chain, ...r.nextUnlock };
  }
  return {
    token: opts.token,
    isLocked: results.some((r) => r.totalLockedRaw !== "0"),
    checkedAt: now.toISOString(),
    chainsChecked: results.filter((r) => r.status === "ok").map((r) => r.chain),
    chainsFailed: results.filter((r) => r.status === "error").map((r) => r.chain),
    totalLocks: results.reduce((n, r) => n + r.lockCount, 0),
    nextUnlock: next,
    chains: results,
    source: "X-Lock factory contracts (onchain reads). Verify any lock at its lockUrl.",
  };
}
