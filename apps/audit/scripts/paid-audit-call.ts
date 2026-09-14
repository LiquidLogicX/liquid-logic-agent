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
import { AUDIT_PRICE_USDC, basescanTxUrl } from "@liquid-logic/shared";

function extractTxHash(res: Response): string | undefined {
  const raw = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  if (!raw) return undefined;
  const candidates = [raw];
  try {
    const pad = "=".repeat((4 - (raw.length % 4)) % 4);
    candidates.push(Buffer.from(raw + pad, "base64url").toString("utf8"));
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as {
        transaction?: string;
        txHash?: string;
        transactionHash?: string;
      };
      const tx = parsed.transaction ?? parsed.txHash ?? parsed.transactionHash;
      if (tx && /^0x[a-fA-F0-9]{64}$/.test(tx)) return tx;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function appendLedgerPayment(opts: {
  endpoint: string;
  amountUsdc: string;
  txHash?: string;
  walletAddress: string;
}): void {
  const ledgerPath = process.env.LEDGER_JSONL_PATH ?? process.env.TREASURER_LEDGER_PATH;
  if (!ledgerPath) return;
  const abs = path.resolve(ledgerPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (opts.txHash) {
    try {
      const existing = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      if (existing.toLowerCase().includes(opts.txHash.toLowerCase())) return;
    } catch {
      /* still append */
    }
  }
  const event = {
    type: "payment",
    timestamp: new Date().toISOString(),
    endpoint: opts.endpoint,
    amountUsdc: opts.amountUsdc,
    asset: "USDC",
    network: "eip155:8453",
    txHash: opts.txHash,
    basescanUrl: opts.txHash ? basescanTxUrl(opts.txHash) : undefined,
    walletAddress: opts.walletAddress,
    reason: "paid audit call",
  };
  fs.appendFileSync(abs, JSON.stringify(event) + "\n", "utf8");
  console.error(`Recorded payment to ${abs}`);
}

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
  const txHash = extractTxHash(res);
  appendLedgerPayment({
    endpoint: `${baseUrl}/api/audit`,
    amountUsdc: AUDIT_PRICE_USDC,
    txHash,
    walletAddress: evmAddress,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
