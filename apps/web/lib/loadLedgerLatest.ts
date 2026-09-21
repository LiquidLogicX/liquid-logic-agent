import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LedgerLatest } from "./ledger";

/** Server-only: read published public/ledger/latest.json for SSR first paint. */
export async function loadLedgerLatestFromPublic(): Promise<LedgerLatest | null> {
  try {
    const file = path.join(process.cwd(), "public", "ledger", "latest.json");
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as LedgerLatest;
  } catch {
    return null;
  }
}
