/**
 * /api/token-check core: "is this Base token safe to buy?" in one call.
 * Read-only onchain checks (contract, ERC-20, owner, upgradeable proxy, admin
 * powers found in the bytecode, owner/burn balances, X-Lock locks) plus
 * public DEX market data (liquidity, pair age, 24h buys vs sells).
 *
 * Every outside read goes through injectable deps so tests run with no network.
 * It reports evidence + flags; it never claims a token is "safe".
 */
import { createPublicClient, fallback, formatUnits, http, toFunctionSelector, type Hex } from "viem";
import { buildLockStatus, type Reader as LockReader } from "../lock-status/core";
import { XLOCK_CHAINS } from "../lock-status/chains";

export const BASE_RPCS = ["https://mainnet.base.org", "https://base-rpc.publicnode.com"];
export const DEAD = "0x000000000000000000000000000000000000dEaD" as const;
export const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** EIP-1967 storage slots. */
export const SLOT_IMPL = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
export const SLOT_ADMIN = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
export const SLOT_BEACON = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as const;
/** Older ZeppelinOS slots (used by Circle's FiatTokenProxy, e.g. USDC). */
export const SLOT_ZOS_IMPL = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3" as const;
export const SLOT_ZOS_ADMIN = "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b" as const;

/** Regulated / issuer-run assets on Base: admin powers are expected, so they are reported as info. */
export const KNOWN_ISSUERS: Record<string, string> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "Circle (USDC)",
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": "Circle (EURC)",
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": "Circle (USDbC, bridged)",
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": "Coinbase (cbBTC)",
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": "Coinbase (cbETH)",
};

export type Severity = "high" | "medium" | "low" | "info";
export type Flag = { code: string; severity: Severity; message: string };

/** Admin powers we look for in the contract's function table (PUSH4 selectors). */
export const POWERS: { power: string; severity: Exclude<Severity, "info">; sigs: string[] }[] = [
  { power: "mint", severity: "high", sigs: ["mint(address,uint256)", "mint(uint256)", "mintTo(address,uint256)", "issue(uint256)"] },
  { power: "blacklist", severity: "high", sigs: [
    "blacklist(address)", "addToBlacklist(address)", "setBlacklist(address,bool)", "blacklistAddress(address,bool)",
    "addBot(address)", "addBots(address[])", "setBots(address[])", "setBot(address,bool)", "blockBots(address[])",
    "setBlacklisted(address,bool)", "updateBlacklist(address,bool)",
  ] },
  { power: "fees", severity: "medium", sigs: [
    "setFee(uint256)", "setFees(uint256,uint256)", "setTaxFee(uint256)", "setTax(uint256)", "setBuyFee(uint256)",
    "setSellFee(uint256)", "setBuyTax(uint256)", "setSellTax(uint256)", "updateFees(uint256,uint256)",
    "updateBuyFees(uint256,uint256,uint256)", "updateSellFees(uint256,uint256,uint256)", "setTaxes(uint256,uint256)",
  ] },
  { power: "pause", severity: "medium", sigs: ["pause()", "setPaused(bool)", "pauseTrading()"] },
  { power: "trading-switch", severity: "medium", sigs: ["enableTrading()", "openTrading()", "setTradingEnabled(bool)", "setTrading(bool)", "startTrading()"] },
  { power: "max-tx", severity: "low", sigs: ["setMaxTxAmount(uint256)", "setMaxWalletSize(uint256)", "setMaxWallet(uint256)", "setMaxTxPercent(uint256)", "updateMaxTxnAmount(uint256)"] },
];

const SELECTORS = POWERS.map((p) => ({ ...p, selectors: p.sigs.map((s) => toFunctionSelector(s).slice(2).toLowerCase()) }));

/** Which admin powers appear in the dispatcher (PUSH4 <selector>). */
export function findPowers(code: Hex): string[] {
  const c = code.toLowerCase();
  return SELECTORS.filter((p) => p.selectors.some((s) => c.includes("63" + s))).map((p) => p.power);
}

/** EIP-1167 minimal proxy → implementation address. */
export function minimalProxyTarget(code: Hex): `0x${string}` | null {
  const m = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91/i.exec(code);
  return m ? (`0x${m[1]}` as `0x${string}`) : null;
}

const slotAddr = (v: Hex | undefined | null): `0x${string}` | null => {
  if (!v || /^0x0*$/.test(v)) return null;
  return (`0x${v.slice(-40)}`) as `0x${string}`;
};

