import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { LLX_CONTRACT } from "../lib/site";
import { ADDRESSES_FOOTER, ADDRESSES_TITLE, OFFICIAL_ADDRESSES } from "../lib/addresses";

test("addresses page lists every official address in full", () => {
  assert.equal(ADDRESSES_TITLE, "Official Liquid Logic X addresses");
  assert.equal(ADDRESSES_FOOTER, "If an address is not on this page, it is not ours.");
  const want = [
    LLX_CONTRACT,
    "0xD47326d2B5822355D9c4dfF5265849a5bb5D20ec",
    "0x54b3019acBBf9aeFDc545d5CeA75e10322eA9D44",
    "0x33e3c3f9c92f2045e1d3928599737e47a9d0dd8b",
    "0x95672ca9b03b7d07c9efc1f7d71fe137c748ecdc",
    "0x8e351267f713e8fa21befd4aad2ed4ae4146cb38",
    "0x931b89e025beb0b4243faa63c70e8d64c43bc9b8",
  ];
  assert.deepEqual(OFFICIAL_ADDRESSES.map((r) => r.address), want);
  for (const r of OFFICIAL_ADDRESSES) {
    assert.match(r.address, /^0x[0-9a-fA-F]{40}$/);
    assert.ok(r.explorer.href.endsWith(r.address));
  }
  const v2 = OFFICIAL_ADDRESSES[2];
  assert.equal(v2.chains?.length, 10);
});

test("footer links to /addresses and page has no wallet connect", () => {
  const foot = readFileSync(join(__dirname, "..", "components", "SiteFooter.tsx"), "utf8");
  assert.match(foot, /href="\/addresses"/);
  const page = readFileSync(join(__dirname, "..", "app", "addresses", "page.tsx"), "utf8");
  assert.doesNotMatch(page, /wagmi|connect|ethereum\.request/i);
});
