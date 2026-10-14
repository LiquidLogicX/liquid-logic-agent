/**
 * Official Liquid Logic X addresses, shown on /addresses.
 * Rules: static list only — no wallet connect, no balances, no price.
 * Every address here was checked on-chain before it was added (see the PR).
 * Addresses are stored in EIP-55 checksum form; never edit one by hand.
 * The $LLX token address comes from LLX_CONTRACT in ./site (single source).
 */
import { LLX_CONTRACT, XLOCK_URL } from "./site";

export const ADDRESSES_TITLE = "Official Liquid Logic X addresses";

export const ADDRESSES_LEDE =
  "Every wallet and contract Liquid Logic X uses on Base, in full. Check an address here before you send to it or trust it.";

export const ADDRESSES_DISCLAIMER =
  "If an address is not on this page, it is not ours.";

export const basescanAddress = (addr: string) =>
  `https://basescan.org/address/${addr}`;

export type Explorer = { chain: string; url: string };

export type OfficialAddress = {
  name: string;
  address: string;
  purpose: string;
  /** False when the address has no contract or activity on Base. */
  onBase: boolean;
  link?: { href: string; label: string };
  /** Explorers on other chains where the same address is deployed. */
  explorers?: readonly Explorer[];
};

export const XLOCK_FACTORY_BASE = "0xD47326d2B5822355D9c4dfF5265849a5bb5D20ec";
export const XLOCK_FACTORY_V2 = "0x54b3019acBBf9aeFDc545d5CeA75e10322eA9D44";
export const PARTNERSHIPS_WALLET = "0x33e3c3f9c92F2045e1d3928599737E47a9D0dD8B";
export const TEAM_WALLET = "0x95672Ca9b03b7D07C9efc1f7D71fe137C748ECdC";
export const XLOCK_FEES_WALLET = "0x8e351267F713e8Fa21befD4AaD2eD4AE4146CB38";
export const XLOCK_OWNER_WALLET = "0x931B89E025Beb0b4243FaA63C70e8d64c43bc9b8";

const V2_EXPLORERS: readonly Explorer[] = [
  { chain: "BNB Chain", url: "https://bscscan.com" },
  { chain: "Ethereum", url: "https://etherscan.io" },
  { chain: "Arbitrum", url: "https://arbiscan.io" },
  { chain: "Polygon", url: "https://polygonscan.com" },
  { chain: "Avalanche", url: "https://snowtrace.io" },
  { chain: "Optimism", url: "https://optimistic.etherscan.io" },
  { chain: "Arc", url: "https://arc.etherscan.io" },
  { chain: "Tempo", url: "https://explore.tempo.xyz" },
  { chain: "Robinhood Chain", url: "https://robin.etherscan.io" },
].map((e) => ({ chain: e.chain, url: `${e.url}/address/${XLOCK_FACTORY_V2}` }));

export const OFFICIAL_ADDRESSES: readonly OfficialAddress[] = [
  {
    name: "$LLX token",
    address: LLX_CONTRACT,
    purpose: "The $LLX token contract (Virtuals, Base).",
    onBase: true,
  },
  {
    name: "X-Lock Factory (Base V1)",
    address: XLOCK_FACTORY_BASE,
    purpose:
      "X-Lock token locks on Base. Basescan name tag: “Liquid Logic X: X-Lock Factory”.",
    onBase: true,
    link: { href: XLOCK_URL, label: "Open X-Lock" },
  },
  {
    name: "X-Lock Factory V2 (all other chains)",
    address: XLOCK_FACTORY_V2,
    purpose:
      "X-Lock on every other chain, at the same address on each: BNB Chain, Ethereum, Arbitrum, Polygon, Avalanche, Optimism, Arc, Tempo and Robinhood Chain. Not deployed on Base.",
    onBase: false,
    explorers: V2_EXPLORERS,
  },
  {
    name: "Partnerships",
    address: PARTNERSHIPS_WALLET,
    purpose:
      "Partnerships wallet. 200M LLX locked in X-Lock #1 until Jan 13, 2027.",
    onBase: true,
    link: { href: `${XLOCK_URL}/lock/1`, label: "View X-Lock #1" },
  },
  {
    name: "Team",
    address: TEAM_WALLET,
    purpose: "Team operations. The $LLX airdrop was sent from this wallet.",
    onBase: true,
  },
  {
    name: "X-Lock Fees",
    address: XLOCK_FEES_WALLET,
    purpose: "Receives X-Lock fees on every chain.",
    onBase: true,
  },
  {
    name: "X-Lock Owner",
    address: XLOCK_OWNER_WALLET,
    purpose: "Owner of the X-Lock factories on every chain.",
    onBase: true,
  },
];
