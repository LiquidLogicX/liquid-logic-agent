# Web (`apps/web`) — liquidlogicx.com

Next.js App Router marketing + ledger surface.

- Explains the agent (USDC / x402 services only; agent never buys, sells, or holds $LLX)
- Live ledger embed + links
- Endpoint docs for the $0.05 audit fee
- Brief `$LLX` note (Virtuals launch); contract address renders only when `NEXT_PUBLIC_LLX_CONTRACT_ADDRESS` is set
- **No** pricing beyond audit, **no** roadmap promises as reasons to hold the token

Ready for Vercel Hobby + custom domain `liquidlogicx.com`.

## LLX Pay section (`#llx-pay`)

- Component: `components/LlxPaySection.tsx` (video: `LlxPayVideo.tsx`, buttons + form: `LlxPayActions.tsx`, constants: `lib/llxPay.ts`).
- Demo video: drop `llx-pay-demo.mp4` and `llx-pay-demo-poster.jpg` into `apps/web/public/`. Until then the phone frame shows a styled placeholder.
- Never link to the LLX Pay production app host from this site. "Try the demo" points to the testnet app at https://llx-pay.vercel.app.

### Request access form → `POST /api/request-access`

Body `{ company, email, website }` (`website` is a honeypot). Validated server-side. Rate limited to 5 per 10 min per hashed IP. If no backend is configured, or every backend fails, it returns a friendly 503 that points to hello@liquidlogicx.com.

| Env var (Vercel project `liquid-logic-agent-web`, Production + Preview) | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or Vercel KV `KV_REST_API_URL`, `KV_REST_API_TOKEN`) | Storage: each request is `LPUSH`ed as JSON to `llxpay:access_requests`. Also backs the rate limit. |
| `RESEND_API_KEY` | Notification email via Resend |
| `ACCESS_REQUEST_FROM` | Sender on a Resend-verified domain, e.g. `LLX Pay <access@liquidlogicx.com>` |
| `ACCESS_REQUEST_NOTIFY_TO` (optional) | Defaults to `hello@liquidlogicx.com` |

Tests: `npm run test:web`.
