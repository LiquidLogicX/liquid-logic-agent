/**
 * /api/prove acceptance tests (spec §7) — fully offline.
 * Mocks: x402 facilitator (verify/settle), Base JSON-RPC (real captured receipts
 * in scripts/fixtures), arc-settlement-recorder. No paid calls, no Arc writes.
 *
 * Usage: npm run check-prove -w @liquid-logic/audit
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import { x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { NETWORK_BASE, PROVE_PRICE_LABEL, PROVE_PRICE_USDC, USDC_BASE_MAINNET, usdcToAtomic } from "@liquid-logic/shared";
import { PROVE_ROUTES } from "../lib/x402-server";
import { handleProve, type ProveDeps } from "../lib/prove/handler";
import { createBaseReader } from "../lib/prove/base-rpc";
import { createRecorderClient } from "../lib/prove/recorder-client";
import { PROVE_OUTPUT_EXAMPLE } from "../lib/prove/discovery";
import { loadProveEnv, verifyUrlFor } from "../lib/prove/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(here, "fixtures", name), "utf8")) as {
    receipt: { transactionHash: string; blockNumber: string; status: string; logs: unknown[] };
    block: { number: string; timestamp: string };
  };

// Real Base mainnet receipts (captured read-only from mainnet.base.org).
const TX_PROOF1 = fixture("base-0x93a15735.json"); // 0.001 USDC 0xEA24… → payTo 0x1479… (proof #1 source)
const TX_EXTERNAL = fixture("base-0xe38b1f51.json"); // 0.001 USDC 0x7dd8… → payTo
const TX_NON_USDC = fixture("base-non-usdc.json"); // ERC-20 Transfers, none from Base USDC

const PAY_TO = "0x147991A1c25e78f6D9225d2dBA61eD93A6158c7b";
const TREASURER = "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D"; // party (from) of TX_PROOF1
const STRANGER = "0x1111111111111111111111111111111111111111";
const RECORDER = "https://recorder.test";
const BASE_RPC = "https://base-rpc.test";
const NEW_ARC_TX = "0x" + "a1".repeat(32);

// ---------------------------------------------------------------- mocks

type Settle = { payer: string };
function mockFacilitator() {
  const settles: Settle[] = [];
  const verifies: string[] = [];
  return {
    settles,
    verifies,
    client: {
      async getSupported() {
        return {
          kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK_BASE }],
          extensions: [],
          signers: {},
        };
      },
      async verify(payload: any) {
        const from = payload.payload.authorization.from;
        verifies.push(from);
        return { isValid: true, payer: from };
      },
      async settle(payload: any, req: any) {
        const from = payload.payload.authorization.from;
        settles.push({ payer: from });
        return { success: true, transaction: "0x" + "5e".repeat(32), network: req.network, payer: from };
      },
    },
  };
}

type RecorderState = {
  proofs: Map<string, { proofId: number; proofTxHash: string; proof: any }>;
  writes: number;
  balanceWei: string;
  mode: "ok" | "down" | "500" | "low-gas-write" | "reject";
};

function newRecorderState(): RecorderState {
  return { proofs: new Map(), writes: 0, balanceWei: "493300832000000000", mode: "ok" };
}

function key(q: { txHash: string; payee: string; amountUSDC: string }) {
  return `${q.txHash.toLowerCase()}|${q.payee.toLowerCase()}|${q.amountUSDC}`;
}

/** fetch mock serving Base JSON-RPC + recorder HTTP API. */
function mockFetch(opts: { receipts: Record<string, any>; head: bigint; rec: RecorderState }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith(BASE_RPC)) {
      const { method, params, id } = JSON.parse(String(init?.body));
      if (method === "eth_getTransactionReceipt") {
        return json({ jsonrpc: "2.0", id, result: opts.receipts[params[0].toLowerCase()]?.receipt ?? null });
      }
      if (method === "eth_blockNumber") return json({ jsonrpc: "2.0", id, result: "0x" + opts.head.toString(16) });
      if (method === "eth_getBlockByNumber") {
        const hit = Object.values(opts.receipts).find((f: any) => f.block.number === params[0]);
        return json({ jsonrpc: "2.0", id, result: hit ? (hit as any).block : null });
      }
      return json({ jsonrpc: "2.0", id, error: { message: "unsupported" } });
    }
    if (url.startsWith(RECORDER)) {
      const rec = opts.rec;
      assert.match(String((init?.headers as any)?.Authorization), /^Bearer test-key$/);
      if (rec.mode === "down") throw new TypeError("fetch failed: ECONNREFUSED");
      const u = new URL(url);
      if (u.pathname === "/health") {
        return json({ ok: true, recorderArcBalanceWei: rec.balanceWei, arcChainId: 5042 });
      }
      if (u.pathname === "/v1/proofs/lookup") {
        const q = { txHash: u.searchParams.get("txHash")!, payee: u.searchParams.get("payee")!, amountUSDC: u.searchParams.get("amountUSDC")! };
        const hit = rec.proofs.get(key(q));
        return hit ? json({ found: true, ...hit }) : json({ found: false }, 404);
      }
      if (u.pathname === "/v1/proofs" && init?.method === "POST") {
        if (rec.mode === "500") return json({ error: "Arc recordPayment transaction reverted", code: "ARC_WRITE_FAILED" }, 502);
        if (rec.mode === "low-gas-write") return json({ error: "gas low", code: "LOW_GAS_BALANCE" }, 503);
        if (rec.mode === "reject") return json({ error: "USDC Transfer to payee/amount did not match", code: "USDC_AMOUNT_UNVERIFIED" }, 400);
        const body = JSON.parse(String(init.body));
        assert.deepEqual(Object.keys(body).sort(), ["amountUSDC", "memo", "payee", "txHash"], "recorder body = existing POST /v1/proofs field names");
        const existing = rec.proofs.get(key(body));
        if (existing) return json({ idempotent: true, ...existing });
        rec.writes++;
        const proofId = rec.proofs.size + 1;
        const entry = {
          proofId,
          proofTxHash: NEW_ARC_TX,
          proof: {
            refId: "0x" + proofId.toString(16).padStart(64, "0"),
            payee: body.payee,
            amountUSDC: body.amountUSDC,
            paidAt: 1789504737,
            srcTxHash: body.txHash,
            memo: body.memo,
            recordedAt: 1790300000,
          },
        };
        rec.proofs.set(key(body), entry);
        return json({ idempotent: false, ...entry }, 201);
      }
      return json({ error: "not found" }, 404);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

function toCoreRoutes() {
  const out: Record<string, unknown> = {};
  for (const [k, r] of Object.entries(PROVE_ROUTES)) {
    out[k] = {
      accepts: { scheme: "exact", price: r.price, network: NETWORK_BASE, payTo: PAY_TO, maxTimeoutSeconds: 300 },
      description: r.description,
      extensions: r.extensions,
    };
  }
  return out;
}

function harness(opts: { rec?: RecorderState; head?: bigint; apiKey?: string | null; warns?: string[] } = {}) {
  const fac = mockFacilitator();
  const rec = opts.rec ?? newRecorderState();
  const receipts = {
    [TX_PROOF1.receipt.transactionHash.toLowerCase()]: TX_PROOF1,
    [TX_EXTERNAL.receipt.transactionHash.toLowerCase()]: TX_EXTERNAL,
    [TX_NON_USDC.receipt.transactionHash.toLowerCase()]: TX_NON_USDC,
  };
  const f = mockFetch({ receipts, head: opts.head ?? 60_000_000n, rec });
  const warns = opts.warns ?? [];
  const deps: ProveDeps = {
    base: createBaseReader(BASE_RPC, f),
    recorder: opts.apiKey === null ? null : createRecorderClient({ baseUrl: RECORDER, apiKey: opts.apiKey ?? "test-key", fetchImpl: f }),
    minGasWei: 50_000_000_000_000_000n,
    warn: (m) => warns.push(m),
    info: () => {},
  };
  const resource = new x402ResourceServer(fac.client as any).register(NETWORK_BASE, new ExactEvmScheme());
  const http = new x402HTTPResourceServer(resource, toCoreRoutes() as any);
  const route = withX402FromHTTPServer((req) => handleProve(req, deps), http);
  return { route, fac, rec, warns };
}

async function paymentRequired(route: (r: NextRequest) => Promise<Response>, method = "GET") {
  const res = await route(new NextRequest("https://audit.liquidlogicx.com/api/prove", { method }));
  const header = res.headers.get("payment-required");
  assert.ok(header, "402 carries PAYMENT-REQUIRED");
  return { res, pr: JSON.parse(Buffer.from(header!, "base64").toString("utf8")) };
}

async function paidCall(
  h: ReturnType<typeof harness>,
  payer: string,
  input: { txHash?: string; memo?: string },
  method: "GET" | "POST" = "GET",
) {
  const { pr } = await paymentRequired(h.route, method);
  const accepted = pr.accepts[0];
  const payload = {
    x402Version: 2,
    resource: pr.resource,
    accepted,
    payload: {
      signature: "0x" + "00".repeat(65),
      authorization: {
        from: payer,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 300),
        nonce: "0x" + "22".repeat(32),
      },
    },
  };
  const headers = { "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64") } as Record<string, string>;
  let req: NextRequest;
  if (method === "GET") {
    const qs = new URLSearchParams(input as Record<string, string>);
    req = new NextRequest(`https://audit.liquidlogicx.com/api/prove?${qs}`, { headers });
  } else {
    req = new NextRequest("https://audit.liquidlogicx.com/api/prove", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }
  const res = await h.route(req);
  return { res, body: (await res.json()) as any };
}

