/**
 * LIVE client (spends real USDC): pay $0.02 on Base via CDP x402, call /api/prove.
 * For Miles's runbook (docs/prove-runbook.md) — never run from CI or the agent box.
 *
 * Usage:
 *   AUDIT_URL=https://audit.liquidlogicx.com \
 *   CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... CDP_WALLET_SECRET=... \
 *   PROVE_TX_HASH=0x… [PROVE_MEMO="runbook check 2"] \
 *   npm run paid-prove -w @liquid-logic/audit
 *
 * On 200 it appends the settled payment to repo-root data/ledger.jsonl, same as
 * paid-audit-call (skips if the tx hash is already there).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";
import { explorerTxUrl, NETWORK_BASE, PROVE_PRICE_USDC } from "@liquid-logic/shared";

function repoRoot(): string {
  let dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  for (let i = 0; i < 6 && !fs.existsSync(path.join(dir, "GUARDRAILS.md")); i++) dir = path.dirname(dir);
  return dir;
}

function settlementTx(res: Response): { txHash?: string; network?: string } {
  const raw = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  if (!raw) return {};
  for (const c of [raw, Buffer.from(raw, "base64").toString("utf8")]) {
    try {
      const p = JSON.parse(c) as { transaction?: string; network?: string };
      if (p.transaction && /^0x[a-fA-F0-9]{64}$/.test(p.transaction)) {
        return { txHash: p.transaction, network: p.network };
      }
    } catch {
      /* next */
    }
  }
  return {};
}

async function main(): Promise<void> {
  const baseUrl = (process.env.AUDIT_URL ?? "https://audit.liquidlogicx.com").replace(/\/$/, "");
  const txHash = process.env.PROVE_TX_HASH?.trim();
  if (!txHash) throw new Error("Set PROVE_TX_HASH=0x… (a Base USDC tx your CDP wallet sent or received)");
  const memo = process.env.PROVE_MEMO ?? "";

  const client = new CdpX402Client();
  const { evmAddress } = await client.getAddresses();
  console.error(`Paying ${PROVE_PRICE_USDC} USDC from ${evmAddress}`);

  const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client as never);
  const res = await fetchWithPayment(`${baseUrl}/api/prove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(memo ? { txHash, memo } : { txHash }),
  });
  const text = await res.text();
  const settled = settlementTx(res);

  const outDir = path.resolve(process.env.ACCEPTANCE_DIR ?? "./acceptance");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `paid-prove-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      { timestamp: new Date().toISOString(), payer: evmAddress, txHash, status: res.status, settlement: settled, body: text },
      null,
      2,
    ) + "\n",
  );
  console.log(text);
  console.error(`HTTP ${res.status}; settlement tx: ${settled.txHash ?? "(none — not charged)"}; wrote ${file}`);
  if (res.status >= 400 || !settled.txHash) process.exit(res.status >= 400 ? 2 : 0);

  const ledger = path.join(repoRoot(), "data/ledger.jsonl");
  const existing = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : "";
  if (existing.toLowerCase().includes(settled.txHash!.toLowerCase())) return;
  const network = settled.network ?? NETWORK_BASE;
  fs.appendFileSync(
    ledger,
    JSON.stringify({
      type: "payment",
      timestamp: new Date().toISOString(),
      endpoint: `${baseUrl}/api/prove`,
      amountUsdc: PROVE_PRICE_USDC,
      asset: "USDC",
      network,
      txHash: settled.txHash,
      basescanUrl: explorerTxUrl(network, settled.txHash!),
      walletAddress: evmAddress,
      reason: "paid prove call",
    }) + "\n",
    "utf8",
  );
  console.error(`Recorded payment to ${ledger}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
