/**
 * External client: pay $0.001 USDC on Base via CDP x402, then call /api/allowance.
 *
 * Usage:
 *   AUDIT_URL=https://audit.liquidlogicx.com \
 *   CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... CDP_WALLET_SECRET=... \
 *   WALLET_TO_AUDIT=0x... \
 *   ENDPOINT_TO_CHECK=https://audit.liquidlogicx.com/api/audit \
 *   npm run paid-allowance -w @liquid-logic/audit
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ALLOWANCE_PRICE_USDC, TREASURER_WALLET_ADDRESS } from "@liquid-logic/shared";

async function main(): Promise<void> {
  const baseUrl = (process.env.AUDIT_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const wallet = process.env.WALLET_TO_AUDIT ?? TREASURER_WALLET_ADDRESS;
  const endpoint = process.env.ENDPOINT_TO_CHECK ?? "";

  const client = new CdpX402Client();
  const { evmAddress } = await client.getAddresses();
  console.error(`Paying ${ALLOWANCE_PRICE_USDC} USDC from ${evmAddress}`);

  const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client as never);
  const qs = new URLSearchParams({ wallet });
  if (endpoint) qs.set("endpoint", endpoint);
  const url = `${baseUrl}/api/allowance?${qs.toString()}`;
  const res = await fetchWithPayment(url);
  const text = await res.text();

  const outDir = path.resolve(process.env.ACCEPTANCE_DIR ?? "./acceptance");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `paid-allowance-${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        requestUrl: url,
        payer: evmAddress,
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: text,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(text);
  console.error(`Wrote ${file}`);
  if (res.status >= 400) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
