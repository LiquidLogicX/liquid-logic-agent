/**
 * Deterministic mock X-Lock data used by tests AND to produce the Bazaar
 * output example. Illustrative only: as of 2026-10-14 the mainnet factories
 * hold no locks, so there is no real lock to quote yet.
 */
import type { RawLock, Reader } from "./core";

export const EXAMPLE_TOKEN = "0x1111111111111111111111111111111111111111" as const;
export const EXAMPLE_NOW = new Date("2026-10-14T12:00:00.000Z");
const D = 86_400n;
const T0 = BigInt(Math.floor(EXAMPLE_NOW.getTime() / 1000));
const E18 = 10n ** 18n;

export const FIXTURE_LOCKS: Record<string, RawLock> = {
  "1": { // team vesting: 90d cliff then linear to 365d, started 30d ago
    wallet: "0x2222222222222222222222222222222222222222", token: EXAMPLE_TOKEN,
    creator: "0x3333333333333333333333333333333333333333", beneficiary: "0x4444444444444444444444444444444444444444",
    amount: 150_000_000n * E18, start: T0 - 30n * D, cliffDuration: 90n * D, duration: 365n * D,
    createdAt: T0 - 30n * D, createdBlock: 36_000_000n, kind: 1,
  },
  "2": { // LP-style time lock, unlocks in 180d
    wallet: "0x5555555555555555555555555555555555555555", token: EXAMPLE_TOKEN,
    creator: "0x3333333333333333333333333333333333333333", beneficiary: "0x3333333333333333333333333333333333333333",
    amount: 50_000_000n * E18, start: T0 + 180n * D, cliffDuration: 0n, duration: 0n,
    createdAt: T0 - 10n * D, createdBlock: 36_400_000n, kind: 0,
  },
};

export function fixtureReader(locks: Record<string, RawLock> = FIXTURE_LOCKS): Reader {
  return {
    locksByToken: async (t) => Object.entries(locks).filter(([, l]) => l.token.toLowerCase() === t.toLowerCase()).map(([id]) => BigInt(id)),
    getLock: async (id) => locks[id.toString()],
    released: async () => 0n,
    releasable: async () => 0n,
    tokenInfo: async () => ({ decimals: 18, symbol: "EXAMPLE", totalSupply: 1_000_000_000n * E18 }),
  };
}

export const emptyReader: Reader = { ...fixtureReader({}) };
export const failingReader: Reader = {
  ...fixtureReader({}),
  locksByToken: async () => { throw new Error("fetch failed (mock RPC down)"); },
};
