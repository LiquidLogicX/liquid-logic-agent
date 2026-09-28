/**
 * Minimal Base JSON-RPC reads (receipt, head, block timestamp) over fetch.
 * No explorer APIs. Injectable fetch for tests.
 */
import { BASE_RPC_TIMEOUT_MS } from "./config";

export type RpcLog = { address: string; topics: string[]; data: string; logIndex?: string };
export type RpcReceipt = {
  transactionHash: string;
  blockNumber: string;
  status: string;
  logs: RpcLog[];
};

export type BaseReader = {
  getReceipt(txHash: string): Promise<RpcReceipt | null>;
  getBlockNumber(): Promise<bigint>;
  getBlockTimestamp(blockNumberHex: string): Promise<bigint>;
};

export class BaseRpcError extends Error {}

export function createBaseReader(rpcUrl: string, fetchImpl: typeof fetch = fetch): BaseReader {
  let id = 0;
  async function call<T>(method: string, params: unknown[]): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BASE_RPC_TIMEOUT_MS);
    try {
      const res = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new BaseRpcError(`Base RPC HTTP ${res.status}`);
      const json = (await res.json()) as { result?: T; error?: { message?: string } };
      if (json.error) throw new BaseRpcError(`Base RPC error: ${json.error.message ?? "unknown"}`);
      return json.result as T;
    } catch (err) {
      if (err instanceof BaseRpcError) throw err;
      throw new BaseRpcError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    getReceipt: (txHash) => call<RpcReceipt | null>("eth_getTransactionReceipt", [txHash]),
    getBlockNumber: async () => BigInt(await call<string>("eth_blockNumber", [])),
    getBlockTimestamp: async (bn) => {
      const block = await call<{ timestamp: string } | null>("eth_getBlockByNumber", [bn, false]);
      if (!block) throw new BaseRpcError(`Base block ${bn} not found`);
      return BigInt(block.timestamp);
    },
  };
}
