import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  LLX_UTILITY,
  LLX_UTILITY_NOTE,
  utilityStatusLabel,
} from "../lib/llxUtility";

const BANNED = [
  /\bprice (?:goes|go|will|target)/i,
  /\breturns?\b/i,
  /\byield\b/i,
  /\bbuy ?backs?\b/i,
  /\bprofit/i,
  /\bpump/i,
  /\bmoon\b/i,
  /\bgrows?\b/i,
  /pay\.liquidlogicx\.com/i,
];

const allCopy = [
  LLX_UTILITY_NOTE,
  ...LLX_UTILITY.flatMap((i) => [i.title, i.detail]),
].join("\n");

test("three utility items; only Liquid X-Lock fees in $LLX are live", () => {
  assert.equal(LLX_UTILITY.length, 3);
  for (const item of LLX_UTILITY) {
    const expected = item.id === "x-lock-fees" ? "live" : "coming_soon";
    assert.equal(item.status, expected, item.id);
    assert.equal(
      utilityStatusLabel(item.status),
      expected === "live" ? "Live" : "Coming soon",
    );
  }
});

test("utility copy never promises price, returns, yield, buybacks or profit", () => {
  for (const re of BANNED) assert.doesNotMatch(allCopy, re);
});

test("V1 card marks the original contract as replaced and shows the snapshot", () => {
  const src = readFileSync(
    join(__dirname, "..", "components", "LlxSection.tsx"),
    "utf8",
  );
  assert.match(
    src.replace(/\s+/g, " "),
    /This is the original V1 contract, not the \$LLX V2 token\./,
  );
  assert.match(src, /LLX_V1_SNAPSHOT_BLOCK/);
  assert.doesNotMatch(src, /only official/);
  assert.doesNotMatch(src, /before buying/);
  assert.doesNotMatch(src, /Please read/);
  assert.doesNotMatch(src, /never buys, sells or holds/);
});

test("footer carries the not-financial-advice line", () => {
  const src = readFileSync(
    join(__dirname, "..", "components", "SiteFooter.tsx"),
    "utf8",
  );
  assert.match(src, /Nothing on this site is financial advice\./);
});

test("footer carries Liquid Logic X LLC copyright", () => {
  const src = readFileSync(
    join(__dirname, "..", "components", "SiteFooter.tsx"),
    "utf8",
  );
  assert.match(src, /© 2026 Liquid Logic X LLC/);
  assert.doesNotMatch(src, /entity number|CA LLC|Secretary of State|filing/i);
});

const read = (name: string) =>
  readFileSync(join(__dirname, "..", "components", name), "utf8").replace(
    /\s+/g,
    " ",
  );

test("footer drops the old token disclaimer paragraph", () => {
  const src = read("SiteFooter.tsx");
  assert.doesNotMatch(src, /not an investment product/);
  assert.doesNotMatch(src, /Roadmap describes intent/);
});

test("team section links the official X and Telegram", () => {
  const src = read("TokenomicsSection.tsx");
  assert.match(src, /CONTACT_X/);
  assert.match(src, /CONTACT_TELEGRAM/);
});

test("roadmap has no L2 / privacy network card", () => {
  const src = read("ResearchGrid.tsx");
  assert.doesNotMatch(src, /Privacy Network/);
  assert.doesNotMatch(src, /No other payments network/);
});

test("policy section says agent spending settles in USDC today", () => {
  const src = read("PolicyTermsheet.tsx");
  assert.match(src, /Agent spending settles in USDC today\. \$LLX payments coming soon\./);
  assert.doesNotMatch(src, /never buys, sells or holds/);
});

test("Liquid X-Pay still says LLX never holds your keys", () => {
  assert.match(read("LlxPaySection.tsx"), /never holds your keys/);
});
