/**
 * Long-running worker process for Render Starter.
 * - Periodic ledger sync → GitHub
 * - Operator HTTP: POST /api/freeze | /api/unfreeze (Bearer LLX_OPERATOR_TOKEN)
 * Payments via CLI / one-off jobs; pay() honors freeze state from the ledger.
 */
import { loadConfig } from "./lib/config.js";
import { startOperatorHttpServer } from "./lib/http-api.js";
import {
  loadLedgerSyncConfigFromEnv,
  syncLedgerToGitHub,
} from "./lib/sync-ledger-github.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function runSync(label: string): Promise<void> {
  try {
    const config = loadConfig();
    const syncCfg = loadLedgerSyncConfigFromEnv(config.ledgerPath);
    if (!syncCfg) {
      if (label === "startup") {
        console.log(
          "[treasurer] ledger sync disabled (set LEDGER_SYNC_GITHUB_TOKEN to enable)",
        );
      }
      return;
    }
    const result = await syncLedgerToGitHub(syncCfg);
    console.log(`[treasurer] ledger sync (${label}):`, result.message);
  } catch (err) {
    console.error(
      `[treasurer] ledger sync (${label}) failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

console.log(
  "[treasurer] worker up — CLI: node dist/cli/index.js <command>. USDC/x402 on Base only.",
);

const config = loadConfig();
startOperatorHttpServer({ config });

const intervalMs = Number(
  process.env.LEDGER_SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
);

void runSync("startup");
setInterval(() => {
  void runSync("schedule");
}, Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : DEFAULT_INTERVAL_MS);
