#!/usr/bin/env node
/**
 * Liquid Logic Treasurer CLI
 * Commands: set-allowance | top-up | revoke | pay <url> | print-wallet-address
 *
 * Pays USDC on Base to allowlisted x402 endpoints only.
 * Development: set CDP_X402_ENVIRONMENT=development for Base Sepolia.
 */
import "dotenv/config";
import { basescanTxUrl } from "@liquid-logic/shared";
import { loadConfig } from "../lib/config.js";
import { getWalletAddress, payEndpoint } from "../lib/client.js";
import { LedgerStore } from "../lib/ledger-store.js";
import { refuseNonUsdcSwap } from "../lib/usdc-guard.js";
import {
  loadLedgerSyncConfigFromEnv,
  syncLedgerToGitHub,
} from "../lib/sync-ledger-github.js";

function usage(): never {
  console.log(`Usage:
  ll-treasurer set-allowance [--max <usdc>] [--daily <usdc>] [--allowlist url,url]
  ll-treasurer top-up <amountUsdc> [--tx <hash>] [--reason <text>]
  ll-treasurer revoke [--reason <text>]
  ll-treasurer pay <url> [--amount <usdc>] [--reason <text>]
  ll-treasurer record-payment --endpoint <url> --amount <usdc> --tx <hash> [--wallet 0x…] [--reason <text>] [--timestamp <iso>]
  ll-treasurer print-wallet-address
  ll-treasurer sync-ledger
  ll-treasurer dump-ledger

Guardrails: USDC on Base only; allowlist + max/payment + daily cap enforced.
Never swap/buy non-USDC. Social posts are human-only (see drafts/social/).
`);
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}


async function maybeSyncLedger(ledgerPath: string): Promise<void> {
  const syncCfg = loadLedgerSyncConfigFromEnv(ledgerPath);
  if (!syncCfg) return;
  const result = await syncLedgerToGitHub(syncCfg);
  console.error(`[treasurer] ${result.message}`);
  if (!result.ok) throw new Error(result.message);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd) usage();

  // Tripwire: any accidental "swap" subcommand hard-fails.
  if (cmd === "swap" || cmd === "buy" || cmd === "trade") {
    refuseNonUsdcSwap({ cmd });
  }

  const config = loadConfig();
  const ledger = new LedgerStore(config.ledgerPath);

  switch (cmd) {
    case "set-allowance": {
      const max = flag(rest, "--max") ?? config.maxPerPaymentUsdc;
      const daily = flag(rest, "--daily") ?? config.dailyCapUsdc;
      const listRaw = flag(rest, "--allowlist");
      const allowlist = listRaw
        ? listRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : config.allowlist;

      ledger.append({
        type: "allowance_set",
        timestamp: new Date().toISOString(),
        maxPerPaymentUsdc: max,
        dailyCapUsdc: daily,
        allowlist,
        reason:
          "Recorded operating spend limits (env TREASURER_* still authoritative at runtime)",
      });

      console.log(
        JSON.stringify(
          {
            ok: true,
            maxPerPaymentUsdc: max,
            dailyCapUsdc: daily,
            allowlist,
            network: config.network,
            note: "Persist allowlist/caps via env (TREASURER_ALLOWLIST, TREASURER_MAX_PER_PAYMENT_USDC, TREASURER_DAILY_CAP_USDC).",
          },
          null,
          2,
        ),
      );
      break;
    }

    case "top-up": {
      const amount = rest[0];
      if (!amount || amount.startsWith("--")) {
        console.error("top-up requires <amountUsdc>");
        usage();
      }
      const tx = flag(rest, "--tx");
      const reason = flag(rest, "--reason") ?? "USDC top-up for operating spend";
      ledger.append({
        type: "top_up",
        timestamp: new Date().toISOString(),
        amountUsdc: amount,
        txHash: tx,
        basescanUrl: tx ? basescanTxUrl(tx) : undefined,
        reason,
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            amountUsdc: amount,
            txHash: tx,
            basescanUrl: tx ? basescanTxUrl(tx) : undefined,
            note: "Send Base USDC to the CDP wallet from print-wallet-address; record the funding tx here.",
          },
          null,
          2,
        ),
      );
      break;
    }

    case "revoke": {
      const reason =
        flag(rest, "--reason") ??
        "Revoke autonomous spend — clear allowlist / stop payments";
      ledger.append({
        type: "revocation",
        timestamp: new Date().toISOString(),
        detail: reason,
        reason,
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            revoked: true,
            action:
              "Set TREASURER_ALLOWLIST empty and/or TREASURER_DAILY_CAP_USDC=0, then redeploy.",
          },
          null,
          2,
        ),
      );
      break;
    }

    case "pay": {
      const url = rest[0];
      if (!url || url.startsWith("--")) {
        console.error("pay requires <url>");
        usage();
      }
      const amount = flag(rest, "--amount");
      const reason = flag(rest, "--reason");
      const result = await payEndpoint({
        config,
        ledger,
        url,
        reason,
        maxAmountHintUsdc: amount,
      });
      console.log(
        JSON.stringify(
          {
            ok: result.status >= 200 && result.status < 300,
            status: result.status,
            walletAddress: result.walletAddress,
            txHash: result.txHash,
            basescanUrl: result.txHash ? basescanTxUrl(result.txHash) : undefined,
            bodyPreview: result.body.slice(0, 500),
          },
          null,
          2,
        ),
      );
      if (result.status >= 400) process.exit(2);
      await maybeSyncLedger(config.ledgerPath);
      break;
    }


    case "record-payment": {
      const endpoint = flag(rest, "--endpoint") ?? rest[0];
      const amount = flag(rest, "--amount");
      const tx = flag(rest, "--tx");
      const wallet = flag(rest, "--wallet");
      const reason = flag(rest, "--reason") ?? "x402 service payment";
      const timestamp = flag(rest, "--timestamp");
      if (!endpoint || !amount || !tx) {
        console.error("record-payment requires --endpoint --amount --tx");
        usage();
      }
      const added = ledger.recordPayment({
        endpoint,
        amountUsdc: amount,
        network: config.network,
        txHash: tx,
        walletAddress: wallet,
        reason,
        timestamp,
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            added,
            endpoint,
            amountUsdc: amount,
            txHash: tx,
            basescanUrl: basescanTxUrl(tx),
          },
          null,
          2,
        ),
      );
      if (added) await maybeSyncLedger(config.ledgerPath);
      break;
    }

    case "dump-ledger": {
      const raw = ledger.readAll();
      for (const e of raw) console.log(JSON.stringify(e));
      console.error(`events=${raw.length} path=${config.ledgerPath}`);
      break;
    }

    case "sync-ledger": {
      const syncCfg = loadLedgerSyncConfigFromEnv(config.ledgerPath);
      if (!syncCfg) {
        console.error("Set LEDGER_SYNC_GITHUB_TOKEN (and optional LEDGER_SYNC_REPO)");
        process.exit(2);
      }
      const result = await syncLedgerToGitHub(syncCfg);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(2);
      break;
    }

    case "print-wallet-address": {
      const address = await getWalletAddress(config);
      ledger.append({
        type: "wallet_address",
        timestamp: new Date().toISOString(),
        walletAddress: address,
        reason: "CDP-managed x402 payer address",
      });
      console.log(address);
      console.error(
        `Network: ${config.network} (${config.environment === "development" ? "Base Sepolia — development" : "Base mainnet"})`,
      );
      console.error(`Fund with USDC only. BaseScan: https://basescan.org/address/${address}`);
      break;
    }

    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
