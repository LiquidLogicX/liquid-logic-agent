/**
 * /api/token-check unit tests (mocked RPC + market, no network, no payments).
 *   npm run check-token-check -w @liquid-logic/audit
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { toFunctionSelector, type Hex } from "viem";
import { buildTokenCheck, clearTokenCheckCache, findPowers, KNOWN_ISSUERS, minimalProxyTarget } from "../lib/token-check/core";
import { EXAMPLE_NOW, EXAMPLE_TOKEN, failingMarket, FIXTURE_PAIR, fixtureMarket, fixtureReader, noLocks } from "../lib/token-check/fixture";
import { handleTokenCheckInput } from "../lib/token-check/handler";
import { TOKEN_CHECK_OUTPUT_EXAMPLE } from "../lib/token-check/output-example";
import { TOKEN_CHECK_INPUT_SCHEMA } from "../lib/token-check/discovery";
import { TOKEN_CHECK_ROUTES } from "../lib/x402-server";
import { TOKEN_CHECK_PRICE_LABEL } from "@liquid-logic/shared";

beforeEach(() => clearTokenCheckCache());
const deps = (o: Parameters<typeof fixtureReader>[0] = {}, pairs = [FIXTURE_PAIR]) =>
  ({ reader: fixtureReader(o), market: fixtureMarket(pairs), lockReader: noLocks, now: EXAMPLE_NOW });
const codes = (r: { flags: { code: string }[] }) => r.flags.map((f) => f.code);

test("Bazaar output example equals what the code produces from the fixture", async () => {
  const r = await buildTokenCheck(EXAMPLE_TOKEN, deps());
  assert.deepEqual(JSON.parse(JSON.stringify(r)), JSON.parse(JSON.stringify(TOKEN_CHECK_OUTPUT_EXAMPLE)));
});

test("risky token: active owner + mint/blacklist + one-sided flow = high", async () => {
  const r = await buildTokenCheck(EXAMPLE_TOKEN, deps());
  assert.equal(r.risk, "high");
  for (const c of ["POWER_MINT", "POWER_BLACKLIST", "NO_SELLS_24H", "LIQUIDITY_LOW", "PAIR_NEW", "OWNER_HOLDS_LARGE"]) assert.ok(codes(r).includes(c), c);
  assert.equal(r.holders.ownerPct, 18);
  assert.equal(r.holders.burnedPct, 5);
});

test("renounced owner downgrades powers to low; deep liquidity + two-sided flow is clean", async () => {
  const pair = { ...FIXTURE_PAIR, liquidityUsd: 2_000_000, buys24h: 400, sells24h: 380, createdAt: "2025-01-01T00:00:00.000Z" };
  const r = await buildTokenCheck(EXAMPLE_TOKEN, deps({ owner: "0x0000000000000000000000000000000000000000" }, [pair]));
  assert.equal(r.risk, "low");
  assert.ok(codes(r).includes("OWNER_RENOUNCED"));
  assert.ok(codes(r).includes("POWER_MINT_NO_OWNER"));
  assert.equal(r.contract.ownerRenounced, true);
  assert.equal(r.score, 90);
});

test("upgradeable proxy is flagged and implementation code is scanned", async () => {
  const impl = "0x4444444444444444444444444444444444444444";
  const r = await buildTokenCheck(EXAMPLE_TOKEN, deps({ implSlot: ("0x" + "0".repeat(24) + impl.slice(2)) as Hex }));
  assert.equal(r.contract.upgradeable, true);
  assert.equal(r.contract.proxyImplementation, impl);
  assert.ok(codes(r).includes("UPGRADEABLE"));
});

test("market down: no market flags, status unavailable, still answers", async () => {
  const r = await buildTokenCheck(EXAMPLE_TOKEN, { ...deps(), market: failingMarket });
  assert.equal(r.market.status, "unavailable");
  assert.ok(!codes(r).some((c) => /LIQUIDITY|SELLS|PAIR/.test(c)));
});

test("no pair found is medium; tiny liquidity is high", async () => {
  assert.ok(codes(await buildTokenCheck(EXAMPLE_TOKEN, deps({}, []))).includes("NO_DEX_PAIR"));
  clearTokenCheckCache();
  const r = await buildTokenCheck(EXAMPLE_TOKEN, deps({}, [{ ...FIXTURE_PAIR, liquidityUsd: 300 }]));
  assert.ok(codes(r).includes("LIQUIDITY_TINY"));
});

test("known issuers (USDC) keep their powers as info, not risk", async () => {
  const usdc = Object.keys(KNOWN_ISSUERS)[0] as `0x${string}`;
  const pair = { ...FIXTURE_PAIR, liquidityUsd: 10_000_000, buys24h: 900, sells24h: 900, createdAt: "2024-01-01T00:00:00.000Z" };
  const r = await buildTokenCheck(usdc, deps({}, [pair]));
  assert.equal(r.risk, "low");
  assert.ok(r.flags.filter((f) => f.code.startsWith("POWER_")).every((f) => f.severity === "info"));
  assert.ok(r.contract.knownIssuer);
});

test("selector scan + EIP-1167 detection", () => {
  const code = ("0x63" + toFunctionSelector("pause()").slice(2) + "63" + toFunctionSelector("setMaxWallet(uint256)").slice(2)) as Hex;
  assert.deepEqual(findPowers(code), ["pause", "max-tx"]);
  assert.deepEqual(findPowers("0x6080" as Hex), []);
  const min = "0x363d3d373d3d3d363d73" + "ab".repeat(20) + "5af43d82803e903d91602b57fd5bf3";
  assert.equal(minimalProxyTarget(min as Hex), "0x" + "ab".repeat(20));
});

test("handler: bad input and non-contracts are 400 (free), RPC failure is 503 (free)", async () => {
  assert.equal((await handleTokenCheckInput({ token: "nope" })).status, 400);
  assert.equal((await handleTokenCheckInput({ token: EXAMPLE_TOKEN, chain: "bnb" }, deps())).status, 400);
  const eoa = await handleTokenCheckInput({ token: EXAMPLE_TOKEN }, { ...deps(), reader: { ...fixtureReader(), code: async () => "0x" } });
  assert.equal(eoa.status, 400);
  assert.equal((eoa.body as { code: string }).code, "NOT_A_CONTRACT");
  const down = await handleTokenCheckInput({ token: EXAMPLE_TOKEN }, { ...deps(), reader: { ...fixtureReader(), code: async () => { throw new Error("rpc"); } } });
  assert.equal(down.status, 503);
  assert.equal((await handleTokenCheckInput({ token: EXAMPLE_TOKEN, chain: "base" }, deps())).status, 200);
});

test("routes: $0.01 on Base, GET + POST, schema requires token", () => {
  assert.equal(TOKEN_CHECK_PRICE_LABEL, "$0.01");
  assert.deepEqual(Object.keys(TOKEN_CHECK_ROUTES).sort(), ["GET /api/token-check", "POST /api/token-check"]);
  for (const r of Object.values(TOKEN_CHECK_ROUTES)) assert.equal(r.price, "$0.01");
  assert.deepEqual(TOKEN_CHECK_INPUT_SCHEMA.required, ["token"]);
});
