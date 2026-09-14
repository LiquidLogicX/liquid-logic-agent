/**
 * Fixture tests for evaluateAllowance + bazaar example vs local ledger.
 * Usage: LEDGER_SKIP_REMOTE=1 npx tsx scripts/check-allowance.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TREASURER_POLICY,
  TREASURER_WALLET_ADDRESS,
  evaluateAllowance,
  type LedgerEvent,
  type PaymentEvent,
} from "@liquid-logic/shared";
import {
  ALLOWANCE_OUTPUT_EXAMPLE,
  ALLOWANCE_OUTPUT_EXAMPLE_WALLET_ONLY,
} from "../lib/allowance-output-example";
import { readLocalLedgerEvents } from "../lib/spend-summary";

const FROZEN_NOW = new Date("2026-09-14T12:00:00.000Z");
let failed = 0;

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL", msg);
    failed += 1;
  }
}

function eq(a: unknown, b: unknown, msg: string): void {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) {
    console.error("FAIL", msg);
    console.error("  got ", sa);
    console.error("  want", sb);
    failed += 1;
  }
}

function payment(partial: Partial<PaymentEvent> & { amountUsdc: string }): PaymentEvent {
  return {
    type: "payment",
    timestamp: partial.timestamp ?? "2026-09-14T01:00:00.000Z",
    endpoint: partial.endpoint ?? "https://audit.liquidlogicx.com/api/audit",
    amountUsdc: partial.amountUsdc,
    asset: "USDC",
    network: "eip155:8453",
    walletAddress: partial.walletAddress ?? TREASURER_WALLET_ADDRESS,
    reason: partial.reason,
    txHash: partial.txHash,
  };
}

const policy = DEFAULT_TREASURER_POLICY;

// 1) allowlisted endpoint, room under cap
{
  const r = evaluateAllowance({
    policy,
    events: [payment({ amountUsdc: "0.05" })],
    walletAddress: TREASURER_WALLET_ADDRESS,
    endpoint: "https://audit.liquidlogicx.com/api/audit",
    now: FROZEN_NOW,
  });
  assert(r.allowed === true, "allowlisted should be allowed");
  eq(r.spentUsdc, 0.05, "spent");
  eq(r.remainingUsdc, 9.95, "remaining");
  eq(r.capUsdc, 10, "cap");
  eq(r.endpointAllowlisted, true, "endpointAllowlisted");
}

// 2) unknown endpoint
{
  const r = evaluateAllowance({
    policy,
    events: [],
    walletAddress: TREASURER_WALLET_ADDRESS,
    endpoint: "https://evil.example/pay",
    now: FROZEN_NOW,
  });
  assert(r.allowed === false, "unknown endpoint denied");
  eq(r.endpointAllowlisted, false, "not allowlisted");
  assert(r.reason.includes("not on the treasurer allowlist"), "reason allowlist");
}

// 3) other wallet
{
  const r = evaluateAllowance({
    policy,
    events: [],
    walletAddress: "0x0000000000000000000000000000000000000001",
    endpoint: "https://audit.liquidlogicx.com/api/audit",
    now: FROZEN_NOW,
  });
  assert(r.allowed === false, "foreign wallet denied");
  eq(r.remainingUsdc, 0, "foreign remaining is 0");
  assert(r.reason.includes("No treasurer policy"), "foreign reason");
}

// 4) cap exhausted
{
  const r = evaluateAllowance({
    policy,
    events: [payment({ amountUsdc: "10.00" })],
    walletAddress: TREASURER_WALLET_ADDRESS,
    endpoint: "https://audit.liquidlogicx.com/api/audit",
    now: FROZEN_NOW,
  });
  assert(r.allowed === false, "cap exhausted denied");
  eq(r.remainingUsdc, 0, "remaining 0 at cap");
  assert(r.reason.includes("daily cap is reached"), "cap reason");
}

// 5) amount hint exceeds max per payment
{
  const r = evaluateAllowance({
    policy,
    events: [],
    walletAddress: TREASURER_WALLET_ADDRESS,
    endpoint: "https://audit.liquidlogicx.com/api/audit",
    amountUsdc: "1.01",
    now: FROZEN_NOW,
  });
  assert(r.allowed === false, "over max per payment denied");
  assert(r.reason.includes("exceeds max per payment"), "max reason");
}

// 6) wallet-only summary includes allowlist
{
  const r = evaluateAllowance({
    policy,
    events: [payment({ amountUsdc: "0.1" })],
    walletAddress: TREASURER_WALLET_ADDRESS,
    now: FROZEN_NOW,
  });
  assert(r.allowed === true, "wallet-only allowed");
  eq(r.allowlist, policy.allowlist, "allowlist echoed");
  eq(r.endpoint, null, "endpoint null");
}

// 7) published policy.json matches DEFAULT_TREASURER_POLICY
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "../../../public/policy.json"),
    path.join(process.cwd(), "../../public/policy.json"),
    path.join(process.cwd(), "public/policy.json"),
  ];
  const policyPath = candidates.find((c) => fs.existsSync(c));
  assert(policyPath, "policy.json exists");
  if (policyPath) {
    const published = JSON.parse(fs.readFileSync(policyPath, "utf8")) as {
      walletAddress: string;
      allowlist: string[];
      maxPerPaymentUsdc: string;
      dailyCapUsdc: string;
      network: string;
      asset: string;
      spentWindow: string;
    };
    eq(published.walletAddress, policy.walletAddress, "policy wallet");
    eq(published.allowlist, policy.allowlist, "policy allowlist");
    eq(published.maxPerPaymentUsdc, policy.maxPerPaymentUsdc, "policy max");
    eq(published.dailyCapUsdc, policy.dailyCapUsdc, "policy daily");
    eq(published.network, policy.network, "policy network");
    eq(published.asset, policy.asset, "policy asset");
    eq(published.spentWindow, policy.spentWindow, "policy window");
  }
}

// 8) bazaar example matches local ledger at frozen 2026-09-14
{
  const events: LedgerEvent[] = readLocalLedgerEvents();
  const withEndpoint = evaluateAllowance({
    policy,
    events,
    walletAddress: ALLOWANCE_OUTPUT_EXAMPLE.walletAddress,
    endpoint: ALLOWANCE_OUTPUT_EXAMPLE.endpoint,
    now: FROZEN_NOW,
  });
  eq(withEndpoint, ALLOWANCE_OUTPUT_EXAMPLE, "bazaar example (with endpoint)");

  const walletOnly = evaluateAllowance({
    policy,
    events,
    walletAddress: ALLOWANCE_OUTPUT_EXAMPLE_WALLET_ONLY.walletAddress,
    now: FROZEN_NOW,
  });
  eq(walletOnly, ALLOWANCE_OUTPUT_EXAMPLE_WALLET_ONLY, "bazaar example (wallet only)");
}

if (failed > 0) {
  console.error(`check-allowance: ${failed} failure(s)`);
  process.exit(2);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      frozenDay: "2026-09-14",
      remainingUsdc: ALLOWANCE_OUTPUT_EXAMPLE.remainingUsdc,
      spentUsdc: ALLOWANCE_OUTPUT_EXAMPLE.spentUsdc,
      allowlist: DEFAULT_TREASURER_POLICY.allowlist.length,
    },
    null,
    2,
  ),
);
