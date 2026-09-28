import {
  evaluateAllowance,
  treasurerPolicyFromEnv,
  type AllowanceReport,
  type LedgerEvent,
  type TreasurerPolicy,
} from "@liquid-logic/shared";
import { loadLedgerEvents } from "./spend-summary";

export type { AllowanceReport };

export function loadPublishedPolicy(
  env: NodeJS.ProcessEnv = process.env,
): TreasurerPolicy {
  return treasurerPolicyFromEnv(env, { allowlistFallback: true });
}

export async function buildAllowance(opts: {
  walletAddress: string;
  endpoint?: string | null;
  amountUsdc?: string | null;
  extras?: LedgerEvent[];
  now?: Date;
}): Promise<AllowanceReport> {
  const policy = loadPublishedPolicy();
  const events = await loadLedgerEvents(opts.extras ?? []);
  return evaluateAllowance({
    policy,
    events,
    walletAddress: opts.walletAddress,
    endpoint: opts.endpoint,
    amountUsdc: opts.amountUsdc,
    now: opts.now,
  });
}
