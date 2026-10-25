/** Request parsing + response codes for /api/token-check (no x402 here; see route.ts). */
import { buildTokenCheck, NotAContractError, type TokenCheckDeps } from "./core";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export async function handleTokenCheckInput(
  input: { token?: unknown; chain?: unknown },
  deps: TokenCheckDeps = {},
): Promise<{ status: number; body: unknown }> {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!ADDR.test(token)) {
    return { status: 400, body: { error: 'Provide token as ?token=0x… or JSON { "token": "0x…" } (Base ERC-20 address)', code: "BAD_TOKEN" } };
  }
  if (typeof input.chain === "string" && input.chain.trim() && !["base", "8453", "eip155:8453"].includes(input.chain.trim().toLowerCase())) {
    return { status: 400, body: { error: "Only Base (chain=base) is supported.", code: "BAD_CHAIN" } };
  }
  try {
    return { status: 200, body: await buildTokenCheck(token as `0x${string}`, deps) };
  } catch (e) {
    // 4xx/5xx are never settled by @x402/next: the caller is not charged.
    if (e instanceof NotAContractError) return { status: 400, body: { error: e.message, code: "NOT_A_CONTRACT" } };
    const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : String(e);
    return { status: 503, body: { error: `Base RPC read failed; not charged. Retry shortly. (${msg})`, code: "RPC_UNAVAILABLE" } };
  }
}
