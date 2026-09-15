#!/usr/bin/env node
/**
 * One-off: write day-one launch genesis JSONL to TREASURER_LEDGER_PATH
 * (default /app/data/ledger.jsonl on Render).
 *
 * After merging genesis to GitHub, run this as a Render one-off job BEFORE
 * normal union sync resumes — otherwise union-merge reintroduces phantoms
 * from the old disk into GitHub.
 *
 *   TREASURER_LEDGER_PATH=/app/data/ledger.jsonl node scripts/write-launch-genesis.mjs
 */
import fs from "node:fs";
import path from "node:path";

const GENESIS = `{"type":"wallet_address","timestamp":"2026-09-13T14:11:07.316Z","walletAddress":"0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D","reason":"CDP-managed x402 payer address"}
{"type":"top_up","timestamp":"2026-09-13T15:20:07.000Z","amountUsdc":"5.00","txHash":"0x86725a32173f31957011a2a7b6a8136d48ed8074ac436396472adf3b7ce96310","basescanUrl":"https://basescan.org/tx/0x86725a32173f31957011a2a7b6a8136d48ed8074ac436396472adf3b7ce96310","reason":"USDC top-up from OKX (on-chain funding tx)"}
{"type":"note","timestamp":"2026-09-15T04:16:00.000Z","message":"LAUNCH_GENESIS_RESET","reason":"Day-one launch truncate — prefer this remote over longer Render disk until disk is wiped"}
`;

const target =
  process.env.TREASURER_LEDGER_PATH?.trim() ||
  process.env.LEDGER_JSONL_PATH?.trim() ||
  "./data/ledger.jsonl";

fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
fs.writeFileSync(target, GENESIS, "utf8");
console.log(
  JSON.stringify({
    ok: true,
    path: path.resolve(target),
    lines: 2,
    note: "Launch genesis written — unset LEDGER_LAUNCH_RESET after sync confirms match",
  }),
);