// ---------------------------------------------------------------- tests

describe("check 1 — unpaid GET/POST returns 402 with a valid Bazaar extension", () => {
  for (const method of ["GET", "POST"] as const) {
    it(`${method} /api/prove unpaid → 402, $0.02 USDC on Base, bazaar with real example`, async () => {
      const h = harness();
      const { res, pr } = await paymentRequired(h.route, method);
      assert.equal(res.status, 402);
      assert.equal(pr.accepts.length, 1, "Base only — no Arc accept on /api/prove");
      const a = pr.accepts[0];
      assert.equal(a.network, NETWORK_BASE);
      assert.equal(a.scheme, "exact");
      assert.equal(a.amount, usdcToAtomic(PROVE_PRICE_USDC).toString());
      assert.equal(a.amount, "20000");
      assert.equal(a.asset.toLowerCase(), USDC_BASE_MAINNET.toLowerCase());
      assert.equal(a.payTo, PAY_TO);
      assert.notEqual(a.extra?.paymentFlow, "upfront", "authorization flow: settle AFTER handler");
      const bazaar = pr.extensions?.bazaar;
      assert.ok(bazaar, "bazaar extension present");
      const v = validateDiscoveryExtension(bazaar);
      assert.equal(v.valid, true, JSON.stringify(v.errors));
      assert.deepEqual(bazaar.info.output.example, PROVE_OUTPUT_EXAMPLE);
      assert.ok(Object.keys(bazaar.info.output.example).length > 0, "example is populated");
      assert.equal(bazaar.info.input.method, method);
      if (method === "POST") assert.equal(bazaar.info.input.bodyType, "json");
      assert.ok(bazaar.schema.properties.input, "input schema");
      assert.ok(bazaar.schema.properties.output, "output schema");
      assert.equal(h.fac.settles.length, 0);
    });
  }

  it("price comes from the single PROVE_PRICE constant", () => {
    assert.equal(PROVE_PRICE_LABEL, `$${PROVE_PRICE_USDC}`);
    for (const r of Object.values(PROVE_ROUTES)) assert.equal(r.price, PROVE_PRICE_LABEL);
  });

  it("output.example is real proof #1 (Base 0x93a1…af4c → Arc 0x2bb3…0bbe)", () => {
    const e = PROVE_OUTPUT_EXAMPLE;
    assert.equal(e.proofId, 1);
    assert.equal(e.source.txHash, TX_PROOF1.receipt.transactionHash);
    assert.equal(e.arc.txHash, "0x2bb316073c034140d74d73ca67ad2b71bfaaa9dea531d69290a16efdd0f10bbe");
    assert.equal(e.arc.chain, "eip155:5042");
    assert.equal(e.arc.contract, "0x1de52cbc4490a7873ef007e51cb91a5b374facb1");
    // from/to/amount/timestamp must equal the captured Base receipt + block
    assert.equal(e.source.timestamp, new Date(Number(BigInt(TX_PROOF1.block.timestamp)) * 1000).toISOString());
    const usdc = (TX_PROOF1.receipt.logs as any[]).find((l) => l.topics[0].startsWith("0xddf252ad"));
    assert.equal(("0x" + usdc.topics[1].slice(-40)).toLowerCase(), e.source.from.toLowerCase());
    assert.equal(("0x" + usdc.topics[2].slice(-40)).toLowerCase(), e.source.to.toLowerCase());
    assert.equal(BigInt(usdc.data), usdcToAtomic(e.source.amountUsdc));
  });
});

