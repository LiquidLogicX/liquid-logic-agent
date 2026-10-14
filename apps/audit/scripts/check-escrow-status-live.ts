/**
 * Live read-only smoke against Base Sepolia (no payment, no x402): escrows #1 (refunded) and #2 (released).
 *   npm run check-escrow-status-live -w @liquid-logic/audit
 */
import { handleEscrowStatusInput } from "../lib/escrow-status/handler";

void (async () => {
  for (const id of [1, 2]) {
    const r = await handleEscrowStatusInput({ chain: "base-sepolia", id });
    const b = r.body as { escrows?: { escrowId: number; state: string; amount: string; token: { symbol: string } }[] };
    console.log(r.status, JSON.stringify(b.escrows?.map((e) => [e.escrowId, e.state, e.amount, e.token.symbol])));
  }
  const p = await handleEscrowStatusInput({ address: "0x793E8C977CB0c188332a72E34e9774dc1Dc762a0" });
  console.log(p.status, "deployer escrows:", (p.body as { total: number }).total);
})();
