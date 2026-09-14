import type { LedgerEvent } from "@liquid-logic/shared";
import {
  basescanTxUrl,
  DEFAULT_LEDGER_EVENT_TYPE,
  normalizeLedgerEvent,
  parseLedgerJsonl,
  sumSpentTodayAtomic,
} from "@liquid-logic/shared";
import fs from "node:fs";
import path from "node:path";

export class LedgerStore {
  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "", "utf8");
    }
  }

  /** Append a ledger row; always writes an explicit `type` (default `payment`). */
  append(event: LedgerEvent): void {
    const normalized =
      normalizeLedgerEvent({
        ...event,
        type: event.type ?? DEFAULT_LEDGER_EVENT_TYPE,
      }) ?? ({ ...event, type: DEFAULT_LEDGER_EVENT_TYPE } as LedgerEvent);
    const line = JSON.stringify(normalized);
    fs.appendFileSync(this.filePath, line + "\n", "utf8");
  }

  readAll(): LedgerEvent[] {
    const raw = fs.readFileSync(this.filePath, "utf8");
    return parseLedgerJsonl(raw);
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
