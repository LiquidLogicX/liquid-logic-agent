/**
 * Unit checks for ENABLE_X402_ARC flag-gated Arc accept + ledger network/explorer.
 * Run: npm run check-arc -w @liquid-logic/audit
 */
import assert from "node:assert/strict";
import {
  explorerTxUrl,
  NETWORK_ARC,
  NETWORK_BASE,
  normalizeLedgerEvent,
  parseLedgerJsonl,
} from "@liquid-logic/shared";
import {
  appendArcAcceptToPaymentRequired,
  buildArcPaymentRequirements,
  fetchLiveArcKind,
  isX402ArcEnabled,
  ARC_KIND_LIVE,
} from "../lib/arc-x402";

function eq(a: unknown, b: unknown, msg: string): void {
  assert.deepEqual(a, b, msg);
}

// --- flag default off ---
delete process.env.ENABLE_X402_ARC;
assert.equal(isX402ArcEnabled(), false, "flag default off");

process.env.ENABLE_X402_ARC = "0";
assert.equal(isX402ArcEnabled(), false, "flag 0 off");

process.env.ENABLE_X402_ARC = "1";
assert.equal(isX402ArcEnabled(), true, "flag 1 on");
delete process.env.ENABLE_X402_ARC;

// --- Arc accept shape ---
const arc = buildArcPaymentRequirements({
  amountUsdc: "0.05",
  payTo: "0xe9bf3457f1e59ffa507141e64e8eb259f966c2c2",
});
assert.equal(arc.scheme, "exact");
assert.equal(arc.network, NETWORK_ARC);
assert.equal(arc.amount, "50000");
assert.equal(arc.asset, "0x3600000000000000000000000000000000000000");
assert.equal(arc.extra.name, "GatewayWalletBatched");
assert.equal(arc.extra.version, "1");
assert.equal(
  arc.extra.verifyingContract.toLowerCase(),
  "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee",
);
assert.ok(arc.maxTimeoutSeconds >= 604800);

// --- flag-off style: do not mutate when we simply skip append (v1) ---
const baseOnly = {
  x402Version: 2,
  error: "Payment required",
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      amount: "50000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x147991A1c25e78f6D9225d2dBA61eD93A6158c7b",
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    },
  ],
};
const baseSnapshot = JSON.stringify(baseOnly.accepts[0]);

const dual = appendArcAcceptToPaymentRequired(
  structuredClone(baseOnly),
  arc,
) as typeof baseOnly;
assert.equal(dual.accepts.length, 2, "flag-on: two accepts");
assert.equal(dual.accepts[0]!.network, "eip155:8453", "Base first");
assert.equal(JSON.stringify(dual.accepts[0]), baseSnapshot, "Base accept byte-identical");
assert.equal(dual.accepts[1]!.network, NETWORK_ARC, "Arc second");

const v1 = appendArcAcceptToPaymentRequired(
  { x402Version: 1, accepts: structuredClone(baseOnly.accepts) },
  arc,
) as { accepts: unknown[] };
assert.equal(v1.accepts.length, 1, "v1 stays Base-only");

const again = appendArcAcceptToPaymentRequired(structuredClone(dual), arc) as typeof dual;
assert.equal(again.accepts.length, 2, "idempotent append");

// --- ledger network backfill ---
const raw = parseLedgerJsonl(
  JSON.stringify({
    type: "payment",
    timestamp: "2026-09-13T00:00:00.000Z",
    endpoint: "https://example.com",
    amountUsdc: "0.05",
    asset: "USDC",
    txHash: "0x" + "ab".repeat(32),
  }) + "\n",
);
assert.equal(raw[0] && "network" in raw[0] && raw[0].network, NETWORK_BASE);

const normalized = normalizeLedgerEvent({
  type: "top_up",
  timestamp: "2026-09-13T00:00:00.000Z",
  amountUsdc: "1.00",
});
assert.ok(normalized && "network" in normalized);
assert.equal((normalized as { network?: string }).network, NETWORK_BASE);

// --- explorer branching ---
const tx = "0x" + "cd".repeat(32);
assert.equal(
  explorerTxUrl(NETWORK_BASE, tx),
  `https://basescan.org/tx/${tx}`,
);
assert.equal(
  explorerTxUrl(NETWORK_ARC, tx),
  `https://explorer.arc.io/tx/${tx}`,
);
assert.equal(
  explorerTxUrl(undefined, tx),
  `https://basescan.org/tx/${tx}`,
  "missing network → BaseScan",
);

async function main(): Promise<void> {
  // --- live Circle supported Arc kind ---
  const live = await fetchLiveArcKind();
  assert.equal(live.ok, true, live.mismatch ?? "live Arc kind ok");
  assert.equal(ARC_KIND_LIVE.network, NETWORK_ARC);

  console.log("check-arc-x402: ok");
  console.log(
    JSON.stringify(
      {
        flagOff: "Base accepts unchanged (append skipped when ENABLE_X402_ARC unset)",
        flagOn: {
          acceptsOrder: ["eip155:8453", "eip155:5042"],
          arcExtra: arc.extra.name,
          liveKindOk: live.ok,
        },
        ledgerBackfill: NETWORK_BASE,
        explorers: { base: "basescan.org", arc: "explorer.arc.io" },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
