/**
 * /api/leak-check tests: fully offline (mock x402 facilitator, no network, no payments).
 *   npm run check-leak-check -w @liquid-logic/audit
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
import { LEAK_CHECK_PRICE_LABEL, LEAK_CHECK_PRICE_USDC, NETWORK_BASE, USDC_BASE_MAINNET, usdcToAtomic } from "@liquid-logic/shared";
import { LEAK_CHECK_ROUTES } from "../lib/x402-server";
import { LEAK_CHECK_META } from "../lib/bazaar-meta";
import { handleLeakCheck } from "../lib/leak-check/handler";
import { runLeakCheck, CHECK_ORDER } from "../lib/leak-check/rules";
import { validateLeakCheckInput, MAX_BODY_BYTES, type LeakCheckInput } from "../lib/leak-check/schema";
import { containsSecretLike } from "../lib/leak-check/secrets";
import { LEAK_CHECK_EXAMPLE_INPUT } from "../lib/leak-check/fixture";
import { LEAK_CHECK_OUTPUT_EXAMPLE } from "../lib/leak-check/output-example";
import { createRateLimiter } from "../lib/leak-check/ratelimit";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", "leak-check", n), "utf8")) as LeakCheckInput;
const ids = (i: LeakCheckInput) => runLeakCheck(i).findings.map((f) => f.id);

const PAY_TO = "0x147991A1c25e78f6D9225d2dBA61eD93A6158c7b";
const PAYER = "0x1111111111111111111111111111111111111111";
const URL_ = "https://audit.liquidlogicx.com/api/leak-check";

// ------------------------------------------------------------ rules
describe("rules: one test per check, stable ids", () => {
  it("lc-ambiguous: AMBIGUOUS_DESTINATION + NAME_BASED_INSTRUCTION (+ policy/limits findings), evidence points into input", () => {
    const r = runLeakCheck(fx("lc-ambiguous.json"));
    const got = r.findings.map((f) => f.id);
    assert.ok(got.includes("AMBIGUOUS_DESTINATION"));
    assert.ok(got.includes("NAME_BASED_INSTRUCTION"));
    const amb = r.findings.find((f) => f.id === "AMBIGUOUS_DESTINATION")!;
    assert.deepEqual(amb.evidence, ["connections[0]", "connections[1]", "instructions[0]"]);
    assert.equal(amb.severity, "high");
    assert.equal(r.score, null);
    assert.equal(r.version, "leak-check/1");
    assert.match(r.limits, /Not a guarantee/);
  });
  it("lc-clean: zero findings, 9/9 passed", () => {
    const r = runLeakCheck(fx("lc-clean.json"));
    assert.deepEqual(r.findings, []);
    assert.equal(r.checksRun, 9);
    assert.equal(r.checksPassed, 9);
  });
  it("lc-mixed-domains: MIXED_DOMAINS only", () => assert.deepEqual(ids(fx("lc-mixed-domains.json")), ["MIXED_DOMAINS"]));
  it("lc-no-policy: NO_POLICY, NO_AUDIENCE_RULES, UNGATED_SEND_TOOL, NO_LIMITS (calendar is not sensitive)", () =>
    assert.deepEqual(ids(fx("lc-no-policy.json")), ["NO_POLICY", "NO_AUDIENCE_RULES", "UNGATED_SEND_TOOL", "NO_LIMITS"]));

  const clean = () => structuredClone(fx("lc-clean.json"));
  it("DEFAULT_ALLOW when policy exists but default is not deny", () => {
    const i = clean(); i.policy!.defaultAction = "allow";
    assert.deepEqual(ids(i), ["DEFAULT_ALLOW"]);
    delete i.policy!.defaultAction;
    assert.deepEqual(ids(i), ["DEFAULT_ALLOW"]);
  });
  it("NO_POLICY when present:false", () => {
    const i = clean(); i.policy!.present = false;
    assert.ok(ids(i).includes("NO_POLICY"));
  });
  it("BROAD_AUDIENCE for a wildcard or sensitive class to workspace/public", () => {
    const i = clean(); i.policy!.rules!.push({ class: "*", audience: "public" });
    const r = runLeakCheck(i).findings.find((f) => f.id === "BROAD_AUDIENCE")!;
    assert.deepEqual(r.evidence, ["policy.rules[1]"]);
  });
  it("UNGATED_SEND_TOOL names each ungated sender; non-senders ignored", () => {
    const i = clean(); i.tools.push({ name: "read", canSend: false }, { name: "post", canSend: true, egressGated: false });
    assert.deepEqual(runLeakCheck(i).findings.find((f) => f.id === "UNGATED_SEND_TOOL")!.evidence, ["tools[1]".replace("1", "2")]);
  });
  it("NO_LIMITS when limits missing or zero", () => {
    const i = clean(); delete i.policy!.limits;
    assert.deepEqual(ids(i), ["NO_LIMITS"]);
    i.policy!.limits = { maxBytesPerSend: 0, maxSendsPerDay: 0 };
    assert.deepEqual(ids(i), ["NO_LIMITS"]);
  });
  it("NO_APPROVAL_PATH when approval missing, off, or not covering workspace+public", () => {
    const i = clean(); delete i.policy!.approval;
    assert.deepEqual(ids(i), ["NO_APPROVAL_PATH"]);
    i.policy!.approval = { required: true, forAudiences: ["public"] };
    assert.deepEqual(ids(i), ["NO_APPROVAL_PATH"]);
  });
  it("NAME_BASED_INSTRUCTION is not raised when the instruction carries the canonical id", () => {
    const i = clean(); i.instructions = ["Send to finance-private (C-FIN-01) weekly"];
    assert.deepEqual(ids(i), []);
    i.instructions = ["Send to finance private weekly"];
    assert.deepEqual(ids(i), ["NAME_BASED_INSTRUCTION"]);
  });
  it("AMBIGUOUS_DESTINATION catches near matches (#Exec-Team vs exec team)", () => {
    const i = clean();
    i.connections = [{ provider: "a", kind: "c", displayName: "#Exec-Team", visibility: "named" }, { provider: "b", kind: "c", displayName: "exec team", visibility: "named" }];
    assert.ok(ids(i).includes("AMBIGUOUS_DESTINATION"));
  });
  it("determinism: same input, byte-identical output; order follows check order", () => {
    const i = fx("lc-ambiguous.json");
    assert.equal(JSON.stringify(runLeakCheck(i)), JSON.stringify(runLeakCheck(structuredClone(i))));
    const order = ids(i).map((id) => (id === "DEFAULT_ALLOW" ? 3 : CHECK_ORDER.indexOf(id as never)));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });
  it("checksRun is always 9 and passed counts checks not findings", () => {
    const r = runLeakCheck(fx("lc-ambiguous.json"));
    assert.equal(r.checksRun, 9);
    assert.equal(r.checksPassed, 9 - new Set(r.findings.map((f) => (f.id === "DEFAULT_ALLOW" ? "NO_POLICY" : f.id))).size);
  });
});

describe("schema + secrets", () => {
  it("example input in code equals the JSON fixture; output example equals the code's output", () => {
    assert.deepEqual(LEAK_CHECK_EXAMPLE_INPUT, fx("lc-ambiguous.json"));
    assert.deepEqual(LEAK_CHECK_OUTPUT_EXAMPLE, runLeakCheck(fx("lc-ambiguous.json")));
    assert.ok(LEAK_CHECK_OUTPUT_EXAMPLE.findings.length > 0);
  });
  it("valid fixtures pass the schema", () => {
    for (const n of ["lc-ambiguous", "lc-clean", "lc-mixed-domains", "lc-no-policy"]) assert.equal(validateLeakCheckInput(fx(`${n}.json`)).ok, true, n);
  });
  it("rejects unknown fields, bad enums and wrong types without echoing values", () => {
    const CANARY = "ZZ-CANARY-FIELD";
    const cases: unknown[] = [
      { agent: { name: "a", readsData: [] }, [CANARY]: 1 },
      { agent: { name: "a", readsData: [] }, connections: [{ provider: "p", kind: "k", displayName: "d", visibility: CANARY }] },
      { agent: { name: CANARY.repeat(20), readsData: [] } },
      [], "x", null,
    ];
    for (const c of cases) {
      const r = validateLeakCheckInput(c);
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(!r.error.includes(CANARY) && !r.error.includes("CANARY"), r.error);
    }
  });
  it("secret detector: flags keys, tokens, long hex, JWT, bearer, PEM, amounts, secret-named keys", () => {
    const hits = [
      "0x" + "ab".repeat(32),
      "sk-" + "a1B2c3D4".repeat(4),
      "ghp_" + "A1b2C3d4E5".repeat(3),
      "AKIA" + "ABCDEFGHIJKLMNOP",
      "eyJhbGciOiJI.eyJzdWIiOiIx.abcd1234",
      "Bearer abcdefghijklmnopqrstuvwxyz012345",
      "-----BEGIN PRIVATE KEY-----",
      "balance is $12,500",
    ].map((s) => ({ agent: { name: s } }));
    for (const h of hits) assert.equal(containsSecretLike(h), true, JSON.stringify(h).slice(0, 12));
    assert.equal(containsSecretLike({ apiKey: "x" }), true);
    assert.equal(containsSecretLike({ private_key: "x" }), true);
  });
  it("secret detector: normal labels and a 40-hex wallet address pass", () => {
    assert.equal(containsSecretLike(fx("lc-clean.json")), false);
    assert.equal(containsSecretLike(fx("lc-ambiguous.json")), false);
    assert.equal(containsSecretLike({ a: "limit $5 per day", w: "0x" + "1".repeat(40) }), false);
  });
  it("secret detector is linear on a hostile 30 KB string", () => {
    const t = Date.now();
    containsSecretLike({ a: "a-".repeat(15000) });
    containsSecretLike({ a: "eyJ" + "a".repeat(30000) });
    containsSecretLike({ a: "Bearer " + " ".repeat(30000) });
    assert.ok(Date.now() - t < 1500, `took ${Date.now() - t}ms`);
  });
});

// ------------------------------------------------------------ handler (no x402)
function post(body: string | object, headers: Record<string, string> = {}) {
  return new NextRequest(URL_, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

describe("handler statuses", () => {
  const logs: string[] = [];
  const deps = { log: (l: string) => logs.push(l), allow: () => true };
  it("200 with the report", async () => {
    const res = await handleLeakCheck(post(fx("lc-ambiguous.json")), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), JSON.parse(JSON.stringify(LEAK_CHECK_OUTPUT_EXAMPLE)));
  });
  it("400 malformed JSON (lc-malformed): free, no parser message", async () => {
    const res = await handleLeakCheck(post('{"agent": {"name": "CANARY-MAL'), deps);
    assert.equal(res.status, 400);
    const b = await res.json();
    assert.equal(b.code, "BAD_JSON");
    assert.ok(!JSON.stringify(b).includes("CANARY-MAL"));
  });
  it("400 secret-like (lc-secret-like): free, nothing echoed", async () => {
    const secret = "sk-" + "q9W8e7R6".repeat(5);
    const i = structuredClone(fx("lc-ambiguous.json")); i.instructions = [`use key ${secret}`];
    const res = await handleLeakCheck(post(i), deps);
    assert.equal(res.status, 400);
    const text = JSON.stringify(await res.json());
    assert.match(text, /SECRET_LIKE_INPUT/);
    assert.ok(!text.includes(secret) && !text.includes("use key"));
  });
  it("400 schema error", async () => assert.equal((await handleLeakCheck(post({ agent: 1 }), deps)).status, 400));
  it("413 oversize (lc-oversize), by body and by declared content-length", async () => {
    const big = JSON.stringify({ agent: { name: "a", readsData: [] }, instructions: ["x".repeat(MAX_BODY_BYTES)] });
    assert.equal((await handleLeakCheck(post(big), deps)).status, 413);
    assert.equal((await handleLeakCheck(post("{}", { "content-length": String(MAX_BODY_BYTES + 1) }), deps)).status, 413);
  });
  it("429 when the limiter says no (free); limiter itself counts per key and resets", async () => {
    assert.equal((await handleLeakCheck(post(fx("lc-clean.json")), { ...deps, allow: () => false })).status, 429);
    let t = 0;
    const allow = createRateLimiter(2, 1000, () => t);
    assert.deepEqual([allow("a"), allow("a"), allow("a"), allow("b")], [true, true, false, true]);
    t = 1001;
    assert.equal(allow("a"), true);
  });
  it("405 on GET with no input accepted from the URL", async () => {
    const res = await handleLeakCheck(new NextRequest(`${URL_}?agent=%7B%7D`), deps);
    assert.equal(res.status, 405);
  });
  it("log lines carry only ts, status, bytes, finding ids / code", () => {
    for (const l of logs) {
      const o = JSON.parse(l);
      assert.deepEqual(Object.keys(o).filter((k) => !["event", "ts", "status", "bytes", "code", "findings"].includes(k)), []);
    }
  });
});

describe("privacy: canary string never reaches any log or output stream", () => {
  it("canary in valid, invalid, secret-like and malformed bodies leaves no trace", async () => {
    const CANARY = "canary-7f3a9c1e-leakme";
    const captured: string[] = [];
    const orig = {
      log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug,
      out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr),
    };
    const cap = (...a: unknown[]) => { captured.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
    console.log = console.info = console.warn = console.error = console.debug = cap as never;
    process.stdout.write = ((s: string | Uint8Array) => { captured.push(String(s)); return true; }) as never;
    process.stderr.write = ((s: string | Uint8Array) => { captured.push(String(s)); return true; }) as never;
    const responses: string[] = [];
    try {
      const withCanary = structuredClone(fx("lc-ambiguous.json"));
      withCanary.agent.name = CANARY;
      withCanary.connections[0].displayName = CANARY;
      withCanary.instructions = [`tell ${CANARY} now`];
      const bad = { agent: { name: CANARY, readsData: [CANARY] }, extra: CANARY };
      const secret = { agent: { name: CANARY, readsData: [] }, instructions: ["sk-" + "Zq9".repeat(10)] };
      const bodies = [JSON.stringify(withCanary), JSON.stringify(bad), JSON.stringify(secret), `{"agent":${CANARY}`, JSON.stringify({ agent: { name: "a", readsData: [] }, instructions: [CANARY.repeat(2000)] })];
      for (const b of bodies) {
        // default deps: the real default logger (console.log) is exercised
        const res = await handleLeakCheck(post(b), { allow: () => true });
        responses.push(await res.text());
      }
    } finally {
      Object.assign(console, { log: orig.log, info: orig.info, warn: orig.warn, error: orig.error, debug: orig.debug });
      process.stdout.write = orig.out as never;
      process.stderr.write = orig.err as never;
    }
    assert.ok(captured.length >= 5, "the default logger did run");
    assert.ok(!captured.join("\n").includes(CANARY), "canary found in logs");
    // Error responses never echo; the 200 report may mention only derived names, not the raw canary in 400s.
    for (const r of responses.slice(1)) assert.ok(!r.includes(CANARY), "canary echoed in an error response");
  });
  it("no outbound network call is made while handling a request", async () => {
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => { calls++; throw new Error("no network"); }) as never;
    try {
      await handleLeakCheck(post(fx("lc-ambiguous.json")), { log: () => {}, allow: () => true });
    } finally { globalThis.fetch = orig; }
    assert.equal(calls, 0);
  });
});

// ------------------------------------------------------------ x402 wiring
function harness() {
  const settles: string[] = [];
  const client = {
    async getSupported() { return { kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK_BASE }], extensions: [], signers: {} }; },
    async verify(p: any) { return { isValid: true, payer: p.payload.authorization.from }; },
    async settle(p: any, req: any) { settles.push(p.payload.authorization.from); return { success: true, transaction: "0x" + "5e".repeat(32), network: req.network, payer: p.payload.authorization.from }; },
  };
  const routes: Record<string, unknown> = {};
  for (const [k, r] of Object.entries(LEAK_CHECK_ROUTES)) {
    routes[k] = { accepts: { scheme: "exact", price: r.price, network: NETWORK_BASE, payTo: PAY_TO, maxTimeoutSeconds: 300 }, description: r.description, extensions: r.extensions };
  }
  const resource = new x402ResourceServer(client as any).register(NETWORK_BASE, new ExactEvmScheme());
  const http = new x402HTTPResourceServer(resource, routes as any);
  const route = withX402FromHTTPServer((req: NextRequest) => handleLeakCheck(req, { log: () => {}, allow: () => true }), http);
  return { route, settles };
}

async function paidPost(h: ReturnType<typeof harness>, body: string | object) {
  const unpaid = await h.route(new NextRequest(URL_, { method: "POST" }));
  const pr = JSON.parse(Buffer.from(unpaid.headers.get("payment-required")!, "base64").toString("utf8"));
  const a = pr.accepts[0];
  const payload = {
    x402Version: 2, resource: pr.resource, accepted: a,
    payload: { signature: "0x" + "00".repeat(65), authorization: { from: PAYER, to: a.payTo, value: a.amount, validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) + 300), nonce: "0x" + "22".repeat(32) } },
  };
  return h.route(new NextRequest(URL_, {
    method: "POST",
    headers: { "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64"), "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

describe("x402: $0.02 USDC on Base, settle only on 200", () => {
  it("unpaid POST → 402 with price, payTo, USDC, Bazaar extension holding the generated example", async () => {
    const h = harness();
    const res = await h.route(new NextRequest(URL_, { method: "POST" }));
    assert.equal(res.status, 402);
    const pr = JSON.parse(Buffer.from(res.headers.get("payment-required")!, "base64").toString("utf8"));
    assert.equal(pr.accepts.length, 1);
    const a = pr.accepts[0];
    assert.equal(LEAK_CHECK_PRICE_LABEL, "$0.02");
    assert.equal(a.network, NETWORK_BASE);
    assert.equal(a.amount, usdcToAtomic(LEAK_CHECK_PRICE_USDC).toString());
    assert.equal(a.amount, "20000");
    assert.equal(a.asset.toLowerCase(), USDC_BASE_MAINNET.toLowerCase());
    assert.equal(a.payTo, PAY_TO);
    assert.notEqual(a.extra?.paymentFlow, "upfront");
    const bz = pr.extensions?.bazaar;
    const v = validateDiscoveryExtension(bz);
    assert.equal(v.valid, true, JSON.stringify(v.errors));
    assert.deepEqual(bz.info.output.example, JSON.parse(JSON.stringify(LEAK_CHECK_OUTPUT_EXAMPLE)));
    assert.equal(bz.info.input.method, "POST");
    assert.equal(bz.info.input.bodyType, "json");
  });
  it("paid 200 settles exactly once", async () => {
    const h = harness();
    const res = await paidPost(h, fx("lc-ambiguous.json"));
    assert.equal(res.status, 200);
    assert.equal(h.settles.length, 0 + 1);
  });
  it("free statuses never settle: 400 (malformed, secret-like, schema) and 413", async () => {
    const h = harness();
    const secret = { agent: { name: "a", readsData: [] }, instructions: ["ghp_" + "Ab1".repeat(10)] };
    const big = { agent: { name: "a", readsData: [] }, instructions: ["x".repeat(MAX_BODY_BYTES)] };
    for (const [body, status] of [["{nope", 400], [secret, 400], [{ agent: 5 }, 400], [big, 413]] as const) {
      const res = await paidPost(h, body as string | object);
      assert.equal(res.status, status);
    }
    assert.equal(h.settles.length, 0, "never charged for a rejected request");
  });
  it("GET is not a paid route: 405, no settlement, no input accepted", async () => {
    const h = harness();
    const res = await h.route(new NextRequest(URL_));
    assert.equal(res.status, 405);
    assert.equal(h.settles.length, 0);
  });
});

describe("Bazaar listing metadata", () => {
  it("one-line verb-first description, <= 500 chars, ASCII, branded, price stated", () => {
    const d = LEAK_CHECK_META.description;
    assert.ok(d.length <= 500);
    assert.match(d, /^[\x20-\x7E]+$/);
    assert.match(d, /^Check /);
    assert.match(d, /Liquid Logic X/);
    assert.match(d, /\$0\.02 USDC on Base\.$/);
  });
});
