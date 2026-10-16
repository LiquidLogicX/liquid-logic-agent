import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ESCROW_CHAIN, DEFAULT_ESCROW_ID, escrowStatusPath, DEFAULT_TEST_TOKEN, basescanTx, isAddress, lockStatusPath, okxDeepLink, pickProvider } from "../lib/test-call/core";

test("default token is LLX and valid", () => { assert.ok(isAddress(DEFAULT_TEST_TOKEN)); });
test("path builds and rejects bad input", () => {
  assert.equal(lockStatusPath(DEFAULT_TEST_TOKEN), `/api/lock-status?token=${DEFAULT_TEST_TOKEN}`);
  assert.equal(lockStatusPath(` ${DEFAULT_TEST_TOKEN} `, "base"), `/api/lock-status?token=${DEFAULT_TEST_TOKEN}&chain=base`);
  assert.throws(() => lockStatusPath("0x123"));
});
test("links", () => {
  assert.equal(basescanTx("0xab"), "https://basescan.org/tx/0xab");
  assert.ok(okxDeepLink("https://audit.liquidlogicx.com/").includes(encodeURIComponent("okx://wallet/dapp/url")));
});
test("provider prefers okxwallet", () => {
  assert.equal(pickProvider({ okxwallet: 1, ethereum: 2 }), 1);
  assert.equal(pickProvider({ ethereum: 2 }), 2);
  assert.equal(pickProvider(undefined), undefined);
});
test("escrow path builds, normalizes and rejects bad input", () => {
  assert.equal(escrowStatusPath(DEFAULT_ESCROW_CHAIN, DEFAULT_ESCROW_ID), "/api/escrow-status?chain=base&id=1");
  assert.equal(escrowStatusPath(" Ethereum ", " 42 "), "/api/escrow-status?chain=ethereum&id=42");
  assert.throws(() => escrowStatusPath("base", "0"));
  assert.throws(() => escrowStatusPath("base", "1.5"));
  assert.throws(() => escrowStatusPath("base", ""));
  assert.throws(() => escrowStatusPath("b&x=1", "1"));
  assert.throws(() => escrowStatusPath("", "1"));
});
