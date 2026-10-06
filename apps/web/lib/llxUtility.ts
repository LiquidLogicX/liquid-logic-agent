/**
 * $LLX utility — what the token is used for across Liquid Logic X products.
 *
 * Copy rules: describe use only. Never promise price, returns, yield,
 * buybacks or holder profit. Anything not shipped in code stays
 * `status: "coming_soon"` (x402 endpoints accept USDC only today).
 */
export type LlxUtilityStatus = "live" | "coming_soon";

export type LlxUtilityItem = {
  id: string;
  title: string;
  detail: string;
  status: LlxUtilityStatus;
};

export const LLX_UTILITY: LlxUtilityItem[] = [
  {
    id: "x402-proofs-audits",
    title: "Pay for proofs and audits in $LLX",
    detail:
      "Settlement proofs and wallet audits on x402 accept $LLX, priced at a discount to USDC.",
    status: "coming_soon",
  },
  {
    id: "x-lock-fees",
    title: "Pay X-Lock fees in $LLX",
    detail:
      "Pay token lock and vesting fees in $LLX, at a discount to the USDC fee.",
    status: "coming_soon",
  },
  {
    id: "llx-pay-early-access",
    title: "Early access to LLX Pay",
    detail: "$LLX holders get first access to new LLX Pay features.",
    status: "coming_soon",
  },
];

export const LLX_UTILITY_NOTE =
  "Endpoints settle in USDC on Base today. Each $LLX option switches on as it ships.";

export function utilityStatusLabel(status: LlxUtilityStatus): string {
  return status === "live" ? "Live" : "Coming soon";
}
