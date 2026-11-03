import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { LLX_CONTRACT, LLX_V2_CONTRACT } from "../lib/site";
import { LLX_V2_VAULT } from "../lib/bridge";
import { ADDRESSES_FOOTER, ADDRESSES_TITLE, OFFICIAL_ADDRESSES } from "../lib/addresses";

test("addresses page lists every official address in full", () => {
  assert.equal(ADDRESSES_TITLE, "Official Liquid Logic X addresses");
  assert.equal(ADDRESSES_FOOTER, "If an address is not on this page, it is not ours.");
  const want = [
    LLX_V2_CONTRACT,
    LLX_V2_VAULT,
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
  const v2 = OFFICIAL_ADDRESSES[4];
  assert.equal(v2.chains?.length, 10);
  const token = OFFICIAL_ADDRESSES[0];
  assert.equal(token.address, "0x72885fBFA330d1a8fA95880A85b73d699943053B");
  assert.equal(token.chains?.length, 6);
  assert.equal(token.chains?.[0].label, "HyperEVM");
  assert.equal(token.explorer.href, "https://hyperevmscan.io/token/0x72885fBFA330d1a8fA95880A85b73d699943053B");
});

test("footer links to /addresses and page has no wallet connect", () => {
  const foot = readFileSync(join(__dirname, "..", "components", "SiteFooter.tsx"), "utf8");
  assert.match(foot, /href="\/addresses"/);
  const page = readFileSync(join(__dirname, "..", "app", "addresses", "page.tsx"), "utf8");
  assert.doesNotMatch(page, /wagmi|connect|ethereum\.request/i);
});
