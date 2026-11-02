// $LLX V2 cross-chain bridge (LayerZero OFT). Pure helpers, no wallet code.
//
// Same token address on all six chains (CREATE from the deployer at nonce 0):
//   0x72885fBFA330d1a8fA95880A85b73d699943053B
// Owner and LayerZero delegate on every chain: LLX V2 Vault Safe (2-of-3)
//   0x794A618486dAA4EC6724865E68Fdc79Ae1eecB0B
// Wiring read on-chain Nov 1 2026 (~7:40 PM PST): all 30 directed routes have peers, pinned
// ULN302 libraries, LZ Labs + Horizen DVNs (2 required), enforced lzReceive gas and
// 1,000 LLX/day outbound + inbound limits. The page still re-checks peers, quoteSend and the
// daily limits live, and shows "Coming soon" for any route that fails those checks.

export const LLX_V2_TOKEN = "0x72885fBFA330d1a8fA95880A85b73d699943053B";
export const LLX_V2_VAULT = "0x794A618486dAA4EC6724865E68Fdc79Ae1eecB0B";
export const LLX_DECIMALS = 18;
/** OFT shared decimals = 6, so amounts are rounded down to 1e12 wei ("dust"). */
export const DUST = 10n ** 12n;

export type BridgeChain = {
  id: string;
  name: string;
  chainId: number;
  eid: number;
  /** Public read RPC (also offered to the wallet when adding the chain). */
  rpc: string;
  /** Extra read RPCs, tried in order if the first one errors or rate-limits. */
  rpcFallbacks?: string[];
  explorer: string;
  native: { name: string; symbol: string; decimals: number };
  /** Can this page send FROM the chain? Tempo pays LayerZero fees in LZD (ERC-20), not msg.value. */
  canSendFrom: boolean;
  note?: string;
};

export const BRIDGE_CHAINS: readonly BridgeChain[] = [
  {
    id: "base",
    name: "Base",
    chainId: 8453,
    eid: 30184,
    rpc: "https://mainnet.base.org",
    rpcFallbacks: ["https://base-rpc.publicnode.com", "https://base.drpc.org"],
    explorer: "https://basescan.org",
    native: { name: "Ether", symbol: "ETH", decimals: 18 },
    canSendFrom: true,
  },
  {
    id: "arc",
    name: "Arc",
    chainId: 5042,
    eid: 30417,
    rpc: "https://rpc.mainnet.arc.io",
    rpcFallbacks: ["https://arc.drpc.org"],
    explorer: "https://explorer.arc.io",
    native: { name: "USDC", symbol: "USDC", decimals: 18 },
    canSendFrom: true,
  },
  {
    id: "robinhood",
    name: "Robinhood Chain",
    chainId: 4663,
    eid: 30416,
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    native: { name: "Ether", symbol: "ETH", decimals: 18 },
    canSendFrom: true,
  },
  {
    id: "bsc",
    name: "BNB Chain",
    chainId: 56,
    eid: 30102,
    rpc: "https://bsc-dataseed.bnbchain.org",
    rpcFallbacks: ["https://bsc-rpc.publicnode.com", "https://bsc.drpc.org"],
    explorer: "https://bscscan.com",
    native: { name: "BNB", symbol: "BNB", decimals: 18 },
    canSendFrom: true,
  },
  {
    id: "hyperevm",
    name: "Hyperliquid",
    chainId: 999,
    eid: 30367,
    rpc: "https://rpc.hyperliquid.xyz/evm",
    rpcFallbacks: ["https://hyperliquid.drpc.org"],
    explorer: "https://hyperevmscan.io",
    native: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    canSendFrom: true,
  },
  {
    id: "tempo",
    name: "Tempo",
    chainId: 4217,
    eid: 30410,
    rpc: "https://rpc.tempo.xyz",
    rpcFallbacks: ["https://rpc.mainnet.tempo.xyz"],
    explorer: "https://explore.tempo.xyz",
    native: { name: "USD", symbol: "USD", decimals: 18 },
    canSendFrom: false,
    note: "Sending from Tempo needs the LayerZero fee paid in LZD. Coming soon on this page.",
  },
] as const;

