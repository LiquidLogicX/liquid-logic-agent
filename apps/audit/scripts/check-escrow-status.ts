/**
 * /api/escrow-status unit tests (mocked RPC, no network, no payments).
 *   npm run check-escrow-status -w @liquid-logic/audit
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { escrowUrl, liveEscrowChains, resolveEscrowChain, XESCROW_CHAINS, XESCROW_BASE_FACTORY, XESCROW_TESTNET_FACTORY } from "../lib/escrow-status/chains";
import { buildEscrowStatus, clearEscrowStatusCache, MAX_PER_CHAIN, type EscrowReader, type RawEscrow } from "../lib/escrow-status/core";
import { BUYER, EXAMPLE_NOW, failingEscrowReader, FIXTURE_ESCROWS, fixtureEscrowReader, SELLER } from "../lib/escrow-status/fixture";
import { handleEscrowStatusInput } from "../lib/escrow-status/handler";
import { ESCROW_STATUS_OUTPUT_EXAMPLE } from "../lib/escrow-status/output-example";
import { ESCROW_STATUS_INPUT_SCHEMA } from "../lib/escrow-status/discovery";
import { ESCROW_STATUS_ROUTES } from "../lib/x402-server";

beforeEach(() => clearEscrowStatusCache());
const SEPOLIA_ONLY = [resolveEscrowChain("base-sepolia")!]; // fixtures mirror Base Sepolia; Base mainnet is also live now
const deps = { readerFor: () => fixtureEscrowReader(), now: EXAMPLE_NOW };

test("chains: Base mainnet + Base Sepolia live; other mainnet slots configured but empty", () => {
  assert.deepEqual(liveEscrowChains().map((c) => c.key), ["base", "base-sepolia"]);
  assert.equal(resolveEscrowChain("8453")!.factory, XESCROW_BASE_FACTORY);
  assert.equal(resolveEscrowChain("base")!.factory, "0xa01454C9102052a00dd9B7a5a2eDBA159E93e385");
  assert.equal(resolveEscrowChain("eip155:84532")!.factory, XESCROW_TESTNET_FACTORY);
  assert.equal(resolveEscrowChain("56")!.factory, null);
  assert.equal(XESCROW_CHAINS.length, 11);
  assert.equal(escrowUrl(resolveEscrowChain("base-sepolia")!, 2), "https://xlock.liquidlogicx.com/escrow/base-sepolia/2");
});

test("Bazaar output example equals what the code produces from the fixture", async () => {
  const r = await handleEscrowStatusInput({ chain: "base-sepolia", id: 3 }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(r.body)), JSON.parse(JSON.stringify(ESCROW_STATUS_OUTPUT_EXAMPLE)));
});

test("by id: states, verifier null, refundableNow only for funded past deadline", async () => {
  const one = (await buildEscrowStatus({ id: 1, ...deps })).escrows[0];
  assert.equal(one.state, "refunded");
  assert.equal(one.refundableNow, false);
  assert.equal(one.verifier, null);
  assert.equal((await buildEscrowStatus({ id: 2, ...deps })).escrows[0].state, "released");
  const past = { ...FIXTURE_ESCROWS, "3": { ...FIXTURE_ESCROWS["3"], deadline: 1n } };
  const r = await buildEscrowStatus({ id: 3, readerFor: () => fixtureEscrowReader(past), now: EXAMPLE_NOW });
  assert.equal(r.escrows[0].refundableNow, true);
  assert.equal(r.escrows[0].secondsToDeadline, 0);
});

test("by id: unknown id answers 200 found:false (still a real answer)", async () => {
  const r = await handleEscrowStatusInput({ id: "99" }, deps);
  assert.equal(r.status, 200);
  assert.equal((r.body as { found: boolean }).found, false);
});

test("by address: buyer and seller both match, newest first, deduped, capped", async () => {
  const b = await buildEscrowStatus({ address: BUYER, chains: SEPOLIA_ONLY, ...deps });
  assert.deepEqual(b.escrows.map((e) => e.escrowId), [3, 2, 1]);
  const s = await buildEscrowStatus({ address: SELLER.toLowerCase() as `0x${string}`, chains: SEPOLIA_ONLY, ...deps });
  assert.equal(s.total, 3);
  const many: Record<string, RawEscrow> = {};
  for (let i = 1; i <= MAX_PER_CHAIN + 5; i++) many[String(i)] = FIXTURE_ESCROWS["3"];
  clearEscrowStatusCache();
  const capped = await buildEscrowStatus({ address: BUYER, chains: SEPOLIA_ONLY, readerFor: () => fixtureEscrowReader(many), now: EXAMPLE_NOW });
  assert.equal(capped.total, MAX_PER_CHAIN);
  assert.equal(capped.escrows[0].escrowId, MAX_PER_CHAIN + 5);
  assert.equal(capped.chains[0].truncated, true);
});

test("per-chain RPC failure reported; other chains still answer", async () => {
  const two = [resolveEscrowChain("base-sepolia")!, { ...resolveEscrowChain("bnb")!, factory: "0x1111111111111111111111111111111111111111" as const }];
  const r = await buildEscrowStatus({ id: 2, chains: two, readerFor: (c) => (c.key === "bnb" ? failingEscrowReader : fixtureEscrowReader()), now: EXAMPLE_NOW });
  assert.deepEqual(r.chainsChecked, ["base-sepolia"]);
  assert.deepEqual(r.chainsFailed, ["bnb"]);
  assert.match(r.chains[1].error!, /RPC read failed/);
  assert.equal(r.total, 1);
});

test("cache: ok results reused within TTL, failures not cached", async () => {
  let calls = 0;
  const counting: EscrowReader = { ...fixtureEscrowReader(), escrowCount: async () => { calls++; return 3n; } };
  const at = (ms: number) => new Date(EXAMPLE_NOW.getTime() + ms);
  await buildEscrowStatus({ chains: SEPOLIA_ONLY, id: 2, readerFor: () => counting, now: at(0) });
  await buildEscrowStatus({ chains: SEPOLIA_ONLY, id: 2, readerFor: () => counting, now: at(10_000) });
  assert.equal(calls, 1);
  await buildEscrowStatus({ chains: SEPOLIA_ONLY, id: 2, readerFor: () => counting, now: at(16_000) });
  assert.equal(calls, 2);
  let fails = 0;
  const f: EscrowReader = { ...failingEscrowReader, escrowCount: async () => { fails++; throw new Error("down"); } };
  await buildEscrowStatus({ chains: SEPOLIA_ONLY, id: 7, readerFor: () => f, now: at(0) });
  await buildEscrowStatus({ chains: SEPOLIA_ONLY, id: 7, readerFor: () => f, now: at(0) });
  assert.equal(fails, 2);
});

test("handler: 400s are free (bad query/id/address/chain, chain not live), 503 when all chains fail", async () => {
  const code = async (i: Parameters<typeof handleEscrowStatusInput>[0]) => {
    const r = await handleEscrowStatusInput(i, deps);
    return [r.status, (r.body as { code?: string }).code];
  };
  assert.deepEqual(await code({}), [400, "BAD_QUERY"]);
  assert.deepEqual(await code({ id: 1, address: BUYER }), [400, "BAD_QUERY"]);
  assert.deepEqual(await code({ id: "0" }), [400, "BAD_ID"]);
  assert.deepEqual(await code({ id: "1.5" }), [400, "BAD_ID"]);
  assert.deepEqual(await code({ address: "0x12" }), [400, "BAD_ADDRESS"]);
  assert.deepEqual(await code({ id: 1, chain: "solana" }), [400, "BAD_CHAIN"]);
  assert.deepEqual(await code({ id: 1, chain: "bnb" }), [400, "CHAIN_NOT_LIVE"]);
  const down = await handleEscrowStatusInput({ id: 1 }, { readerFor: () => failingEscrowReader });
  assert.equal(down.status, 503);
  assert.equal((down.body as { code: string }).code, "RPC_UNAVAILABLE");
  const ok = await handleEscrowStatusInput({ address: BUYER, chain: "84532" }, deps);
  assert.equal(ok.status, 200);
});

test("x402 routes: $0.005 on Base, discovery declared, chain enum covers all slots", () => {
  for (const r of Object.values(ESCROW_STATUS_ROUTES)) {
    assert.equal(r.price, "$0.005");
    assert.deepEqual(r.networks, ["eip155:8453"]);
    assert.ok(r.extensions && "bazaar" in r.extensions);
  }
  assert.deepEqual(ESCROW_STATUS_INPUT_SCHEMA.properties.chain.enum, XESCROW_CHAINS.map((c) => c.key));
});