describe("check 2 — paid call by a party returns 200, new proofId, Arc tx", () => {
  for (const method of ["GET", "POST"] as const) {
    it(`${method}: payer = transfer.from → recorded, settled once`, async () => {
      const h = harness();
      const { res, body } = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash, memo: "invoice-42" }, method);
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.equal(body.status, "recorded");
      assert.equal(body.proofId, 1);
      assert.equal(body.arc.txHash, NEW_ARC_TX);
      assert.equal(body.arc.chain, "eip155:5042");
      assert.equal(body.source.chain, "eip155:8453");
      assert.equal(body.source.from, TREASURER);
      assert.equal(body.source.to, PAY_TO);
      assert.equal(body.source.amountUsdc, "0.001");
      assert.equal(body.source.timestamp, "2026-09-15T20:38:57.000Z");
      assert.equal(body.memo, "invoice-42");
      assert.equal(h.rec.writes, 1);
      assert.equal(h.fac.settles.length, 1, "settled after the proof was recorded");
      assert.ok(res.headers.get("payment-response"), "PAYMENT-RESPONSE header on success");
    });
  }

  it("payer = transfer.to (recipient) is also a party", async () => {
    const h = harness();
    const { res, body } = await paidCall(h, PAY_TO, { txHash: TX_EXTERNAL.receipt.transactionHash });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.status, "recorded");
    assert.equal(body.memo, "");
  });
});

