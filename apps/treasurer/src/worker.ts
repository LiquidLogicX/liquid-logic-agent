/**
 * Long-running treasurer process for Render (web service).
 * - Operator HTTP (public HTTPS): freeze/unfreeze + hold approve/deny/list
 * - Periodic hold TTL expiry (mandatory auto-deny → ledger type `expired`)
 * - Periodic ledger sync → GitHub
 * Payments via CLI / one-off jobs / hold approve; pay() honors freeze + hold threshold.
 */
import { loadConfig } from "./lib/config.js";
import { startOperatorHttpServer } from "./lib/http-api.js";
import { LedgerStore } from "./lib/ledger-store.js";
import { expireStaleHolds } from "./lib/hold.js";
import {
  loadLedgerSyncConfigFromEnv,
  syncLedgerToGitHub,
} from "./lib/sync-ledger-github.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_HOLD_SWEEP_MS = 30 * 1000; // 30 seconds

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

function runHoldExpirySweep(label: string): void {
  try {
    const config = loadConfig();
    const ledger = new LedgerStore(config.ledgerPath);
    const expired = expireStaleHolds(ledger, config.holdTtlSeconds);
    if (expired.length) {
      console.log(
        `[treasurer] hold TTL sweep (${label}): expired ${expired.length} →`,
        expired.join(", "),
      );
      void runSync(`hold-expire-${label}`);
    }
  } catch (err) {
    console.error(
      `[treasurer] hold TTL sweep (${label}) failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

console.log(
  "[treasurer] worker up — CLI: node dist/cli/index.js <command>. USDC/x402 on Base only.",
);

const config = loadConfig();
console.log(
  `[treasurer] hold config: HOLD_ABOVE_USDC=${config.holdAboveUsdc ?? "(unset — holds off)"} ` +
    `HOLD_TTL_SECONDS=${config.holdTtlSeconds}`,
);
startOperatorHttpServer({ config });

const intervalMs = Number(
  process.env.LEDGER_SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
);
const holdSweepMs = Number(
  process.env.HOLD_SWEEP_INTERVAL_MS ?? DEFAULT_HOLD_SWEEP_MS,
);

void runSync("startup");
runHoldExpirySweep("startup");

setInterval(() => {
  void runSync("schedule");
}, Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : DEFAULT_INTERVAL_MS);

setInterval(
  () => {
    runHoldExpirySweep("schedule");
  },
  Number.isFinite(holdSweepMs) && holdSweepMs >= 5_000
    ? holdSweepMs
    : DEFAULT_HOLD_SWEEP_MS,
);
