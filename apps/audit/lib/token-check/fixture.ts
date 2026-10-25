/**
 * Deterministic mock data for /api/token-check tests AND the Bazaar output example.
 * Illustrative only: a made-up token with an active owner, a mint + blacklist
 * function, thin liquidity and a one-sided order flow.
 */
import type { Hex } from "viem";
import { toFunctionSelector } from "viem";
import type { ChainReader, MarketFetcher, Pair } from "./core";
import type { Reader as LockReader } from "../lock-status/core";

export const EXAMPLE_TOKEN = "0x1111111111111111111111111111111111111111" as const;
export const EXAMPLE_OWNER = "0x2222222222222222222222222222222222222222" as const;
export const EXAMPLE_NOW = new Date("2026-10-25T12:00:00.000Z");
const E18 = 10n ** 18n;

const push4 = (sig: string) => "63" + toFunctionSelector(sig).slice(2);
/** Fake runtime code containing a dispatcher with transfer, mint and blacklist. */
export const FIXTURE_CODE = ("0x6080604052" + push4("transfer(address,uint256)") + push4("mint(address,uint256)") + push4("blacklist(address)") + "00") as Hex;

export function fixtureReader(over: Partial<{ code: Hex; owner: `0x${string}` | null; implSlot: Hex; ownerBal: bigint }> = {}): ChainReader {
  return {
    code: async () => over.code ?? FIXTURE_CODE,
    slot: async (_a, s) => (over.implSlot && s.startsWith("0x3608") ? over.implSlot : ("0x" + "0".repeat(64)) as Hex),
    erc20: async () => ({ name: "Example Token", symbol: "EXMPL", decimals: 18, totalSupply: 1_000_000_000n * E18 }),
    owner: async () => (over.owner === undefined ? EXAMPLE_OWNER : over.owner),
    balanceOf: async (_t, who) => {
      if (who.toLowerCase() === EXAMPLE_OWNER) return over.ownerBal ?? 180_000_000n * E18;
      if (who.toLowerCase() === "0x000000000000000000000000000000000000dead") return 50_000_000n * E18;
      return 0n;
    },
  };
}

export const FIXTURE_PAIR: Pair = {
  dex: "uniswap", pairAddress: "0x3333333333333333333333333333333333333333",
  url: "https://dexscreener.com/base/0x3333333333333333333333333333333333333333", quoteSymbol: "WETH",
  liquidityUsd: 6400, priceUsd: "0.0000123", volume24hUsd: 18250, buys24h: 41, sells24h: 0,
  createdAt: "2026-10-25T03:00:00.000Z",
};

export const fixtureMarket = (pairs: Pair[] = [FIXTURE_PAIR]): MarketFetcher => async () => pairs;
export const failingMarket: MarketFetcher = async () => { throw new Error("down"); };

export const noLocks: LockReader = {
  locksByToken: async () => [],
  getLock: async () => { throw new Error("none"); },
  released: async () => 0n,
  releasable: async () => 0n,
  tokenInfo: async () => ({ decimals: 18, symbol: null, totalSupply: null }),
};
