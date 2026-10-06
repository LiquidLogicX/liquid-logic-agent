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

test("three utility items, none marked live until x402 $LLX accept ships", () => {
  assert.equal(LLX_UTILITY.length, 3);
  for (const item of LLX_UTILITY) {
    assert.equal(item.status, "coming_soon", item.id);
    assert.equal(utilityStatusLabel(item.status), "Coming soon");
  }
});

test("utility copy never promises price, returns, yield, buybacks or profit", () => {
  for (const re of BANNED) assert.doesNotMatch(allCopy, re);
});

test("token section has the official-contract line and no Please read box", () => {
  const src = readFileSync(
    join(__dirname, "..", "components", "LlxSection.tsx"),
    "utf8",
  );
  assert.match(
    src.replace(/\s+/g, " "),
    /This is the only official \$LLX contract\. Check the address before buying\./,
  );
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

test("token table says team holdings were bought on the open market", () => {
  assert.match(
    read("LlxSection.tsx"),
    /None at launch\. Team holdings were bought on the open market\./,
  );
});

test("FHE roadmap card uses the private proof of funds line", () => {
  const src = read("ResearchGrid.tsx");
  assert.match(src, /Private proof of funds, powered by fully homomorphic encryption\./);
  assert.doesNotMatch(src, /No other payments network/);
});

test("policy section says agent spending settles in USDC today", () => {
  const src = read("PolicyTermsheet.tsx");
  assert.match(src, /Agent spending settles in USDC today\. \$LLX payments coming soon\./);
  assert.doesNotMatch(src, /never buys, sells or holds/);
});

test("LLX Pay still says LLX never holds your keys", () => {
  assert.match(read("LlxPaySection.tsx"), /never holds your keys/);
});
