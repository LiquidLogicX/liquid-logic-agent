import assert from "node:assert/strict";
import { test } from "node:test";
import {
  handleAccessRequest,
  MSG_UNAVAILABLE,
  RATE_LIMIT_MAX,
  readConfig,
  REQUESTS_LIST_KEY,
  validateAccessRequest,
} from "../lib/requestAccess";

const good = { company: "Acme Inc", email: "Ops@Acme.com" };
const fullEnv = {
  UPSTASH_REDIS_REST_URL: "https://redis.example",
  UPSTASH_REDIS_REST_TOKEN: "t",
  RESEND_API_KEY: "k",
  ACCESS_REQUEST_FROM: "LLX Pay <access@liquidlogicx.com>",
};

type Call = { url: string; body: unknown };
function mockFetch(opts: { redisOk?: boolean; resendOk?: boolean; incr?: number } = {}) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: u, body });
    if (u.endsWith("/pipeline")) {
      if (opts.redisOk === false) return new Response("no", { status: 500 });
      const cmds = body as unknown[][];
      return Response.json(cmds.map((c) => ({ result: c[0] === "INCR" ? (opts.incr ?? 1) : 1 })));
    }
    if (u.startsWith("https://api.resend.com")) {
      return new Response("{}", { status: opts.resendOk === false ? 500 : 200 });
    }
    throw new Error("unexpected " + u);
  }) as typeof fetch;
  return { impl, calls };
}

let n = 0;
const key = () => `test-${++n}`;

test("validation", () => {
  assert.equal(validateAccessRequest(null).ok, false);
  assert.equal(validateAccessRequest({ company: "", email: "a@b.co" }).ok, false);
  assert.equal(validateAccessRequest({ company: "A", email: "not-an-email" }).ok, false);
  assert.equal(validateAccessRequest({ company: "A\r\nBcc: x", email: "a@b.co" }).ok, false);
  assert.equal(validateAccessRequest({ company: "x".repeat(121), email: "a@b.co" }).ok, false);
  const v = validateAccessRequest(good);
  assert.ok(v.ok && v.value.email === "ops@acme.com" && !v.honeypot);
  const hp = validateAccessRequest({ ...good, website: "spam" });
  assert.ok(hp.ok && hp.honeypot);
});

test("config reads Upstash or Vercel KV names", () => {
  assert.equal(readConfig({}).redis, null);
  assert.equal(readConfig({}).resend, null);
  assert.ok(readConfig({ KV_REST_API_URL: "https://kv.example/", KV_REST_API_TOKEN: "t" }).redis);
  assert.equal(readConfig({ UPSTASH_REDIS_REST_URL: "http://insecure", UPSTASH_REDIS_REST_TOKEN: "t" }).redis, null);
  assert.equal(readConfig({ RESEND_API_KEY: "k" }).resend, null, "needs a from address");
  assert.equal(readConfig(fullEnv).resend?.to, "hello@liquidlogicx.com");
});

test("fails safe with 503 when nothing is configured", async () => {
  const { impl, calls } = mockFetch();
  const r = await handleAccessRequest(good, { env: {}, clientKey: key(), fetchImpl: impl });
  assert.equal(r.status, 503);
  assert.equal(r.body.message, MSG_UNAVAILABLE);
  assert.equal(calls.length, 0);
});

test("stores and notifies hello@ when configured", async () => {
  const { impl, calls } = mockFetch();
  const r = await handleAccessRequest(good, { env: fullEnv, clientKey: key(), fetchImpl: impl });
  assert.equal(r.status, 200);
  const lpush = calls.find((c) => JSON.stringify(c.body).includes("LPUSH"));
  assert.ok(lpush);
  const cmd = (lpush!.body as string[][])[0];
  assert.equal(cmd[1], REQUESTS_LIST_KEY);
  assert.equal(JSON.parse(cmd[2]).email, "ops@acme.com");
  const mail = calls.find((c) => c.url.startsWith("https://api.resend.com"));
  assert.deepEqual((mail!.body as { to: string[] }).to, ["hello@liquidlogicx.com"]);
  assert.equal((mail!.body as { reply_to: string }).reply_to, "ops@acme.com");
});

test("partial delivery still succeeds; total failure is 503", async () => {
  const a = mockFetch({ resendOk: false });
  assert.equal((await handleAccessRequest(good, { env: fullEnv, clientKey: key(), fetchImpl: a.impl })).status, 200);
  const b = mockFetch({ redisOk: false, resendOk: false });
  assert.equal((await handleAccessRequest(good, { env: fullEnv, clientKey: key(), fetchImpl: b.impl })).status, 503);
});

test("honeypot returns success without storing or sending", async () => {
  const { impl, calls } = mockFetch();
  const r = await handleAccessRequest({ ...good, website: "x" }, { env: fullEnv, clientKey: key(), fetchImpl: impl });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
});

test("rate limit via Redis counter", async () => {
  const { impl } = mockFetch({ incr: RATE_LIMIT_MAX + 1 });
  const r = await handleAccessRequest(good, { env: fullEnv, clientKey: key(), fetchImpl: impl });
  assert.equal(r.status, 429);
});

test("in-memory rate limit when Redis is absent", async () => {
  const { impl } = mockFetch();
  const env = { RESEND_API_KEY: "k", ACCESS_REQUEST_FROM: "a@liquidlogicx.com" };
  const k = key();
  const now = Date.now();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    assert.equal((await handleAccessRequest(good, { env, clientKey: k, fetchImpl: impl, now })).status, 200);
  }
  assert.equal((await handleAccessRequest(good, { env, clientKey: k, fetchImpl: impl, now })).status, 429);
});
