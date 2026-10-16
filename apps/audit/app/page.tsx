import TestCallButton, { EscrowTestCallButton } from "./test-call-button";

export default function Page() {
  return (
    <main>
      <h1>Liquid Logic — Agent wallet audit</h1>
      <p>
        Paid endpoint: <code>GET/POST /api/audit</code> —{" "}
        <strong>$0.03 USDC</strong> on Base (<code>eip155:8453</code>), Coinbase CDP facilitator.
      </p>
      <p>Input: wallet address. Output: structured spend summary (where USDC went).</p>
      <p>
        Pre-flight (call before spending): <code>GET/POST /api/allowance</code> —{" "}
        <strong>$0.001 USDC</strong>. Input: wallet + optional endpoint. Output: allowed /
        remaining under the treasurer daily cap.
      </p>
      <p>
        Lock check: <code>GET /api/lock-status?token=0x…</code> — <strong>$0.005 USDC</strong>. Is this token locked in X-Lock on any of 10 chains?
      </p>
      <TestCallButton />
      <p>
        Escrow check: <code>GET /api/escrow-status?chain=base&amp;id=1</code> — <strong>$0.005 USDC</strong>. What state is this X-Escrow in? Reads all ten X-Escrow mainnets.
      </p>
      <EscrowTestCallButton />
      <p>See <code>scripts/paid-audit-call.ts</code>, <code>scripts/paid-allowance-call.ts</code>, and <code>acceptance/</code>.</p>
    </main>
  );
}
