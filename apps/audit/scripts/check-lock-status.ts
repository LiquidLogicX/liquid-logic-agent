/**
 * /api/lock-status unit tests (mocked RPC, no network, no payments).
 *   npm run check-lock-status -w @liquid-logic/audit
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { XLOCK_CHAINS, lockUrl, resolveChain, V2_FACTORY, BASE_FACTORY } from "../lib/lock-status/chains";
import { buildLockStatus, clearLockStatusCache, vestedAt, type Reader } from "../lib/lock-status/core";
import { emptyReader, EXAMPLE_NOW, EXAMPLE_TOKEN, failingReader, FIXTURE_LOCKS, fixtureReader } from "../lib/lock-status/fixture";
import { handleLockStatusInput } from "../lib/lock-status/handler";
import { LOCK_STATUS_OUTPUT_EXAMPLE } from "../lib/lock-status/output-example";
import { LOCK_STATUS_ROUTES } from "../lib/x402-server";
import { LOCK_STATUS_INPUT_SCHEMA } from "../lib/lock-status/discovery";

beforeEach(() => clearLockStatusCache());
const base = XLOCK_CHAINS.filter((c) => c.key === "base");

test("11 chains: Base on V1 factory, other 10 on shared V2", () => {
  assert.equal(XLOCK_CHAINS.length, 11);
  assert.equal(resolveChain("base")!.factory, BASE_FACTORY);
  for (const c of XLOCK_CHAINS.filter((c) => c.key !== "base")) assert.equal(c.factory, V2_FACTORY, c.key);
  assert.equal(resolveChain("eip155:56")!.key, "bnb");
  assert.equal(resolveChain("4663")!.key, "robinhood");
  assert.equal(lockUrl(resolveChain("tempo")!, 3), "https://xlock.liquidlogicx.com/c/tempo/lock/3");
  assert.equal(lockUrl(resolveChain("base")!, 3), "https://xlock.liquidlogicx.com/lock/3");
});

test("Bazaar output example equals what the code produces from the fixture", async () => {
  const r = await buildLockStatus({ token: EXAMPLE_TOKEN, now: EXAMPLE_NOW, chains: base, readerFor: () => fixtureReader() });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), JSON.parse(JSON.stringify(LOCK_STATUS_OUTPUT_EXAMPLE)));
});

test("totals, % of supply, next unlock (cliff before time lock)", async () => {
  const r = await buildLockStatus({ token: EXAMPLE_TOKEN, now: EXAMPLE_NOW, chains: base, readerFor: () => fixtureReader() });
  assert.equal(r.isLocked, true);
  assert.equal(r.chains[0].totalLockedAmount, "200000000");
  assert.equal(r.chains[0].pctOfSupplyLocked, 20);
  assert.equal(r.nextUnlock!.lockId, 1);
  assert.equal(r.nextUnlock!.at, r.chains[0].locks[0].cliff);
});

test("vesting math matches linear-with-cliff schedule", () => {
  const l = FIXTURE_LOCKS["1"];
  assert.equal(vestedAt(l, l.start + l.cliffDuration - 1n), 0n);
  assert.equal(vestedAt(l, l.start + l.duration), l.amount);
  assert.equal(vestedAt(l, l.start + l.duration / 2n), l.amount / 2n);
  const t = FIXTURE_LOCKS["2"];
  assert.equal(vestedAt(t, t.start - 1n), 0n);
  assert.equal(vestedAt(t, t.start), t.amount);
});

test("after everything unlocks: isLocked false, status unlocked, no next unlock", async () => {
  const later = new Date("2028-01-01T00:00:00Z");
  const r = await buildLockStatus({ token: EXAMPLE_TOKEN, now: later, chains: base, readerFor: () => fixtureReader() });
  assert.equal(r.isLocked, false);
  assert.equal(r.nextUnlock, null);
  assert.deepEqual(r.chains[0].locks.map((l) => l.status), ["unlocked", "unlocked"]);
});

test("one chain RPC failing is reported per chain, others still answer", async () => {
  const r = await buildLockStatus({
    token: EXAMPLE_TOKEN, now: EXAMPLE_NOW,
    readerFor: (c) => (c.key === "bnb" ? failingReader : c.key === "base" ? fixtureReader() : emptyReader),
  });
  assert.equal(r.chainsChecked.length, 10);
  assert.deepEqual(r.chainsFailed, ["bnb"]);
  const bnb = r.chains.find((c) => c.chain === "bnb")!;
  assert.equal(bnb.status, "error");
  assert.match(bnb.error!, /RPC read failed/);
  assert.equal(r.totalLocks, 2);
});

test("cache: ok results reused within TTL, failures are not cached", async () => {
  let calls = 0;
  const counting: Reader = { ...emptyReader, locksByToken: async () => { calls++; return []; } };
  await buildLockStatus({ token: EXAMPLE_TOKEN, chains: base, readerFor: () => counting, now: EXAMPLE_NOW });
  await buildLockStatus({ token: EXAMPLE_TOKEN, chains: base, readerFor: () => counting, now: new Date(EXAMPLE_NOW.getTime() + 30_000) });
  assert.equal(calls, 1);
  await buildLockStatus({ token: EXAMPLE_TOKEN, chains: base, readerFor: () => counting, now: new Date(EXAMPLE_NOW.getTime() + 61_000) });
  assert.equal(calls, 2);
  let fails = 0;
  const f: Reader = { ...failingReader, locksByToken: async () => { fails++; throw new Error("down"); } };
  const other = XLOCK_CHAINS.filter((c) => c.key === "arc");
  await buildLockStatus({ token: EXAMPLE_TOKEN, chains: other, readerFor: () => f, now: EXAMPLE_NOW });
  await buildLockStatus({ token: EXAMPLE_TOKEN, chains: other, readerFor: () => f, now: EXAMPLE_NOW });
  assert.equal(fails, 2);
});

test("handler: 400 bad token / bad chain, 503 when all chains fail, 200 single chain", async () => {
  assert.equal((await handleLockStatusInput({ token: "nope" })).status, 400);
  assert.equal((await handleLockStatusInput({ token: EXAMPLE_TOKEN, chain: "solana" })).status, 400);
  const all = await handleLockStatusInput({ token: EXAMPLE_TOKEN }, { readerFor: () => failingReader });
  assert.equal(all.status, 503);
  const one = await handleLockStatusInput({ token: EXAMPLE_TOKEN, chain: "eip155:8453" }, { readerFor: () => fixtureReader(), now: EXAMPLE_NOW });
  assert.equal(one.status, 200);
  assert.deepEqual((one.body as { chainsChecked: string[] }).chainsChecked, ["base"]);
});

test("x402 routes: $0.005 on Base, discovery declared, chain enum covers all chains", () => {
  for (const r of Object.values(LOCK_STATUS_ROUTES)) {
    assert.equal(r.price, "$0.005");
    assert.deepEqual(r.networks, ["eip155:8453"]);
    assert.ok(r.extensions && "bazaar" in r.extensions);
  }
  assert.deepEqual(LOCK_STATUS_INPUT_SCHEMA.properties.chain.enum, XLOCK_CHAINS.map((c) => c.key));
});
