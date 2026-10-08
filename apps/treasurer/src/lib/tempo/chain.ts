/**
 * Minimal Tempo chain surface the rail needs. The real implementation uses viem
 * with the Tempo chain definition and an explicit fee token (same approach as
 * the recorder: `tempo.extend({ feeToken })`), so every payment is a Tempo
 * transaction that pays its fee in USDC.e. Tests inject a fake.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  stringToHex,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempo as tempoMainnet, tempoModerato } from "viem/chains";
import { TEMPO_MAINNET_CHAIN_ID, type TempoRailConfig } from "./config.js";

export type TempoReceipt = { status: "success" | "reverted"; blockNumber: bigint };

export interface TempoChain {
  getChainId(): Promise<number>;
  balanceOf(token: Address, owner: Address): Promise<bigint>;
  /** TIP-20 transferWithMemo from the payer. Resolves with the tx hash once submitted. */
  transferWithMemo(args: { token: Address; to: Address; amount: bigint; memo: Hex }): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<TempoReceipt>;
}

export const tip20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transferWithMemo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/** 32-byte TIP-20 memo from text: printable ASCII only, max 31 chars (null-padded). */
export function memoToBytes32(text: string): Hex {
  const ascii = text.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 31) || "LLX Pay";
  return stringToHex(ascii, { size: 32 });
}

export function createViemTempoChain(
  cfg: Pick<TempoRailConfig, "chainId" | "rpcUrl" | "feeToken" | "payerPrivateKey">,
): TempoChain {
  const base = cfg.chainId === TEMPO_MAINNET_CHAIN_ID ? tempoMainnet : tempoModerato;
  // Explicit fee token on every tx (USDC.e by default), like the recorder's TEMPO_FEE_TOKEN.
  const chain = base.extend({ feeToken: cfg.feeToken }) as unknown as Chain;
  const transport = http(cfg.rpcUrl, { timeout: 10_000, retryCount: 1 });
  const account = privateKeyToAccount(cfg.payerPrivateKey);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  return {
    getChainId: () => publicClient.getChainId(),
    balanceOf: (token, owner) =>
      publicClient.readContract({
        address: token,
        abi: tip20Abi,
        functionName: "balanceOf",
        args: [owner],
      }) as Promise<bigint>,
    transferWithMemo: ({ token, to, amount, memo }) =>
      walletClient.writeContract({
        address: token,
        abi: tip20Abi,
        functionName: "transferWithMemo",
        args: [to, amount, memo],
        account,
        chain,
      }),
    async waitForReceipt(hash) {
      const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      return { status: r.status, blockNumber: r.blockNumber };
    },
  };
}
