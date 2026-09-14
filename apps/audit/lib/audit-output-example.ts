import type { SpendSummary } from "./spend-summary";
import { AUDIT_SPEND_NOTE } from "./spend-summary";

/**
 * Canonical paid /api/audit body for wallet 0xEA24…167D.
 * Sourced from data/ledger.jsonl (on-chain Base USDC only). Must match live.
 */
export const AUDIT_OUTPUT_EXAMPLE: SpendSummary = {
  walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
  network: "eip155:8453",
  asset: "USDC",
  source: "public_ledger",
  paymentCount: 5,
  totalUsdc: 0.103,
  destinations: [
    {
      endpoint: "https://x402uselessfacts.vercel.app/api/useless-fact",
      count: 3,
      totalUsdc: 0.003,
      examples: [
        {
          amountUsdc: "0.001",
          txHash:
            "0x4f940314772fc825f077caa13d36debea8f5dac4843d93e6b8cb740b3d1fb7fe",
          basescanUrl:
            "https://basescan.org/tx/0x4f940314772fc825f077caa13d36debea8f5dac4843d93e6b8cb740b3d1fb7fe",
          timestamp: "2026-09-13T15:23:37.000Z",
        },
        {
          amountUsdc: "0.001",
          txHash:
            "0xacf34818767a8a5a17b4790bb3778af2787b8ea28a06774c3678ec0567293e8e",
          basescanUrl:
            "https://basescan.org/tx/0xacf34818767a8a5a17b4790bb3778af2787b8ea28a06774c3678ec0567293e8e",
          timestamp: "2026-09-13T15:24:39.000Z",
        },
        {
          amountUsdc: "0.001",
          txHash:
            "0xc0435a64d28df9cc773d13d5e074a5f9764d3c98090e4630c78d86391fce869c",
          basescanUrl:
            "https://basescan.org/tx/0xc0435a64d28df9cc773d13d5e074a5f9764d3c98090e4630c78d86391fce869c",
          timestamp: "2026-09-13T20:02:13.000Z",
        },
      ],
    },
    {
      endpoint: "https://liquid-logic-agent-audit.vercel.app/api/audit",
      count: 1,
      totalUsdc: 0.05,
      examples: [
        {
          amountUsdc: "0.05",
          txHash:
            "0x9e69f6d6a0e2b7fe3997733398a6f7986adeb3f64066b421fa38c77d6f051c74",
          basescanUrl:
            "https://basescan.org/tx/0x9e69f6d6a0e2b7fe3997733398a6f7986adeb3f64066b421fa38c77d6f051c74",
          timestamp: "2026-09-13T18:06:49.000Z",
        },
      ],
    },
    {
      endpoint: "https://audit.liquidlogicx.com/api/audit",
      count: 1,
      totalUsdc: 0.05,
      examples: [
        {
          amountUsdc: "0.05",
          txHash:
            "0x465910619fb6ba1fa3106b911098d435d4900e0bf2bce05b35f3c7e077643318",
          basescanUrl:
            "https://basescan.org/tx/0x465910619fb6ba1fa3106b911098d435d4900e0bf2bce05b35f3c7e077643318",
          timestamp: "2026-09-14T00:12:29.000Z",
        },
      ],
    },
  ],
  recent: [
    {
      endpoint: "https://x402uselessfacts.vercel.app/api/useless-fact",
      amountUsdc: "0.001",
      txHash:
        "0x4f940314772fc825f077caa13d36debea8f5dac4843d93e6b8cb740b3d1fb7fe",
      basescanUrl:
        "https://basescan.org/tx/0x4f940314772fc825f077caa13d36debea8f5dac4843d93e6b8cb740b3d1fb7fe",
      timestamp: "2026-09-13T15:23:37.000Z",
      reason: "x402 service payment",
    },
    {
      endpoint: "https://x402uselessfacts.vercel.app/api/useless-fact",
      amountUsdc: "0.001",
      txHash:
        "0xacf34818767a8a5a17b4790bb3778af2787b8ea28a06774c3678ec0567293e8e",
      basescanUrl:
        "https://basescan.org/tx/0xacf34818767a8a5a17b4790bb3778af2787b8ea28a06774c3678ec0567293e8e",
      timestamp: "2026-09-13T15:24:39.000Z",
      reason: "Task A acceptance: Base mainnet x402 USDC pay",
    },
    {
      endpoint: "https://liquid-logic-agent-audit.vercel.app/api/audit",
      amountUsdc: "0.05",
      txHash:
        "0x9e69f6d6a0e2b7fe3997733398a6f7986adeb3f64066b421fa38c77d6f051c74",
      basescanUrl:
        "https://basescan.org/tx/0x9e69f6d6a0e2b7fe3997733398a6f7986adeb3f64066b421fa38c77d6f051c74",
      timestamp: "2026-09-13T18:06:49.000Z",
      reason: "paid audit call",
    },
    {
      endpoint: "https://x402uselessfacts.vercel.app/api/useless-fact",
      amountUsdc: "0.001",
      txHash:
        "0xc0435a64d28df9cc773d13d5e074a5f9764d3c98090e4630c78d86391fce869c",
      basescanUrl:
        "https://basescan.org/tx/0xc0435a64d28df9cc773d13d5e074a5f9764d3c98090e4630c78d86391fce869c",
      timestamp: "2026-09-13T20:02:13.000Z",
      reason: "sync-acceptance",
    },
    {
      endpoint: "https://audit.liquidlogicx.com/api/audit",
      amountUsdc: "0.05",
      txHash:
        "0x465910619fb6ba1fa3106b911098d435d4900e0bf2bce05b35f3c7e077643318",
      basescanUrl:
        "https://basescan.org/tx/0x465910619fb6ba1fa3106b911098d435d4900e0bf2bce05b35f3c7e077643318",
      timestamp: "2026-09-14T00:12:29.000Z",
      reason: "paid audit call",
    },
  ],
  note: AUDIT_SPEND_NOTE,
};
