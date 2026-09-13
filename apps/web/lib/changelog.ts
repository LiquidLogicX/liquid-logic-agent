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
