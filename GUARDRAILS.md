# Guardrails — Liquid Logic Agent

These rules are **non-negotiable**. They apply to code, comments, logs, copy, README, UI, social drafts, and ops.

## USDC only for agent spend (Base)

- The only payment asset the agent spends is **USDC on Base** (`eip155:8453`).
- The agent **never buys, sells, or holds $LLX**. $LLX is a separate Virtuals (Base) token; it is not used for x402 payments, audit settlement, or treasurer spending.
- Never invent a substitute payment asset for the agent. Do not invent or publish a `$LLX` contract address until it is provided.
- Never buy, swap into, or hold any asset other than USDC for operating spend (ETH for gas only as required by the network — never as a treasury position).
- If a feature seems to need the agent to spend a non-USDC asset: **STOP** and open a `BLOCKER` instead of inventing one.

## No growth / yield / investment framing

- Do **not** describe balances, spend, or operations as “treasury growth,” yield, APY, investment, appreciation, or similar (except Cyredev-approved site footer disclaimer language that $LLX is not an investment product).
- Copy and logs must frame agent activity as **operating spend for services** (x402 endpoints) in USDC.

## Services only

- The treasurer **pays x402 service endpoints** for useful work, in USDC only.
- Enforce in code: endpoint **allowlist**, **max per payment**, and **cumulative daily USDC cap**.
- Hard-fail any code path that would swap/buy non-USDC or have the agent buy/sell/hold $LLX.
- Never claim the audit endpoint accepts $LLX — USDC only.

## Social posts

- Drafts only under `drafts/social/` for a human to post.
- **No** Twitter/X / LinkedIn / API posting automation in this repo.

## Scope

- This repo is **only** `LiquidLogicX/liquid-logic-agent`.
- Do **not** touch `LiquidLogicX/liquid-logic-x` or any Sepolia FHE contracts from this codebase.
