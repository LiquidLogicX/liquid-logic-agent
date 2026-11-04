/**
 * Base finality for /api/prove. Matches the arc-settlement-recorder gate
 * (settlement-proofs-arc `assessBaseSettlement`):
 *
 * settled when (age >= 60s OR blockNumber <= safe head) AND confirmations >= 300.
 *
 * The safe head block itself counts (`<=`). A missing safe head never counts
 * as settled. Time is preferred when both rules would pass.
 */
import { MIN_BASE_CONFIRMATIONS, MIN_BASE_SETTLEMENT_SECONDS } from "./config";

export type BaseFinalityInput = {
  blockNumber: bigint;
  blockTimestamp: bigint;
  /** Latest chain head number. */
  head: bigint;
  /** Timestamp of `head`, in seconds. Chain time, not the server clock. */
  headTimestamp: bigint;
  /**
   * Block number of the `safe` tag (L1-safe head), or null when that tag
   * could not be read. Null never counts as settled.
   */
  safeHead: bigint | null;
  /** Defaults to {@link MIN_BASE_CONFIRMATIONS}. `0` disables the floor. */
  minConfirmations?: number;
  /** Defaults to {@link MIN_BASE_SETTLEMENT_SECONDS}. */
  minSeconds?: number;
};

export type BaseFinalityDecision =
  | { settled: true; confirmations: bigint; via: "time" | "l1-safe" }
  | { settled: false; confirmations: bigint; retryAfterSeconds: number; message: string };

const RETRY_CAP_SECONDS = 86_400;

export function assessBaseFinality(input: BaseFinalityInput): BaseFinalityDecision {
  const minSeconds = input.minSeconds ?? MIN_BASE_SETTLEMENT_SECONDS;
  const floorN = input.minConfirmations ?? MIN_BASE_CONFIRMATIONS;
  const floor = floorN > 0 ? BigInt(floorN) : 0n;
  const confirmations = input.head - input.blockNumber + 1n;

  if (input.blockNumber > input.head || confirmations < 1n) {
    return {
      settled: false,
      confirmations,
      retryAfterSeconds: minSeconds,
      message: `Base transaction block ${input.blockNumber} is ahead of chain head ${input.head}`,
    };
  }

  const age = input.headTimestamp - input.blockTimestamp;
  const aged = age >= BigInt(minSeconds);
  // `<=` so a payment in the safe head block counts.
  const behindSafe = input.safeHead !== null && input.blockNumber <= input.safeHead;
  const floorMet = confirmations >= floor;

  if ((aged || behindSafe) && floorMet) {
    return { settled: true, confirmations, via: aged ? "time" : "l1-safe" };
  }

  const reasons: string[] = [];
  if (!aged && !behindSafe) reasons.push(settlementWaitMessage(age, minSeconds, input));
  if (!floorMet) {
    reasons.push(`Base transaction has ${confirmations} confirmation(s); need at least ${floor}`);
  }
  return {
    settled: false,
    confirmations,
    retryAfterSeconds: retryAfterSeconds({ age, confirmations, minSeconds, floor, behindSafe }),
    message: reasons.join(". "),
  };
}

function settlementWaitMessage(age: bigint, minSeconds: number, input: BaseFinalityInput): string {
  const ageText =
    age < 0n
      ? `Base transaction block timestamp is ${-age}s ahead of the chain head (need at least ${minSeconds}s of age)`
      : `Base transaction is ${age}s old (need at least ${minSeconds}s)`;
  const safeText =
    input.safeHead === null
      ? "the L1-safe head is unavailable"
      : `block ${input.blockNumber} is not at or behind the L1-safe head ${input.safeHead}`;
  return `${ageText} and ${safeText}`;
}

/**
 * Seconds a caller should wait before retrying.
 * Uses the chain-time gap to 60s, and — when the 300-block floor is what
 * is still missing — the cadence already observed between the payment block
 * and the head. It does not assume a 2s block.
 */
export function retryAfterSeconds(args: {
  age: bigint;
  confirmations: bigint;
  minSeconds: number;
  floor: bigint;
  behindSafe: boolean;
}): number {
  let wait = 0;
  if (!args.behindSafe) {
    if (args.age < 0n) wait = args.minSeconds;
    else if (args.age < BigInt(args.minSeconds)) wait = Number(BigInt(args.minSeconds) - args.age);
  }
  if (args.floor > 0n && args.confirmations < args.floor) {
    const missing = args.floor - args.confirmations;
    const produced = args.confirmations > 1n ? args.confirmations - 1n : 0n;
    let blockWait: number;
    if (produced > 0n && args.age > 0n) {
      // ceil(missing * age / produced) in integer math.
      blockWait = Number((missing * args.age + produced - 1n) / produced);
    } else {
      // No observed interval yet. Post-Denim blocks are 200ms (5 per second),
      // so this hint matches the 60s / 300-block floor without using 2s.
      blockWait = Math.ceil(Number(missing) / 5);
    }
    if (blockWait > wait) wait = blockWait;
  }
  if (!Number.isFinite(wait) || wait < 1) return 1;
  if (wait > RETRY_CAP_SECONDS) return RETRY_CAP_SECONDS;
  return Math.ceil(wait);
}
