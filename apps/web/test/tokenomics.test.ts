import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LLX_TEAM,
  LLX_V2_ALLOCATIONS,
  LLX_V2_CHAINS,
  LLX_V2_ROADMAP,
  LLX_V2_TOTAL_SUPPLY,
  allocationGradient,
  allocationPercent,
  LLX_V2_WHY,
} from "../lib/tokenomics";

const BANNED = [
  /\bprice (?:goes|go|will|target)/i,
  /\breturns?\b/i,
  /\byield\b/i,
  /\bbuy ?backs?\b/i,
  /\bprofit/i,
  /\bpump/i,
  /\bmoon\b/i,
  /\bgrows?\b/i,
  /\bguarantee/i,
  /0x[0-9a-f]{40}/i, // no contract address on the page until launch
];

test("allocations add up to exactly the 25M fixed supply", () => {
  const sum = LLX_V2_ALLOCATIONS.reduce((s, a) => s + a.amount, 0);
  assert.equal(LLX_V2_TOTAL_SUPPLY, 25_000_000);
  assert.equal(sum, LLX_V2_TOTAL_SUPPLY);
});

test("confirmed shares: presale 10%, DEX liquidity 6%, team 5%", () => {
  const by = Object.fromEntries(LLX_V2_ALLOCATIONS.map((a) => [a.id, a]));
  assert.equal(allocationPercent(by.presale.amount), "10%");
  assert.equal(allocationPercent(by.liquidity.amount), "6%");
  assert.equal(allocationPercent(by.team.amount), "5%");
  assert.equal(allocationPercent(by.treasury.amount), "45%");
  assert.equal(allocationPercent(by.partnerships.amount), "20%");
});

test("ids are unique and the donut covers 360 degrees", () => {
  const ids = LLX_V2_ALLOCATIONS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(allocationGradient(), /360\.00deg\)$/);
});

test("six chains, three roadmap phases, founder listed", () => {
  assert.deepEqual([...LLX_V2_CHAINS], ["Base", "Arc", "Robinhood Chain", "BNB Chain", "Tempo", "Hyperliquid"]);
  assert.equal(LLX_V2_ROADMAP.length, 3);
  assert.equal(LLX_TEAM[0].name, "Miles Francisco");
});

test("copy never promises price, returns or profit and shows no address yet", () => {
  const copy = [
    ...LLX_V2_ALLOCATIONS.flatMap((a) => [a.label, a.release]),
    ...LLX_V2_ROADMAP.flatMap((p) => p.items.map((i) => i.text)),
    ...LLX_TEAM.flatMap((m) => [m.name, m.role, m.bio]),
    LLX_V2_WHY.intro,
    ...LLX_V2_WHY.launchpad.paragraphs,
    ...LLX_V2_WHY.different.points,
    ...LLX_V2_WHY.holders.paragraphs,
  ].join("\n");
  for (const re of BANNED) assert.doesNotMatch(copy, re);
});
