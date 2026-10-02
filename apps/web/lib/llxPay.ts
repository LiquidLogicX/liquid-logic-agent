/**
 * LLX Pay section constants.
 * Never link to the LLX Pay production app host from the public site.
 */

/** Public testnet demo. */
export const LLX_PAY_DEMO_URL = "https://llx-pay.vercel.app";

/**
 * First LLX Pay payment on Arc mainnet: 1 USDC from the company Safe
 * 0xF5C7063266Bb395F153996cd6F824F8eF07e2A02 (Safe nonce 0, origin "LLX Pay")
 * to 0x167e47DA09A4e02ff5064BC75F348C5Ee87f01ED, block 23470867,
 * Sep 29 2026 19:52:29 PT (2026-09-30T02:52:29Z). Checked on explorer.arc.io,
 * the Safe Transaction Service and Arc RPC on Oct 2 2026.
 */
export const LLX_PAY_FIRST_PAYMENT_TX =
  "0x971dc49da4f1948b7c4df0718e6539aa17fc218b98adcffd92e8219c3c557935";

export const LLX_PAY_FIRST_PAYMENT_URL = `https://explorer.arc.io/tx/${LLX_PAY_FIRST_PAYMENT_TX}?tab=token_transfers`;

/** Demo video assets in apps/web/public (dropped in separately). */
export const LLX_PAY_VIDEO_SRC = "/llx-pay-demo.mp4";
export const LLX_PAY_VIDEO_POSTER = "/llx-pay-demo-poster.jpg";
