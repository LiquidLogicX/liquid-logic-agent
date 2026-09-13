import fs from "node:fs";
import path from "node:path";
import {
  basescanTxUrl,
  isPaymentEvent,
  type LedgerEvent,
  type PaymentEvent,
} from "@liquid-logic/shared";

export interface SpendSummary {
  walletAddress: string;
  network: "eip155:8453";
  asset: "USDC";
  source: "public_ledger";
  paymentCount: number;
  totalUsdc: number;
  destinations: Array<{
    endpoint: string;
    count: number;
    totalUsdc: number;
    examples: Array<{ amountUsdc: string; txHash?: string; basescanUrl?: string; timestamp: string }>;
  }>;
  recent: Array<{
    endpoint: string;
    amountUsdc: string;
    txHash?: string;
    basescanUrl?: string;
    timestamp: string;
    reason?: string;
  }>;
  note: string;
}

function readLedgerEvents(): LedgerEvent[] {
  const candidates = [
    process.env.LEDGER_PUBLIC_DIR,
    path.join(process.cwd(), "../../public/ledger"),
    path.join(process.cwd(), "public/ledger"),
    path.join(process.cwd(), "../../../public/ledger"),
  ].filter(Boolean) as string[];

  // Prefer latest.json + day files; also accept raw JSONL if present
  for (const dir of candidates) {
    const latestPath = path.join(dir, "latest.json");
    if (fs.existsSync(latestPath)) {
      try {
        const latest = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
          recentPayments?: PaymentEvent[];
          days?: string[];
        };
        const events: LedgerEvent[] = [...(latest.recentPayments ?? [])];
        for (const day of latest.days ?? []) {
          const dayPath = path.join(dir, `${day}.json`);
          if (!fs.existsSync(dayPath)) continue;
          const dayDoc = JSON.parse(fs.readFileSync(dayPath, "utf8")) as {
            events?: LedgerEvent[];
          };
          events.push(...(dayDoc.events ?? []));
        }
        return events;
      } catch {
        /* try next */
      }
    }
  }

  const jsonlCandidates = [
    process.env.LEDGER_JSONL_PATH,
    path.join(process.cwd(), "../../data/ledger.jsonl"),
    path.join(process.cwd(), "data/ledger.jsonl"),
  ].filter(Boolean) as string[];

  for (const p of jsonlCandidates) {
    if (!fs.existsSync(p)) continue;
    const events: LedgerEvent[] = [];
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        events.push(JSON.parse(t) as LedgerEvent);
      } catch {
        /* skip */
      }
    }
    return events;
  }

  return [];
}

export function buildSpendSummary(walletAddress: string): SpendSummary {
  const addr = walletAddress.toLowerCase();
  const events = readLedgerEvents();
  const payments = events.filter(isPaymentEvent).filter((p) => {
    if (!p.walletAddress) return true; // include unscoped ledger rows
    return p.walletAddress.toLowerCase() === addr;
  });

  const byEndpoint = new Map<string, PaymentEvent[]>();
  for (const p of payments) {
    const list = byEndpoint.get(p.endpoint) ?? [];
    list.push(p);
    byEndpoint.set(p.endpoint, list);
  }

  const destinations = [...byEndpoint.entries()].map(([endpoint, list]) => ({
    endpoint,
    count: list.length,
    totalUsdc: list.reduce((s, x) => s + Number(x.amountUsdc || 0), 0),
    examples: list.slice(-5).map((x) => ({
      amountUsdc: x.amountUsdc,
      txHash: x.txHash,
      basescanUrl: x.txHash ? basescanTxUrl(x.txHash) : x.basescanUrl,
      timestamp: x.timestamp,
    })),
  }));

  return {
    walletAddress,
    network: "eip155:8453",
    asset: "USDC",
    source: "public_ledger",
    paymentCount: payments.length,
    totalUsdc: payments.reduce((s, p) => s + Number(p.amountUsdc || 0), 0),
    destinations,
    recent: payments.slice(-25).map((p) => ({
      endpoint: p.endpoint,
      amountUsdc: p.amountUsdc,
      txHash: p.txHash,
      basescanUrl: p.txHash ? basescanTxUrl(p.txHash) : p.basescanUrl,
      timestamp: p.timestamp,
      reason: p.reason,
    })),
    note: "Operating spend for x402 services (USDC on Base). Not a portfolio or growth report.",
  };
}