describe("check 3 — verifyUrl points at proofs.liquidlogicx.com search (never a 404 route)", () => {
  it("verifyUrl = https://proofs.liquidlogicx.com/proofs?q=<refId>", async () => {
    const h = harness();
    const { body } = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(body.verifyUrl, `https://proofs.liquidlogicx.com/proofs?q=${body.refId}`);
    assert.equal(PROVE_OUTPUT_EXAMPLE.verifyUrl, verifyUrlFor(PROVE_OUTPUT_EXAMPLE.refId));
    assert.doesNotMatch(body.verifyUrl, /\/proofs\/\d+$/, "numeric /proofs/<n> 404s on the live site");
  });
});

describe("check 4 — same txHash again → status existing, no new Arc write", () => {
  it("second call returns existing via recorder lookup; recorder POST not called", async () => {
    const h = harness();
    const first = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(first.body.status, "recorded");
    const second = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(second.res.status, 200);
    assert.equal(second.body.status, "existing");
    assert.equal(second.body.proofId, first.body.proofId);
    assert.equal(second.body.arc.txHash, first.body.arc.txHash);
    assert.equal(h.rec.writes, 1, "exactly one Arc write");
  });

  it("the other party asking later also gets existing", async () => {
    const h = harness();
    await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    const other = await paidCall(h, PAY_TO, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(other.body.status, "existing");
    assert.equal(h.rec.writes, 1);
  });

  it("race: recorder POST answers idempotent → existing", async () => {
    const rec = newRecorderState();
    const h = harness({ rec });
    // lookup misses (older recorder without lookup), POST is idempotent on refId
    await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    const origGet = rec.proofs.get.bind(rec.proofs);
    let lookups = 0;
    rec.proofs.get = ((k: string) => (lookups++ === 0 ? undefined : origGet(k))) as any;
    const again = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(again.body.status, "existing");
    assert.equal(rec.writes, 1);
  });
});

describe("check 5 — caller not a party → 403 and no settlement", () => {
  it("stranger → 403 NOT_A_PARTY, recorder untouched, not settled", async () => {
    const h = harness();
    const { res, body } = await paidCall(h, STRANGER, { txHash: TX_EXTERNAL.receipt.transactionHash });
    assert.equal(res.status, 403);
    assert.equal(body.code, "NOT_A_PARTY");
    assert.equal(h.fac.verifies.length, 1, "payment was verified");
    assert.equal(h.fac.settles.length, 0, "…but never settled");
    assert.equal(h.rec.writes, 0);
  });
  it("tx.from (facilitator relayer) is not a party — only the USDC Transfer from/to", async () => {
    const h = harness();
    const relayer = (TX_PROOF1.receipt as any).from as string;
    const { res } = await paidCall(h, relayer, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(res.status, 403);
    assert.equal(h.fac.settles.length, 0);
  });
});

describe("check 6 — bad hash / non-USDC / wrong chain → 400 and no settlement", () => {
  const cases: Array<[string, { txHash?: string; memo?: string }, string]> = [
    ["malformed hash", { txHash: "0x1234" }, "INVALID_TX_HASH"],
    ["missing hash", {}, "INVALID_TX_HASH"],
    ["non-USDC tx (real Base tx with other ERC-20 Transfers)", { txHash: TX_NON_USDC.receipt.transactionHash }, "NOT_BASE_USDC_TRANSFER"],
    ["wrong chain (hash not on Base — e.g. the Arc proof tx)", { txHash: "0x2bb316073c034140d74d73ca67ad2b71bfaaa9dea531d69290a16efdd0f10bbe" }, "TX_NOT_FOUND_ON_BASE"],
    ["memo > 64 chars", { txHash: TX_PROOF1.receipt.transactionHash, memo: "x".repeat(65) }, "INVALID_MEMO"],
    ["memo with control chars", { txHash: TX_PROOF1.receipt.transactionHash, memo: "a\nb" }, "INVALID_MEMO"],
  ];
  for (const [name, input, code] of cases) {
    it(`${name} → 400 ${code}`, async () => {
      const h = harness();
      const { res, body } = await paidCall(h, TREASURER, input);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(body.code, code);
      assert.equal(h.fac.settles.length, 0);
      assert.equal(h.rec.writes, 0);
    });
  }
  it("too few Base confirmations → 400 TX_NOT_CONFIRMED, not settled", async () => {
    const h = harness({ head: BigInt(TX_PROOF1.receipt.blockNumber) + 3n });
    const { res, body } = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(res.status, 400);
    assert.equal(body.code, "TX_NOT_CONFIRMED");
    assert.equal(h.fac.settles.length, 0);
  });
  it("recorder rejects (Base verify mismatch) → 400, not settled", async () => {
    const rec = newRecorderState();
    rec.mode = "reject";
    const h = harness({ rec });
    const { res } = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(res.status, 400);
    assert.equal(h.fac.settles.length, 0);
  });
});

describe("check 7 — recorder outage / Arc write failure / low gas → 503 and no settlement", () => {
  const modes: Array<[string, (r: RecorderState) => void, string]> = [
    ["recorder unreachable", (r) => (r.mode = "down"), "RECORDER_UNAVAILABLE"],
    ["Arc write reverted (recorder 502)", (r) => (r.mode = "500"), "ARC_WRITE_FAILED"],
    ["recorder refuses write on low gas", (r) => (r.mode = "low-gas-write"), "LOW_GAS_BALANCE"],
    ["recorder gas below threshold (pre-check)", (r) => (r.balanceWei = "1000"), "LOW_GAS_BALANCE"],
  ];
  for (const [name, setup, code] of modes) {
    it(`${name} → 503 ${code}`, async () => {
      const rec = newRecorderState();
      setup(rec);
      const warns: string[] = [];
      const h = harness({ rec, warns });
      const { res, body } = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
      assert.equal(res.status, 503, JSON.stringify(body));
      assert.equal(body.code, code);
      assert.equal(h.fac.settles.length, 0, "never charge for an unrecorded proof");
      assert.equal(rec.writes, 0);
      if (code === "LOW_GAS_BALANCE") assert.ok(warns.length > 0, "low gas logs a warning");
    });
  }
  it("RECORDER_API_KEY missing → 503, not settled", async () => {
    const h = harness({ apiKey: null });
    const { res, body } = await paidCall(h, TREASURER, { txHash: TX_PROOF1.receipt.transactionHash });
    assert.equal(res.status, 503);
    assert.equal(body.code, "RECORDER_NOT_CONFIGURED");
    assert.equal(h.fac.settles.length, 0);
  });
  it("RECORDER_URL must be https", () => {
    assert.throws(() => loadProveEnv({ RECORDER_URL: "http://arc-settlement-recorder.onrender.com" }));
    assert.equal(loadProveEnv({}).recorderUrl, "https://arc-settlement-recorder.onrender.com");
  });
});

describe("check 8 — paid call is a Base USDC payment to payTo at the prove price (ledger input)", () => {
  it("settlement goes to the same payTo as /api/audit for exactly PROVE_PRICE_USDC", async () => {
    const h = harness();
    const { pr } = await paymentRequired(h.route);
    assert.equal(pr.accepts[0].payTo, PAY_TO);
    assert.equal(pr.accepts[0].amount, usdcToAtomic(PROVE_PRICE_USDC).toString());
    // The ledger chain-sync (separate PR) appends every Base USDC Transfer to
    // payTo into data/ledger.jsonl and maps PROVE_PRICE_USDC → /api/prove.
    // Its own tests cover the append; the live check is in docs/prove-runbook.md.
  });
});
