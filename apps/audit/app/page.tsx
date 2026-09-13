export default function Page() {
  return (
    <main>
      <h1>Liquid Logic — Agent wallet audit</h1>
      <p>
        Paid endpoint: <code>GET/POST /api/audit</code> —{" "}
        <strong>$0.05 USDC</strong> on Base (<code>eip155:8453</code>), Coinbase CDP facilitator.
      </p>
      <p>Input: wallet address. Output: structured spend summary (where USDC went).</p>
      <p>See <code>scripts/paid-audit-call.ts</code> and <code>acceptance/</code>.</p>
    </main>
  );
}
