/**
 * Long-running worker process for Render Starter.
 * Payments are invoked via CLI / one-off jobs; this process keeps the service healthy.
 */
console.log(
  "[treasurer] worker idle — use CLI: node dist/cli/index.js <command>. USDC/x402 on Base only.",
);
setInterval(() => {
  /* heartbeat */
}, 60_000);
