/**
 * Publish-time payment labels.
 *
 * data/ledger.jsonl is append-only, so labels are derived when publishing
 * instead of rewriting rows:
 *   1. an explicit per-tx override from ledger-labels.json (keyed by exact tx hash)
 *   2. a `label` already carried by the row (e.g. set by chain-sync on append)
 *   3. rule: payer (`walletAddress`) == treasurer → "self-test"
 *
 * The rule runs on every publish, so future treasurer payments get labeled no
 * matter which writer appended them (chain-sync, paid-*-call scripts, treasurer
 * disk sync).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPaymentEvent, TREASURER_WALLET_ADDRESS, type LedgerEvent } from "@liquid-logic/shared";

export const SELF_TEST_LABEL = "self-test";

export type LabelOverrides = Map<string, string>; // lowercase tx hash → label

export const DEFAULT_LABELS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../ledger-labels.json",
);

export function isTreasurer(addr: string | undefined, treasurer: string = TREASURER_WALLET_ADDRESS): boolean {
  return Boolean(addr) && addr!.trim().toLowerCase() === treasurer.toLowerCase();
}

export function parseLabelOverrides(json: unknown): LabelOverrides {
  const out: LabelOverrides = new Map();
  const labels = (json as { labels?: Record<string, unknown> } | null)?.labels ?? {};
  for (const [tx, v] of Object.entries(labels)) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) throw new Error(`ledger-labels: bad tx hash key ${tx}`);
    const label = typeof v === "string" ? v : (v as { label?: unknown })?.label;
    if (typeof label !== "string" || !label.trim()) throw new Error(`ledger-labels: missing label for ${tx}`);
    out.set(tx.toLowerCase(), label.trim());
  }
  return out;
}

export function loadLabelOverrides(filePath: string = DEFAULT_LABELS_PATH): LabelOverrides {
  if (!fs.existsSync(filePath)) return new Map();
  return parseLabelOverrides(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

/** Label for one row, or undefined. Only `payment` rows are labeled. */
export function labelFor(e: LedgerEvent, overrides: LabelOverrides = new Map()): string | undefined {
  if (!isPaymentEvent(e)) return undefined;
  const tx = e.txHash?.toLowerCase();
  if (tx && overrides.has(tx)) return overrides.get(tx);
  if (typeof e.label === "string" && e.label.trim()) return e.label.trim();
  if (isTreasurer(e.walletAddress)) return SELF_TEST_LABEL;
  return undefined;
}

/** Returns a new row with `label` set when a label applies (input untouched). */
export function withLabel<E extends LedgerEvent>(e: E, overrides: LabelOverrides = new Map()): E {
  const label = labelFor(e, overrides);
  return label ? ({ ...e, label } as E) : e;
}

export function applyLabels(events: LedgerEvent[], overrides: LabelOverrides = new Map()): LedgerEvent[] {
  return events.map((e) => withLabel(e, overrides));
}
