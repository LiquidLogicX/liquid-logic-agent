import { assertUsdcOnlyOperation } from "@liquid-logic/shared";
import type { TreasurerConfig } from "./config.js";

/**
 * Hard fail if any code path would swap/buy non-USDC.
 * Export a stub so accidental imports of swap helpers trip this check.
 */
export function refuseNonUsdcSwap(_args: unknown): never {
  throw new Error(
    "GUARDRAIL: swap/buy of non-USDC is forbidden. Treasurer pays USDC to x402 services only.",
  );
}

export function assertPaymentAsset(config: TreasurerConfig, assetAddress?: string): void {
  assertUsdcOnlyOperation({
    assetAddress: assetAddress ?? config.usdcAddress,
    assetSymbol: "USDC",
    intent: "pay x402 endpoint with USDC",
    allowSepolia: config.environment === "development",
  });
}
