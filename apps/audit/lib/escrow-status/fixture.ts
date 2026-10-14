/**
 * Deterministic mock X-Escrow data used by tests AND to produce the Bazaar
 * output example. Mirrors the real Base Sepolia smoke escrows (#1 refunded,
 * #2 released) plus one funded escrow, with illustrative times.
 */
import type { EscrowReader, RawEscrow } from "./core";

export const EXAMPLE_NOW = new Date("2026-10-14T21:00:00.000Z");
export const BUYER = "0x793E8C977CB0c188332a72E34e9774dc1Dc762a0" as const;
export const SELLER = "0x000000000000000000000000000000000000dEaD" as const;
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const T0 = BigInt(Math.floor(EXAMPLE_NOW.getTime() / 1000));

export const FIXTURE_ESCROWS: Record<string, RawEscrow> = {
  "1": { buyer: BUYER, seller: SELLER, token: USDC, verifier: "0x0000000000000000000000000000000000000000", amount: 1_000_000n, deadline: T0 - 3600n, createdAt: T0 - 3660n, createdBlock: 48_121_000n, status: 3 },
  "2": { buyer: BUYER, seller: SELLER, token: USDC, verifier: "0x0000000000000000000000000000000000000000", amount: 1_000_000n, deadline: T0 + 86_400n, createdAt: T0 - 3000n, createdBlock: 48_121_300n, status: 2 },
  "3": { buyer: BUYER, seller: SELLER, token: USDC, verifier: "0x0000000000000000000000000000000000000000", amount: 25_000_000n, deadline: T0 + 7n * 86_400n, createdAt: T0 - 600n, createdBlock: 48_122_000n, status: 1 },
};

export function fixtureEscrowReader(escrows: Record<string, RawEscrow> = FIXTURE_ESCROWS): EscrowReader {
  const by = (k: "buyer" | "seller") => async (a: `0x${string}`) =>
    Object.entries(escrows).filter(([, e]) => e[k].toLowerCase() === a.toLowerCase()).map(([id]) => BigInt(id));
  return {
    escrowCount: async () => BigInt(Object.keys(escrows).length),
    getEscrow: async (id) => escrows[id.toString()],
    escrowsByBuyer: by("buyer"),
    escrowsBySeller: by("seller"),
    tokenInfo: async () => ({ decimals: 6, symbol: "USDC" }),
  };
}

export const failingEscrowReader: EscrowReader = {
  ...fixtureEscrowReader({}),
  escrowCount: async () => { throw new Error("fetch failed (mock RPC down)"); },
  escrowsByBuyer: async () => { throw new Error("fetch failed (mock RPC down)"); },
};