export type ChainReader = {
  code(a: `0x${string}`): Promise<Hex | undefined>;
  slot(a: `0x${string}`, s: Hex): Promise<Hex | undefined>;
  erc20(t: `0x${string}`): Promise<{ name: string | null; symbol: string | null; decimals: number | null; totalSupply: bigint | null }>;
  owner(t: `0x${string}`): Promise<`0x${string}` | null>;
  balanceOf(t: `0x${string}`, who: `0x${string}`): Promise<bigint | null>;
};

export type Pair = {
  dex: string; pairAddress: string; url: string; quoteSymbol: string | null;
  liquidityUsd: number | null; priceUsd: string | null; volume24hUsd: number | null;
  buys24h: number | null; sells24h: number | null; createdAt: string | null;
};
export type MarketFetcher = (token: `0x${string}`) => Promise<Pair[]>;

const ERC20 = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getOwner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export function viemBaseReader(timeoutMs = 6000): ChainReader {
  const client = createPublicClient({ transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: timeoutMs, retryCount: 1 }))) });
  const read = async <T>(address: `0x${string}`, functionName: string, args: unknown[] = []): Promise<T | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await client.readContract({ address, abi: ERC20, functionName: functionName as any, args: args as any })) as T;
    } catch { return null; }
  };
  return {
    code: (a) => client.getCode({ address: a }),
    slot: (a, s) => client.getStorageAt({ address: a, slot: s }),
    erc20: async (t) => {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        read<string>(t, "name"), read<string>(t, "symbol"), read<number>(t, "decimals"), read<bigint>(t, "totalSupply"),
      ]);
      return { name, symbol, decimals: decimals === null ? null : Number(decimals), totalSupply };
    },
    owner: async (t) => (await read<`0x${string}`>(t, "owner")) ?? (await read<`0x${string}`>(t, "getOwner")),
    balanceOf: (t, who) => read<bigint>(t, "balanceOf", [who]),
  };
}

/** DexScreener public API (no key). Base pairs only, biggest liquidity first. */
export const dexScreenerMarket: MarketFetcher = async (token) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`dexscreener ${res.status}`);
    const j = (await res.json()) as { pairs?: Record<string, any>[] | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
    return (j.pairs ?? [])
      .filter((p) => p.chainId === "base")
      .map((p): Pair => ({
        dex: String(p.dexId ?? "unknown"), pairAddress: String(p.pairAddress ?? ""), url: String(p.url ?? ""),
        quoteSymbol: p.quoteToken?.symbol ?? null,
        liquidityUsd: typeof p.liquidity?.usd === "number" ? p.liquidity.usd : null,
        priceUsd: p.priceUsd ?? null,
        volume24hUsd: typeof p.volume?.h24 === "number" ? p.volume.h24 : null,
        buys24h: typeof p.txns?.h24?.buys === "number" ? p.txns.h24.buys : null,
        sells24h: typeof p.txns?.h24?.sells === "number" ? p.txns.h24.sells : null,
        createdAt: typeof p.pairCreatedAt === "number" ? new Date(p.pairCreatedAt).toISOString() : null,
      }))
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
  } finally { clearTimeout(timer); }
};

export type TokenCheckDeps = {
  reader?: ChainReader;
  market?: MarketFetcher;
  lockReader?: LockReader;
  now?: Date;
};

export type TokenCheckResponse = {
  token: string;
  chain: "base";
  checkedAt: string;
  risk: "high" | "medium" | "low";
  score: number;
  summary: string;
  flags: Flag[];
  contract: {
    name: string | null; symbol: string | null; decimals: number | null; totalSupply: string | null;
    owner: string | null; ownerRenounced: boolean;
    upgradeable: boolean; proxyImplementation: string | null; proxyAdmin: string | null;
    adminPowersInCode: string[];
    knownIssuer: string | null;
  };
  holders: { ownerPct: number | null; burnedPct: number | null };
  market: {
    status: "ok" | "unavailable";
    pairCount: number;
    totalLiquidityUsd: number | null;
    topPair: Pair | null;
  };
  locks: { xlockLocked: boolean; pctOfSupplyLocked: number | null; nextUnlock: string | null; lockUrls: string[] };
  notChecked: string[];
  links: { basescan: string; dexscreener: string };
  source: string;
};

export class NotAContractError extends Error {}

const pct = (part: bigint | null, total: bigint | null): number | null =>
  part === null || total === null || total === 0n ? null : Number((part * 1_000_000n) / total) / 10_000;

const SCORE = { high: 35, medium: 15, low: 5, info: 0 } as const;