export function chainById(id: string): BridgeChain | undefined {
  return BRIDGE_CHAINS.find((c) => c.id === id);
}

export function chainByChainId(chainId: number): BridgeChain | undefined {
  return BRIDGE_CHAINS.find((c) => c.chainId === chainId);
}

export const LAYERZERO_SCAN_TX = (hash: string) => `https://layerzeroscan.com/tx/${hash}`;
export const explorerTx = (c: BridgeChain, hash: string) => `${c.explorer}/tx/${hash}`;

// ---- ABI encoding (only the few static/dynamic shapes we need) ----

export const SEL = {
  balanceOf: "0x70a08231",
  peers: "0xbb0b6a53",
  getAmountCanBeSent: "0xc272198d",
  inboundCanBeReceived: "0x992250d5",
  quoteSend: "0x3b6f743b",
  send: "0xc7c7f5b3",
} as const;

const word = (v: bigint) => {
  if (v < 0n) throw new Error("negative");
  const h = v.toString(16);
  if (h.length > 64) throw new Error("overflow");
  return h.padStart(64, "0");
};
const addrWord = (a: string) => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error("bad address");
  return a.slice(2).toLowerCase().padStart(64, "0");
};

export function isAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

export function addressToBytes32(a: string): string {
  return "0x" + addrWord(a);
}

/** `to` is the recipient address (encoded as bytes32). SendParam with empty extraOptions/composeMsg/oftCmd (enforced options carry the gas). */
function sendParamTuple(dstEid: number, to: string, amountLD: bigint, minAmountLD: bigint): string {
  return (
    word(BigInt(dstEid)) +
    addrWord(to) +
    word(amountLD) +
    word(minAmountLD) +
    word(0xe0n) + // extraOptions offset (7 head words)
    word(0x100n) + // composeMsg offset
    word(0x120n) + // oftCmd offset
    word(0n) + // extraOptions length 0
    word(0n) + // composeMsg length 0
    word(0n) // oftCmd length 0
  );
}

export function encodeQuoteSend(dstEid: number, to: string, amountLD: bigint, minAmountLD: bigint): string {
  return SEL.quoteSend + word(0x40n) + word(0n) + sendParamTuple(dstEid, to, amountLD, minAmountLD);
}

export function encodeSend(
  dstEid: number,
  to: string,
  amountLD: bigint,
  minAmountLD: bigint,
  nativeFee: bigint,
  refund: string,
): string {
  return (
    SEL.send +
    word(0x80n) +
    word(nativeFee) +
    word(0n) + // lzTokenFee
    addrWord(refund) +
    sendParamTuple(dstEid, to, amountLD, minAmountLD)
  );
}

export const encodeBalanceOf = (a: string) => SEL.balanceOf + addrWord(a);
export const encodeUint32Call = (sel: string, n: number) => sel + word(BigInt(n));

/** Read the i-th 32-byte word of an eth_call result as a bigint. */
export function readWord(hex: string, i: number): bigint {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const w = h.slice(i * 64, i * 64 + 64);
  if (w.length !== 64) throw new Error("short return data");
  return BigInt("0x" + w);
}

// ---- amounts ----

export function removeDust(v: bigint): bigint {
  return (v / DUST) * DUST;
}

/** "12.5" -> 12500000000000000000n; returns null for invalid input. */
export function parseAmount(input: string, decimals = LLX_DECIMALS): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  const [i, f = ""] = s.split(".");
  if (f.length > decimals) return null;
  return BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** Format with up to `maxFrac` fraction digits, trimming zeros. */
export function formatUnits(v: bigint, decimals = 18, maxFrac = 6): string {
  const base = 10n ** BigInt(decimals);
  const i = v / base;
  let f = (v % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  if (f === "" && v > 0n && i === 0n) {
    // tiny non-zero values (fees): show significant digits instead of 0
    const full = (v % base).toString().padStart(decimals, "0");
    const firstNz = full.search(/[1-9]/);
    f = full.slice(0, Math.min(decimals, firstNz + 4)).replace(/0+$/, "");
  }
  return (f ? `${i.toLocaleString("en-US")}.${f}` : i.toLocaleString("en-US"));
}

export const toHex = (v: bigint) => "0x" + v.toString(16);
