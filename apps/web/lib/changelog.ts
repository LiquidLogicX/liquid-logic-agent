export type ChangelogEntry = {
  date: string; // YYYY-MM-DD
  title: string;
  detail: string;
  href: string;
  hrefLabel: string;
};

/** Backward-looking only. Every link must resolve to a real commit, PR, or tx. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-09-14",
    title: "Hold threshold + approve/deny/expire",
    detail:
      "Payments at/above HOLD_ABOVE_USDC write held and wait for phone-reachable Bearer approve/deny, or mandatory TTL auto-deny (expired). Treasurer is a public Render web service for operator HTTPS.",
    href: "https://github.com/LiquidLogicX/liquid-logic-agent/pull/27",
    hrefLabel: "PR #27",
  },
  {
    date: "2026-09-14",
    title: "Operator freeze / unfreeze",
    detail:
      "Treasurer POST /api/freeze and /api/unfreeze (Bearer LLX_OPERATOR_TOKEN) halt and resume all outbound payments. Freeze state persists in the ledger across restarts; pay() fails closed while frozen.",
    href: "https://github.com/LiquidLogicX/liquid-logic-agent/pull/26",
    hrefLabel: "PR #26",
  },
  {
    date: "2026-09-14",
    title: "Ledger event type field (payment default)",
    detail:
      "Ledger writes always include an explicit type, defaulting to payment. Reserved held/denied/expired/frozen/unfrozen for takeover; audit spend still counts only payment (or missing type).",
    href: "https://github.com/LiquidLogicX/liquid-logic-agent/pull/25",
    hrefLabel: "PR #25",
  },
  {
    date: "2026-09-14",
    title: "Allowance pre-flight endpoint",
    detail:
      "Agents can pay $0.001 USDC to ask whether the treasurer wallet may pay an x402 URL and how much remains under the UTC daily cap — before spending $0.05 on a full audit.",
    href: "https://github.com/LiquidLogicX/liquid-logic-agent/pull/24",
    hrefLabel: "PR #24",
  },
  {
    date: "2026-09-14",
    title: "Ledger union sync + audit settlements",
    detail:
      "Treasurer GitHub sync now unions events instead of replacing the file, restoring wiped Task A spend and recording live $0.05 audit settlements.",
    href: "https://basescan.org/tx/0x465910619fb6ba1fa3106b911098d435d4900e0bf2bce05b35f3c7e077643318",
    hrefLabel: "BaseScan 0x4659…3318",
  },
  {
    date: "2026-09-13",
    title: "Render ledger sync + live Base payment",
    detail:
      "Treasurer pushes /app/data/ledger.jsonl to GitHub on a schedule and after pay.",
    href: "https://basescan.org/tx/0xc0435a64d28df9cc773d13d5e074a5f9764d3c98090e4630c78d86391fce869c",
    hrefLabel: "BaseScan 0xc043…869c",
  },
  {
    date: "2026-09-13",
    title: "Ledger mirrored into apps/web/public",
    detail: "Publish Action copies public/ledger into the Vercel site root so /ledger/latest.json stays live.",
    href: "https://github.com/LiquidLogicX/liquid-logic-agent/pull/5",
    hrefLabel: "PR #5",
  },
  {
    date: "2026-09-13",
    title: "Ledger sync worker",
    detail: "Scheduled GitHub Contents sync from the Render treasurer disk.",
    href: "https://github.com/LiquidLogicX/liquid-logic-agent/pull/4",
    hrefLabel: "PR #4",
  },
  {
    date: "2026-09-13",
    title: "publish-ledger GitHub Action",
    detail: "Cron + path-triggered publisher for public ledger JSON/HTML and social drafts.",
    href: "https://github.com/LiquidLogicX/liquid-logic-agent/pull/3",
    hrefLabel: "PR #3",
  },
  {
    date: "2026-09-13",
    title: "Live Base x402 acceptance payment",
    detail: "Task A: treasurer paid an allowlisted x402 endpoint with USDC on Base mainnet.",
    href: "https://basescan.org/tx/0xacf34818767a8a5a17b4790bb3778af2787b8ea28a06774c3678ec0567293e8e",
    hrefLabel: "BaseScan 0xacf3…3e8e",
  },
  {
    date: "2026-09-13",
    title: "Docker build fix for npm workspaces",
    detail: "Render Starter worker image builds under hoisted node_modules.",
    href: "https://github.com/LiquidLogicX/liquid-logic-agent/pull/1",
    hrefLabel: "PR #1",
  },
];
