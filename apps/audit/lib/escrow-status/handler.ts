/** Request parsing + response codes for /api/escrow-status (no x402 here; see route.ts). */
import { buildEscrowStatus, type EscrowReader } from "./core";
import { isLive, liveEscrowChains, resolveEscrowChain, XESCROW_CHAINS, type XEscrowChain } from "./chains";

export type EscrowStatusDeps = { readerFor?: (c: XEscrowChain) => EscrowReader; now?: Date };

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const ID = /^[1-9][0-9]{0,15}$/;

export async function handleEscrowStatusInput(
  input: { chain?: unknown; id?: unknown; address?: unknown },
  deps: EscrowStatusDeps = {},
): Promise<{ status: number; body: unknown }> {
  const rawId = input.id === undefined || input.id === null || input.id === "" ? "" : String(input.id).trim();
  const address = typeof input.address === "string" ? input.address.trim() : "";
  if ((!rawId && !address) || (rawId && address)) {
    return { status: 400, body: { error: 'Provide exactly one of ?id=<escrowId>&chain=base-sepolia or ?address=0x… (buyer or seller), or the same as JSON.', code: "BAD_QUERY" } };
  }
  if (rawId && !ID.test(rawId)) return { status: 400, body: { error: "id must be a positive integer escrow id.", code: "BAD_ID" } };
  if (address && !ADDR.test(address)) return { status: 400, body: { error: "address must be a 0x… wallet address.", code: "BAD_ADDRESS" } };

  let chains = liveEscrowChains();
  const chainIn = typeof input.chain === "string" && input.chain.trim() && input.chain.trim().toLowerCase() !== "all" ? input.chain.trim() : null;
  if (chainIn) {
    const c = resolveEscrowChain(chainIn);
    if (!c) {
      return { status: 400, body: { error: `Unknown chain "${chainIn}". Use one of: ${XESCROW_CHAINS.map((x) => x.key).join(", ")}`, code: "BAD_CHAIN" } };
    }
    if (!isLive(c)) {
      return { status: 400, body: { error: `X-Escrow is not live on ${c.name} yet. Live: ${liveEscrowChains().map((x) => x.key).join(", ")}`, code: "CHAIN_NOT_LIVE" } };
    }
    chains = [c];
  }
  const report = await buildEscrowStatus({
    id: rawId ? Number(rawId) : undefined,
    address: address ? (address as `0x${string}`) : undefined,
    chain: chainIn ? chains[0].key : null,
    chains,
    readerFor: deps.readerFor,
    now: deps.now,
  });
  // Every chain failed: answer unknown, so 503 (x402 does not settle >= 400, caller is not charged).
  if (report.chainsChecked.length === 0) {
    return { status: 503, body: { ...report, error: "All chain RPC reads failed; not charged. Retry shortly.", code: "RPC_UNAVAILABLE" } };
  }
  return { status: 200, body: report };
}
