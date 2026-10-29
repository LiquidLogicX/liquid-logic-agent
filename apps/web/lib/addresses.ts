import { LLX_CONTRACT } from "./site";

/** Official Liquid Logic X addresses. Static list, verified on-chain before publishing. */
export type OfficialAddress = {
  name: string;
  address: `0x${string}`;
  purpose: string;
  /** Explorer link for the address (Basescan unless the contract is not on Base). */
  explorer: { label: string; href: string };
  /** Extra per-chain explorer links (Liquid X-Lock Factory V2). */
  chains?: { label: string; href: string }[];
  /** Optional related link (e.g. the Liquid X-Lock lock page). */
  related?: { label: string; href: string };
};

export const ADDRESSES_TITLE = "Official Liquid Logic X addresses";
export const ADDRESSES_FOOTER = "If an address is not on this page, it is not ours.";

const basescan = (a: string) => `https://basescan.org/address/${a}`;

export const XLOCK_V2 = "0x54b3019acBBf9aeFDc545d5CeA75e10322eA9D44" as const;

export const OFFICIAL_ADDRESSES: OfficialAddress[] = [
  {
    name: "$LLX V1 token (original)",
    address: LLX_CONTRACT as `0x${string}`,
    purpose: "Original token contract, launched on Virtuals. Being replaced by $LLX V2.",
    explorer: { label: "Basescan", href: basescan(LLX_CONTRACT) },
  },
  {
    name: "Liquid X-Lock Factory (Base, V1)",
    address: "0xD47326d2B5822355D9c4dfF5265849a5bb5D20ec",
    purpose: "Creates Liquid X-Lock token locks on Base.",
    explorer: { label: "Basescan", href: basescan("0xD47326d2B5822355D9c4dfF5265849a5bb5D20ec") },
  },
  {
    name: "Liquid X-Lock Factory V2 (all other chains)",
    address: XLOCK_V2,
    purpose:
      "Creates Liquid X-Lock token locks. Same address on BNB, Ethereum, Arbitrum, Polygon, Avalanche, Optimism, Arc, Tempo, Robinhood Chain and XRPL EVM. Not deployed on Base.",
    explorer: { label: "Etherscan", href: `https://etherscan.io/address/${XLOCK_V2}` },
    chains: [
      { label: "BNB", href: `https://bscscan.com/address/${XLOCK_V2}` },
      { label: "Ethereum", href: `https://etherscan.io/address/${XLOCK_V2}` },
      { label: "Arbitrum", href: `https://arbiscan.io/address/${XLOCK_V2}` },
      { label: "Polygon", href: `https://polygonscan.com/address/${XLOCK_V2}` },
      { label: "Avalanche", href: `https://snowtrace.io/address/${XLOCK_V2}` },
      { label: "Optimism", href: `https://optimistic.etherscan.io/address/${XLOCK_V2}` },
      { label: "Arc", href: `https://arc.etherscan.io/address/${XLOCK_V2}` },
      { label: "Tempo", href: `https://explore.tempo.xyz/address/${XLOCK_V2}` },
      { label: "Robinhood Chain", href: `https://robin.etherscan.io/address/${XLOCK_V2}` },
      { label: "XRPL EVM", href: `https://explorer.xrplevm.org/address/${XLOCK_V2}` },
    ],
  },
  {
    name: "Partnerships",
    address: "0x33e3c3f9c92f2045e1d3928599737e47a9d0dd8b",
    purpose: "V1 partnerships allocation. 200M $LLX V1 locked in Liquid X-Lock #1 until Jan 13, 2027.",
    explorer: { label: "Basescan", href: basescan("0x33e3c3f9c92f2045e1d3928599737e47a9d0dd8b") },
    related: { label: "Liquid X-Lock #1", href: "https://xlock.liquidlogicx.com/lock/1" },
  },
  {
    name: "Team",
    address: "0x95672ca9b03b7d07c9efc1f7d71fe137c748ecdc",
    purpose: "Team operations. The LLX airdrop was sent from here.",
    explorer: { label: "Basescan", href: basescan("0x95672ca9b03b7d07c9efc1f7d71fe137c748ecdc") },
  },
  {
    name: "Liquid X-Lock Fees",
    address: "0x8e351267f713e8fa21befd4aad2ed4ae4146cb38",
    purpose: "Receives Liquid X-Lock fees (fee recipient on every Liquid X-Lock factory).",
    explorer: { label: "Basescan", href: basescan("0x8e351267f713e8fa21befd4aad2ed4ae4146cb38") },
  },
  {
    name: "Liquid X-Lock Owner",
    address: "0x931b89e025beb0b4243faa63c70e8d64c43bc9b8",
    purpose: "Owner of every Liquid X-Lock factory. It has no function that can touch locked tokens.",
    explorer: { label: "Basescan", href: basescan("0x931b89e025beb0b4243faa63c70e8d64c43bc9b8") },
  },
];
