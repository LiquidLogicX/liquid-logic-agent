import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ADDRESSES_DISCLAIMER,
  OFFICIAL_ADDRESSES,
  XLOCK_FACTORY_V2,
  basescanAddress,
} from "../lib/addresses";
import { LLX_CONTRACT } from "../lib/site";

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", ...parts), "utf8");

/** Addresses as checked on-chain (Base + 9 V2 chains) before this page shipped. */
const EXPECTED: Record<string, string> = {
  "$LLX token": "0xB9Dd507a5b352783b25e14c9b6E77D9f0067380f",
  "X-Lock Factory (Base V1)": "0xD47326d2B5822355D9c4dfF5265849a5bb5D20ec",
  "X-Lock Factory V2 (all other chains)": "0x54b3019acBBf9aeFDc545d5CeA75e10322eA9D44",
  Partnerships: "0x33e3c3f9c92F2045e1d3928599737E47a9D0dD8B",
  Team: "0x95672Ca9b03b7D07C9efc1f7D71fe137C748ECdC",
  "X-Lock Fees": "0x8e351267F713e8Fa21befD4AaD2eD4AE4146CB38",
  "X-Lock Owner": "0x931B89E025Beb0b4243FaA63C70e8d64c43bc9b8",
};

test("addresses page lists exactly the seven official addresses, in order", () => {
  assert.deepEqual(
    OFFICIAL_ADDRESSES.map((a) => a.name),
    Object.keys(EXPECTED),
  );
  for (const row of OFFICIAL_ADDRESSES) {
    assert.equal(row.address, EXPECTED[row.name], row.name);
    assert.match(row.address, /^0x[0-9a-fA-F]{40}$/, row.name);
  }
});

test("addresses are unique and $LLX matches the site-wide contract", () => {
  const lower = OFFICIAL_ADDRESSES.map((a) => a.address.toLowerCase());
  assert.equal(new Set(lower).size, lower.length);
  assert.equal(OFFICIAL_ADDRESSES[0].address, LLX_CONTRACT);
});

test("Basescan links use the full address; V2 factory is marked off-Base", () => {
  assert.equal(
    basescanAddress(LLX_CONTRACT),
    `https://basescan.org/address/${LLX_CONTRACT}`,
  );
  const v2 = OFFICIAL_ADDRESSES.find((a) => a.address === XLOCK_FACTORY_V2);
  assert.ok(v2 && !v2.onBase);
  assert.equal(v2.explorers?.length, 9);
  for (const e of v2.explorers ?? []) {
    assert.ok(e.url.startsWith("https://") && e.url.endsWith(XLOCK_FACTORY_V2), e.chain);
  }
  const partners = OFFICIAL_ADDRESSES.find((a) => a.name === "Partnerships");
  assert.equal(partners?.link?.href, "https://xlock.liquidlogicx.com/lock/1");
});

test("page is static (no wallet connect) and carries the disclaimer", () => {
  const src = read("app", "addresses", "page.tsx");
  assert.equal(ADDRESSES_DISCLAIMER, "If an address is not on this page, it is not ours.");
  assert.match(src, /ADDRESSES_DISCLAIMER/);
  assert.doesNotMatch(src, /wagmi|connectkit|rainbowkit|walletconnect|eth_requestAccounts|window\.ethereum/i);
});

test("site footer links to /addresses", () => {
  assert.match(read("components", "SiteFooter.tsx"), /href="\/addresses"/);
});
