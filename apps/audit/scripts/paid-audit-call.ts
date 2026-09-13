/**
 * External client: pay $0.05 USDC on Base via CDP x402, then call /api/audit.
 *
 * Usage:
 *   AUDIT_URL=https://audit.liquidlogicx.com \
 *   CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... CDP_WALLET_SECRET=... \
 *   WALLET_TO_AUDIT=0x... \
 *   npm run paid-call -w @liquid-logic/audit
 *
 * Save outputs under acceptance/ for live acceptance.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";

async function main(): Promise<void> {
  const baseUrl = (process.env.AUDIT_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const wallet = process.env.WALLET_TO_AUDIT;
  if (!wallet) {
    throw new Error("Set WALLET_TO_AUDIT=0x…");
  }

  // Omit environment for Base mainnet (real acceptance).
  const client = new CdpX402Client();
  const { evmAddress } = await client.getAddresses();
  console.error(`Paying from ${evmAddress}`);

  const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client as never);
  const url = `${baseUrl}/api/audit?wallet=${wallet}`;
  const res = await fetchWithPayment(url);
  const text = await res.text();

  const outDir = path.resolve(process.env.ACCEPTANCE_DIR ?? "./acceptance");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifact = {
    timestamp: new Date().toISOString(),
    requestUrl: url,
    payer: evmAddress,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: text,
  };
  const file = path.join(outDir, `paid-audit-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(artifact, null, 2) + "\n");
  console.log(text);
  console.error(`Wrote ${file}`);
  if (res.status >= 400) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
