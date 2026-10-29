// $LLX V2 tokenomics, roadmap and team, shown on the homepage.
// Supply and allocations confirmed by Miles (Oct 28 2026). Keep in sync with the
// llx-token launch plan: 25,000,000 fixed supply, minted once on Base into the
// 2-of-3 LLX V2 Vault (Safe 0x794A618486dAA4EC6724865E68Fdc79Ae1eecB0B).

export const LLX_V2_TOTAL_SUPPLY = 25_000_000;

export const LLX_V2_CHAINS = [
  "Base",
  "Arc",
  "Robinhood Chain",
  "BNB Chain",
  "Tempo",
  "Hyperliquid",
] as const;

export type Allocation = {
  id: string;
  label: string;
  amount: number;
  release: string;
  color: string;
};

export const LLX_V2_ALLOCATIONS: readonly Allocation[] = [
  {
    id: "treasury",
    label: "Treasury",
    amount: 11_250_000,
    release: "To be locked in PinkLock before the presale. Release starts after 6 months, linear over 36 months.",
    color: "#a89cf0",
  },
  {
    id: "partnerships",
    label: "Partnerships",
    amount: 5_000_000,
    release: "To be locked in PinkLock before the presale, until January 13, 2027.",
    color: "#7b6ce0",
  },
  {
    id: "presale",
    label: "Presale",
    amount: 2_500_000,
    release: "PinkSale presale on BNB Chain. Unlocked when the presale ends.",
    color: "#d9d2ff",
  },
  {
    id: "ecosystem",
    label: "Ecosystem & rewards",
    amount: 1_930_300,
    release: "Held in the LLX V2 Vault (2-of-3 multi-sig).",
    color: "#c48ef0",
  },
  {
    id: "liquidity",
    label: "DEX liquidity",
    amount: 1_500_000,
    release: "Paired at listing. LP tokens locked in PinkLock when the presale finalizes.",
    color: "#5fd1c4",
  },
  {
    id: "team",
    label: "Team",
    amount: 1_250_000,
    release: "To be locked in PinkLock before the presale: 12 months, then linear over 24 months.",
    color: "#e0b060",
  },
  {
    id: "exchange",
    label: "Exchange reserve",
    amount: 1_250_000,
    release: "Held in the LLX V2 Vault for exchange listings.",
    color: "#7fa8f0",
  },
  {
    id: "migration",
    label: "V1 holder migration",
    amount: 319_700,
    release: "Claimable by holders of the original $LLX at the snapshot.",
    color: "#8b93a7",
  },
];

export function allocationPercent(amount: number): string {
  const pct = (amount / LLX_V2_TOTAL_SUPPLY) * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

/** CSS conic-gradient for the allocation donut, in list order. */
export function allocationGradient(): string {
  let start = 0;
  const stops = LLX_V2_ALLOCATIONS.map((a) => {
    const end = start + (a.amount / LLX_V2_TOTAL_SUPPLY) * 360;
    const stop = `${a.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export type RoadmapPhase = {
  period: string;
  items: readonly { text: string; done?: boolean }[];
};

export const LLX_V2_ROADMAP: readonly RoadmapPhase[] = [
  {
    period: "Q4 2026",
    items: [
      { text: "$LLX V2 live on Base, Arc, Robinhood Chain, BNB Chain, Tempo and Hyperliquid", done: true },
      { text: "Cross-chain transfers tested live on every route, both directions", done: true },
      { text: "KYC and PinkSale presale on BNB Chain" },
      { text: "Migration for original $LLX holders" },
      { text: "DEX listing with liquidity locked in PinkLock" },
    ],
  },
  {
    period: "Q1 2027",
    items: [
      { text: "Liquid ZK-Zero private payments on $LLX V2" },
      { text: "Liquid X-Pay mobile app" },
      { text: "CoinGecko and CoinMarketCap listings" },
      { text: "Independent security audit" },
    ],
  },
  {
    period: "Q2 2027",
    items: [
      { text: "cLLX confidential balances" },
      { text: "More chains and partner integrations" },
    ],
  },
];

export const LLX_TEAM = [
  {
    name: "Miles Francisco",
    role: "Founder & CEO, Liquid Logic X LLC",
    bio: "30 years in the car business across sales, finance and sales management, with a computer programming background. Now building private, multichain payments at Liquid Logic X.",
  },
] as const;

export const LLX_V2_WHY = {
  intro:
    "We're moving $LLX to a token Liquid Logic X fully controls, built for private, multichain payments.",
  launchpad: {
    title: "What happened with the launchpad",
    paragraphs: [
      "The original $LLX launched on September 16, 2026 through the Virtuals launchpad on Base. It never completed the launchpad's bonding curve, so it never moved to an open liquidity pool.",
      "Until a token graduates, its liquidity and contract settings stay with the launchpad. That left us unable to add liquidity, manage the pool or bring $LLX to other chains, and our requests to the launchpad team have gone unanswered.",
    ],
  },
  different: {
    title: "Why a different kind of token",
    points: [
      "Owned by Liquid Logic X: the contract and supply are held by our 2-of-3 multi-sig vault, not a launchpad.",
      "Multichain from day one: one token at the same address on Base, Arc, Robinhood Chain, BNB Chain, Tempo and Hyperliquid, moving over LayerZero.",
      "Fixed 25M supply. Treasury, partnership and team tokens will be locked in PinkLock, an independent third-party locker, before the presale.",
      "Built for our products: Liquid ZK-Zero private payments, Liquid X-Pay and Liquid X-Lock fees.",
    ],
  },
  holders: {
    title: "What it means for V1 holders",
    paragraphs: [
      "The snapshot was taken at Base block 53,205,869 on October 28, 2026 (8:24 AM PT). Holders of the original $LLX at that block can migrate to $LLX V2, and 319,700 $LLX V2 is reserved for this. V1 bought after the snapshot does not qualify.",
      "The swap is not 1:1, because V2 has a much smaller supply. The ratio is set from V1's average market price over the 7 days before the snapshot.",
      "The swap ratio and claim steps will be announced on liquidlogicx.com, @LiquidLogicX on X and our official Telegram. Ignore any other swap links.",
    ],
  },
} as const;
