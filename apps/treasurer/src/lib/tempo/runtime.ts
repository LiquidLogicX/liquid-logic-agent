/**
 * Wires the Tempo rail into the treasurer process when TREASURER_TEMPO_ENABLED=true.
 * Returns null (rail off) otherwise; the Base rail never depends on this.
 */
import path from "node:path";
import type { LedgerStore } from "../ledger-store.js";
import { createHttpBridge } from "./bridge.js";
import { createViemTempoChain } from "./chain.js";
import { loadTempoRailConfig, publicTempoConfig, type TempoRailLoadResult } from "./config.js";
import { FlowStore, TempoRail } from "./flows.js";
import { createHttpRecorder } from "./recorder.js";

export type TempoRuntime = {
  status: TempoRailLoadResult;
  rail: TempoRail | null;
  health(): Record<string, unknown>;
};

export function createTempoRuntime(opts: {
  ledger: LedgerStore;
  ledgerPath: string;
  holdTtlSeconds: number;
  env?: NodeJS.ProcessEnv;
}): TempoRuntime {
  const env = opts.env ?? process.env;
  const status = loadTempoRailConfig(env);
  if (!status.enabled) {
    if ((env.TREASURER_TEMPO_ENABLED ?? "").trim() === "true") {
      console.error(`[treasurer] Tempo rail NOT started: ${status.reason}`);
    }
    return {
      status,
      rail: null,
      health: () => ({ enabled: false, reason: status.reason }),
    };
  }
  const cfg = status;
  const flowsPath =
    env.TEMPO_FLOWS_PATH?.trim() || path.join(path.dirname(opts.ledgerPath), "tempo-flows.json");
  const rail = new TempoRail({
    cfg,
    ledger: opts.ledger,
    chain: createViemTempoChain(cfg),
    recorder: createHttpRecorder({ url: cfg.recorderUrl, apiKey: cfg.recorderApiKey }),
    bridge: createHttpBridge({ url: cfg.bridgeUrl, token: cfg.bridgeToken, topic: cfg.bridgeTopic }),
    store: new FlowStore(flowsPath),
    holdTtlSeconds: opts.holdTtlSeconds,
  });
  console.log(
    `[treasurer] Tempo rail ON: ${cfg.networkLabel} (chain ${cfg.chainId}), payer ${cfg.payerAddress}, ` +
      `token ${cfg.tokenSymbol} ${cfg.token}, fee token ${cfg.feeToken}, ` +
      `caps ${publicTempoConfig(cfg).maxPerPaymentUsdc}/payment ${publicTempoConfig(cfg).dailyCapUsdc}/day, ` +
      `hold at/above ${publicTempoConfig(cfg).holdAboveUsdc}`,
  );
  return { status, rail, health: () => publicTempoConfig(cfg) };
}
