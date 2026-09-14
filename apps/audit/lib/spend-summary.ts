import fs from "node:fs";
import path from "node:path";
import {
  atomicToUsdc,
  basescanTxUrl,
  isPaymentEvent,
  mergeLedgerEvents,
  parseLedgerJsonl,
  resourceEndpoint,
  usdcToAtomic,
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

export const AUDIT_SPEND_NOTE =
  "Operating spend for x402 services (USDC on Base). Not a portfolio or growth report.";

const DEFAULT_LEDGER_REMOTE = "https://liquidlogicx.com";

function sumUsdc(list: Array<{ amountUsdc: string }>): number {
  const atomic = list.reduce((s, x) => {
    try {
      return s + usdcToAtomic(x.amountUsdc);
    } catch {
      return s;
    }
  }, 0n);
  return Number(atomicToUsdc(atomic));
}

function readPublishedDir(dir: string): LedgerEvent[] {
  const latestPath = path.join(dir, "latest.json");
  if (!fs.existsSync(latestPath)) return [];
  try {
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
      recentPayments?: PaymentEvent[];
      days?: string[];
    };
    const dayEvents: LedgerEvent[] = [];
    for (const day of latest.days ?? []) {
      const dayPath = path.join(dir, `${day}.json`);
      if (!fs.existsSync(dayPath)) continue;
      const dayDoc = JSON.parse(fs.readFileSync(dayPath, "utf8")) as {
        events?: LedgerEvent[];
      };
      dayEvents.push(...(dayDoc.events ?? []));
    }
    // recentPayments only fills gaps (missing day files) — do not double-count
    return mergeLedgerEvents(dayEvents, latest.recentPayments ?? []);
  } catch {
    return [];
  }
}

export function readLocalLedgerEvents(): LedgerEvent[] {
  const dirCandidates = [
    process.env.LEDGER_PUBLIC_DIR,
    path.join(process.cwd(), "public/ledger"),
    path.join(process.cwd(), "../../public/ledger"),
    path.join(process.cwd(), "../../../public/ledger"),
    path.join(process.cwd(), "../../apps/web/public/ledger"),
  ].filter(Boolean) as string[];

  const fromDirs: LedgerEvent[] = [];
  for (const dir of dirCandidates) {
    fromDirs.push(...readPublishedDir(dir));
  }

  const jsonlCandidates = [
    process.env.LEDGER_JSONL_PATH,
    path.join(process.cwd(), "../../data/ledger.jsonl"),
    path.join(process.cwd(), "data/ledger.jsonl"),
  ].filter(Boolean) as string[];

  const fromJsonl: LedgerEvent[] = [];
  for (const p of jsonlCandidates) {
    if (!fs.existsSync(p)) continue;
    fromJsonl.push(...parseLedgerJsonl(fs.readFileSync(p, "utf8")));
  }

  return mergeLedgerEvents(fromDirs, fromJsonl);
}

function ledgerRemoteBase(): string | null {
  if (process.env.LEDGER_SKIP_REMOTE === "1") return null;
  const raw = process.env.LEDGER_REMOTE_BASE_URL ?? process.env.NEXT_PUBLIC_LEDGER_BASE_URL;
  if (raw === "") return null;
  return (raw ?? DEFAULT_LEDGER_REMOTE).replace(/\/$/, "");
}

export async function readRemoteLedgerEvents(): Promise<LedgerEvent[]> {
  const base = ledgerRemoteBase();
  if (!base) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4_000);
  try {
    const latestRes = await fetch(`${base}/ledger/latest.json`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!latestRes.ok) return [];
    const latest = (await latestRes.json()) as {
      recentPayments?: PaymentEvent[];
      days?: string[];
    };
    const dayLists: LedgerEvent[][] = [];
    for (const day of latest.days ?? []) {
      try {
        const dayRes = await fetch(`${base}/ledger/${day}.json`, {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });
        if (!dayRes.ok) continue;
        const dayDoc = (await dayRes.json()) as { events?: LedgerEvent[] };
        dayLists.push(dayDoc.events ?? []);
      } catch {
        /* skip day */
      }
    }
    return mergeLedgerEvents(...dayLists, latest.recentPayments ?? []);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function loadLedgerEvents(
  extras: LedgerEvent[] = [],
): Promise<LedgerEvent[]> {
  const [local, remote] = await Promise.all([
    Promise.resolve(readLocalLedgerEvents()),
    readRemoteLedgerEvents(),
  ]);
  return mergeLedgerEvents(remote, local, extras);
}

export function buildSpendSummary(
  walletAddress: string,
  events: LedgerEvent[],
): SpendSummary {
  const addr = walletAddress.toLowerCase();
  const payments = events.filter(isPaymentEvent).filter((p) => {
    if (!p.walletAddress) return true;
    return p.walletAddress.toLowerCase() === addr;
  });

  const byEndpoint = new Map<string, PaymentEvent[]>();
  for (const p of payments) {
    const endpoint = resourceEndpoint(p.endpoint);
    const list = byEndpoint.get(endpoint) ?? [];
    list.push({ ...p, endpoint });
    byEndpoint.set(endpoint, list);
  }

  const destinations = [...byEndpoint.entries()].map(([endpoint, list]) => ({
    endpoint,
    count: list.length,
    totalUsdc: sumUsdc(list),
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
    totalUsdc: sumUsdc(payments),
    destinations,
    recent: payments.slice(-25).map((p) => ({
      endpoint: resourceEndpoint(p.endpoint),
      amountUsdc: p.amountUsdc,
      txHash: p.txHash,
      basescanUrl: p.txHash ? basescanTxUrl(p.txHash) : p.basescanUrl,
      timestamp: p.timestamp,
      reason: p.reason,
    })),
    note: AUDIT_SPEND_NOTE,
  };
}
