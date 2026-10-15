/**
 * Live read-only smoke against Base Sepolia (no payment, no x402): factory 0x8247…7BC3 (XEscrowT5 launch-cap redeploy):
 * escrows #1 (released), #2 (refunded after deadline), #3 (cancelled with the seller's M1 Cancel signature → refunded).
 *   npm run check-escrow-status-live -w @liquid-logic/audit
 */
import { handleEscrowStatusInput } from "../lib/escrow-status/handler";

void (async () => {
  for (const id of [1, 2, 3]) {
    const r = await handleEscrowStatusInput({ chain: "base-sepolia", id });
    const b = r.body as { escrows?: { escrowId: number; state: string; amount: string; token: { symbol: string } }[] };
    console.log(r.status, JSON.stringify(b.escrows?.map((e) => [e.escrowId, e.state, e.amount, e.token.symbol])));
  }
  const p = await handleEscrowStatusInput({ address: "0x793E8C977CB0c188332a72E34e9774dc1Dc762a0" });
  console.log(p.status, "deployer escrows:", (p.body as { total: number }).total);
})();