type CacheEntry = { at: number; value: TokenCheckResponse };
const cache = new Map<string, CacheEntry>();
export const CACHE_TTL_MS = 60_000;
export function clearTokenCheckCache() { cache.clear(); }

export async function buildTokenCheck(tokenIn: `0x${string}`, deps: TokenCheckDeps = {}): Promise<TokenCheckResponse> {
  const now = deps.now ?? new Date();
  const token = tokenIn.toLowerCase() as `0x${string}`;
  const hit = cache.get(token);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.value;

  const r = deps.reader ?? viemBaseReader();
  const market = deps.market ?? dexScreenerMarket;

  const code = await r.code(token); // throws on RPC failure → handler returns 503 (free)
  if (!code || code === "0x") throw new NotAContractError("No contract code at this address on Base.");

  const [meta, owner, implSlot, adminSlot, beaconSlot, zosImpl, zosAdmin, burn0, burnDead, mkt, locks] = await Promise.all([
    r.erc20(token), r.owner(token), r.slot(token, SLOT_IMPL), r.slot(token, SLOT_ADMIN), r.slot(token, SLOT_BEACON),
    r.slot(token, SLOT_ZOS_IMPL), r.slot(token, SLOT_ZOS_ADMIN),
    r.balanceOf(token, ZERO), r.balanceOf(token, DEAD),
    market(token).then((pairs) => ({ ok: true as const, pairs })).catch(() => ({ ok: false as const, pairs: [] as Pair[] })),
    buildLockStatus({
      token, now, chains: XLOCK_CHAINS.filter((c) => c.key === "base"),
      ...(deps.lockReader ? { readerFor: () => deps.lockReader! } : {}),
    }).catch(() => null),
  ]);

  const flags: Flag[] = [];
  const issuer = KNOWN_ISSUERS[token] ?? null;
  // Known issuers keep their admin powers on purpose: still reported, but as info.
  const add = (code: string, severity: Severity, message: string) =>
    flags.push({ code, severity: issuer && /^(UPGRADEABLE|POWER_)/.test(code) ? "info" : severity, message });
  if (issuer) add("KNOWN_ISSUER", "info", `Issued by ${issuer}. The issuer can freeze, mint or upgrade, as with any regulated asset.`);

  // Proxy / implementation code
  const minimal = minimalProxyTarget(code);
  const impl = slotAddr(implSlot) ?? slotAddr(zosImpl) ?? minimal;
  const beacon = slotAddr(beaconSlot);
  const admin = slotAddr(adminSlot) ?? slotAddr(zosAdmin);
  const upgradeable = !!(slotAddr(implSlot) || slotAddr(zosImpl) || beacon);
  let scanCode: Hex = code;
  if (impl) {
    const implCode = await r.code(impl).catch(() => undefined);
    if (implCode && implCode !== "0x") scanCode = (code + implCode.slice(2)) as Hex;
  }
  if (upgradeable) add("UPGRADEABLE", "medium", "Upgradeable proxy: the team can replace the token's code at any time.");

  const isErc20 = meta.totalSupply !== null && meta.decimals !== null;
  if (!isErc20) add("NOT_ERC20", "high", "Does not answer totalSupply/decimals like an ERC-20 token.");

  const renounced = owner !== null && (owner.toLowerCase() === ZERO || owner.toLowerCase() === DEAD.toLowerCase());
  const ownerLive = owner !== null && !renounced;
  if (renounced) add("OWNER_RENOUNCED", "info", "Ownership renounced (owner is the zero or dead address).");

  // Admin powers: only dangerous while someone can use them.
  const powers = findPowers(scanCode);
  for (const p of POWERS.filter((x) => powers.includes(x.power))) {
    const label = p.power.replace("-", " ");
    if (ownerLive || upgradeable) {
      add(`POWER_${p.power.toUpperCase().replace("-", "_")}`, p.severity,
        `Has a ${label} function and ${ownerLive ? `an active owner (${owner})` : "upgradeable code"}.`);
    } else {
      add(`POWER_${p.power.toUpperCase().replace("-", "_")}_NO_OWNER`, "low", renounced
        ? `Has a ${label} function, but ownership is renounced.`
        : `Has a ${label} function and no owner() to check: it may be held by a role or minter address.`);
    }
  }

  // Holders we can see without an indexer
  const ownerBal = ownerLive ? await r.balanceOf(token, owner!) : null;
  const ownerPct = pct(ownerBal, meta.totalSupply);
  const burned = burn0 === null && burnDead === null ? null : (burn0 ?? 0n) + (burnDead ?? 0n);
  const burnedPct = pct(burned, meta.totalSupply);
  if (issuer) { /* treasury balances of issuers are not a dump risk signal */ }
  else if (ownerPct !== null && ownerPct >= 50) add("OWNER_HOLDS_MAJORITY", "high", `Owner wallet holds ${ownerPct}% of supply.`);
  else if (ownerPct !== null && ownerPct >= 15) add("OWNER_HOLDS_LARGE", "medium", `Owner wallet holds ${ownerPct}% of supply.`);

  // Market
  const pairs = mkt.pairs;
  const top = pairs[0] ?? null;
  const totalLiq = pairs.length ? pairs.reduce((s, p) => s + (p.liquidityUsd ?? 0), 0) : null;
  if (mkt.ok) {
    if (pairs.length === 0) add("NO_DEX_PAIR", "medium", "No Base DEX pair found on DexScreener: it may trade only on a bonding curve, or not at all.");
    else {
      if (totalLiq !== null && totalLiq < 1_000) add("LIQUIDITY_TINY", "high", `Only $${Math.round(totalLiq)} liquidity across Base pairs.`);
      else if (totalLiq !== null && totalLiq < 10_000) add("LIQUIDITY_LOW", "medium", `Low liquidity: $${Math.round(totalLiq)} across Base pairs.`);
      const b = top?.buys24h ?? 0, s = top?.sells24h ?? 0;
      if (top && b >= 20 && s === 0) add("NO_SELLS_24H", "high", `${b} buys and 0 sells in 24h on the main pair: possible honeypot.`);
      else if (top && b >= 30 && s * 10 < b) add("FEW_SELLS_24H", "medium", `${b} buys vs ${s} sells in 24h on the main pair.`);
      const created = top?.createdAt ? Date.parse(top.createdAt) : NaN;
      if (!Number.isNaN(created) && now.getTime() - created < 86_400_000) add("PAIR_NEW", "medium", "Main pair is less than 24 hours old.");
    }
  }

  // X-Lock
  const baseLock = locks?.chains[0];
  if (locks?.isLocked) add("XLOCK_LOCKED", "info", `${baseLock?.pctOfSupplyLocked ?? "?"}% of supply locked in X-Lock.`);

  const sev = (s: Severity) => flags.filter((f) => f.severity === s).length;
  const risk: TokenCheckResponse["risk"] = sev("high") ? "high" : sev("medium") ? "medium" : "low";
  const score = Math.max(0, 100 - flags.reduce((n, f) => n + SCORE[f.severity], 0));
  const worst = flags.filter((f) => f.severity === risk || (risk === "low" && f.severity === "low"));
  const summary = risk === "low" && worst.length === 0
    ? "No red flags in the checks we ran. Not a guarantee."
    : `${risk.toUpperCase()} risk: ${worst.slice(0, 3).map((f) => f.message).join(" ")}`.slice(0, 400);

  const value: TokenCheckResponse = {
    token: tokenIn,
    chain: "base",
    checkedAt: now.toISOString(),
    risk,
    score,
    summary,
    flags,
    contract: {
      name: meta.name, symbol: meta.symbol, decimals: meta.decimals,
      totalSupply: meta.totalSupply === null ? null : formatUnits(meta.totalSupply, meta.decimals ?? 18),
      owner, ownerRenounced: renounced,
      upgradeable, proxyImplementation: impl, proxyAdmin: admin,
      adminPowersInCode: powers,
      knownIssuer: issuer,
    },
    holders: { ownerPct, burnedPct },
    market: { status: mkt.ok ? "ok" : "unavailable", pairCount: pairs.length, totalLiquidityUsd: totalLiq === null ? null : Math.round(totalLiq), topPair: top },
    locks: {
      xlockLocked: !!locks?.isLocked,
      pctOfSupplyLocked: baseLock?.pctOfSupplyLocked ?? null,
      nextUnlock: locks?.nextUnlock?.at ?? null,
      lockUrls: (baseLock?.locks ?? []).map((l) => l.lockUrl),
    },
    notChecked: [
      "sell simulation (a contract can still block sells in ways not visible here)",
      "full holder list beyond the owner and burn addresses",
      "liquidity locks on lockers other than X-Lock",
    ],
    links: { basescan: `https://basescan.org/token/${tokenIn}`, dexscreener: `https://dexscreener.com/base/${tokenIn}` },
    source: "Base onchain reads + DexScreener public market data, by Liquid Logic X. Evidence, not financial advice.",
  };
  cache.set(token, { at: now.getTime(), value });
  return value;
}
