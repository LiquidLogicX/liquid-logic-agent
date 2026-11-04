import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BRIDGE_CHAINS } from "../lib/bridge";
import {
  CSP_REPORT_ONLY,
  EMBED_PATHS,
  NON_EMBED_SOURCE,
  RPC_ORIGINS,
  securityHeaders,
} from "../lib/securityHeaders";

const rules = securityHeaders();
const value = (source: string, key: string) =>
  rules.find((r) => r.source === source)?.headers.find((h) => h.key === key)?.value;

test("base headers apply to every route", () => {
  assert.equal(value("/:path*", "Strict-Transport-Security"), "max-age=63072000; includeSubDomains");
  assert.equal(value("/:path*", "X-Content-Type-Options"), "nosniff");
  assert.equal(value("/:path*", "Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(value("/:path*", "Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
  // the full policy is report-only on every route; no enforced full CSP yet
  assert.ok(value("/:path*", "Content-Security-Policy-Report-Only"));
  assert.equal(value("/:path*", "Content-Security-Policy"), undefined);
});

test("non-embed routes cannot be framed", () => {
  for (const src of ["/", NON_EMBED_SOURCE]) {
    assert.equal(value(src, "Content-Security-Policy"), "frame-ancestors 'none'");
    assert.equal(value(src, "X-Frame-Options"), "DENY");
  }
});

test("ledger embed and the file it frames allow any parent", () => {
  assert.deepEqual([...EMBED_PATHS], ["/ledger/embed", "/ledger/index.html"]);
  for (const p of EMBED_PATHS) {
    assert.equal(value(p, "Content-Security-Policy"), "frame-ancestors *");
    assert.equal(value(p, "X-Frame-Options"), undefined);
  }
  const embed = readFileSync(join(__dirname, "..", "app", "ledger", "embed", "page.tsx"), "utf8");
  assert.match(embed, /src="\/ledger\/index\.html"/);
});

test("non-embed source excludes exactly the embed paths", () => {
  // path-to-regexp body of the :path param, applied to the path minus its leading slash
  const body = NON_EMBED_SOURCE.slice("/:path(".length, -1);
  const re = new RegExp(`^${body}$`);
  for (const p of EMBED_PATHS) assert.doesNotMatch(p.slice(1), re);
  for (const p of ["", "ledger", "ledger/embedx", "ledger/2026-10-06.html", "about", "bridge"]) {
    assert.match(p, re);
  }
});

test("report-only CSP lets the bridge reach every RPC", () => {
  const all = BRIDGE_CHAINS.flatMap((c) => [c.rpc, ...(c.rpcFallbacks ?? [])]);
  for (const url of all) assert.ok(RPC_ORIGINS.includes(new URL(url).origin), url);
  const connect = CSP_REPORT_ONLY.split("; ").find((d) => d.startsWith("connect-src "));
  assert.ok(connect);
  for (const o of RPC_ORIGINS) assert.ok(connect.includes(o), o);
  assert.match(CSP_REPORT_ONLY, /https:\/\/fonts\.googleapis\.com/);
  assert.match(CSP_REPORT_ONLY, /https:\/\/fonts\.gstatic\.com/);
  assert.doesNotMatch(CSP_REPORT_ONLY, /frame-ancestors/);
});

test("next.config wires the security headers in", () => {
  const cfg = readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");
  assert.match(cfg, /\.\.\.securityHeaders\(\)/);
  const audit = readFileSync(join(__dirname, "..", "..", "audit", "next.config.ts"), "utf8");
  assert.match(audit, /frame-ancestors 'none'/);
  assert.match(audit, /Strict-Transport-Security/);
  assert.match(audit, /nosniff/);
  assert.match(audit, /strict-origin-when-cross-origin/);
});

test("homepage V1 card has no Copy button and labels V1 as retired", () => {
  const src = readFileSync(join(__dirname, "..", "components", "LlxSection.tsx"), "utf8");
  assert.doesNotMatch(src, /CopyButton/);
  assert.match(src, /V1 \(retired, do not buy\)/);
  assert.doesNotMatch(src, /href=\{LLX_BASESCAN\}[^<]*>\s*\{LLX_CONTRACT\}/);
});
