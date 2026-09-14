import type { LedgerEvent } from "@liquid-logic/shared";
import { basescanTxUrl, sumSpentTodayAtomic } from "@liquid-logic/shared";
import fs from "node:fs";
import path from "node:path";

export class LedgerStore {
  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "", "utf8");
    }
  }

  append(event: LedgerEvent): void {
    const line = JSON.stringify(event);
    fs.appendFileSync(this.filePath, line + "\n", "utf8");
  }

  readAll(): LedgerEvent[] {
    const raw = fs.readFileSync(this.filePath, "utf8");
    const events: LedgerEvent[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        events.push(JSON.parse(t) as LedgerEvent);
      } catch {
        // skip corrupt lines
      }
    }
    return events;
  }

  /** Sum USDC payment amounts for the UTC calendar day of `now`. */
  spentTodayAtomic(now = new Date()): bigint {
    return sumSpentTodayAtomic(this.readAll(), now);
  }

  hasTx(txHash: string): boolean {
    const key = txHash.toLowerCase();
    return this.readAll().some(
      (e) =>
        (e.type === "payment" || e.type === "top_up") &&
        "txHash" in e &&
        e.txHash?.toLowerCase() === key,
    );
  }

  recordPayment(opts: {
    endpoint: string;
    amountUsdc: string;
    network: "eip155:8453" | "eip155:84532";
    txHash?: string;
    walletAddress?: string;
    reason?: string;
    timestamp?: string;
  }): boolean {
    const txHash = opts.txHash;
    if (txHash && this.hasTx(txHash)) return false;
    this.append({
      type: "payment",
      timestamp: opts.timestamp ?? new Date().toISOString(),
      endpoint: opts.endpoint,
      amountUsdc: opts.amountUsdc,
      asset: "USDC",
      network: opts.network,
      txHash,
      basescanUrl: txHash ? basescanTxUrl(txHash) : undefined,
      walletAddress: opts.walletAddress,
      reason: opts.reason ?? "x402 service payment",
    });
    return true;
  }
}
