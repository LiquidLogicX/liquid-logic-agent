# Liquid Logic Agent

Monorepo for the **Liquid Logic** autonomous agent: pays **USDC on Base** to allowlisted **x402** service endpoints, publishes a verifiable spend ledger, sells a **$0.05 USDC** wallet-audit API, and a **$0.001 USDC** allowance pre-flight.

**Repo:** [LiquidLogicX/liquid-logic-agent](https://github.com/LiquidLogicX/liquid-logic-agent)  
**Not** `liquid-logic-x` (Sepolia FHE contracts) — do not mix scopes.

Hard rules: see [`GUARDRAILS.md`](./GUARDRAILS.md). Live acceptance blockers: [`BLOCKERS.md`](./BLOCKERS.md).

## Architecture

```
liquid-logic-agent/
├── apps/treasurer      # CDP CdpX402Client payer + CLI + Docker/Render
├── apps/audit          # Next.js x402-paid GET/POST /api/audit ($0.05 USDC)
├── apps/web            # liquidlogicx.com — agent explainer + ledger + docs
├── packages/shared     # USDC constants, ledger types, guardrail helpers
├── packages/ledger-publisher  # JSONL → public/ledger + drafts/social
├── public/ledger       # Published machine + human ledger
├── drafts/social       # Human-only social drafts (no auto-post)
└── data/ledger.jsonl   # Append-only operating spend log (runtime)
```

| Component | Role |
|-----------|------|
| Treasurer | CDP-managed wallet + `wrapFetchWithPayment`; allowlist / max / daily cap; JSONL ledger; operator freeze + hold HTTP |
| Ledger publisher | Cron / GitHub Action → `latest.json`, daily JSON/HTML, social markdown drafts |
| Audit | `createX402Server` seller; `$0.05` spend summary + `$0.001` allowance pre-flight |
| Web | Public site; ledger embed; endpoint docs |

**Networks:** production omits development env → **Base mainnet**. Set `CDP_X402_ENVIRONMENT=development` only for Base Sepolia testing.

## How to run (local)

Requires **Node 20.19+** (prefer **22+**).

```bash
git clone https://github.com/LiquidLogicX/liquid-logic-agent.git
cd liquid-logic-agent
cp .env.example .env   # fill CDP_* placeholders locally — never commit
npm install
npm run build -w @liquid-logic/shared
```

### Treasurer CLI

```bash
export CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... CDP_WALLET_SECRET=...
export TREASURER_ALLOWLIST=https://x402.vercel.app/protected
export TREASURER_MAX_PER_PAYMENT_USDC=1.00
export TREASURER_DAILY_CAP_USDC=10.00

npm run treasurer -- print-wallet-address
npm run treasurer -- set-allowance --max 1.00 --daily 10.00
npm run treasurer -- pay https://x402.vercel.app/protected --amount 0.01
```

### Ledger publisher

```bash
npm run publish-ledger
# writes public/ledger/* and drafts/social/YYYY-MM-DD.md
```

### Audit (dev)

```bash
export AUDIT_PAY_TO_EVM=0x...
npm run dev -w @liquid-logic/audit
# Paid client: npm run paid-call -w @liquid-logic/audit
```

### Web (dev)

```bash
npm run dev -w @liquid-logic/web
# http://localhost:3000
```

## Deploy

| App | Target | Notes |
|-----|--------|-------|
| Treasurer | Render Docker Blueprint `apps/treasurer/render.yaml` (**web** service) | Account `hello@liquidlogicx.com`, **Starter**; public HTTPS operator routes |
| Audit | Vercel Hobby | Root `apps/audit`; `audit.liquidlogicx.com` — `/api/audit` + `/api/allowance` |
| Web | Vercel Hobby | Root `apps/web`; custom domain **liquidlogicx.com** |

Do **not** deploy until secrets and logins exist — see `BLOCKERS.md`.

## What we never do

- Invent or trade any token other than USDC
- Frame spend as treasury growth / yield / investment
- Auto-post to Twitter/X/LinkedIn (drafts only)
- Touch Sepolia FHE / `liquid-logic-x` from this repo
