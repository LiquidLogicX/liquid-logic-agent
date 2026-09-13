# Guardrails — Liquid Logic Agent

These rules are **non-negotiable**. They apply to code, comments, logs, copy, README, UI, social drafts, and ops.

## USDC only (Base)

- The only payment asset is **USDC on Base** (`eip155:8453`).
- Never invent a custom token.
- Never buy, swap into, or hold any asset other than USDC (ETH for gas only as required by the network — never as a treasury position).
- If a feature seems to need a custom token: **STOP** and open a `BLOCKER` instead of inventing one.

## No growth / yield / investment framing

- Do **not** describe balances, spend, or operations as “treasury growth,” yield, APY, investment, appreciation, or similar.
- Copy and logs must frame activity as **operating spend for services** (x402 endpoints).

## Services only

- The treasurer **pays x402 service endpoints** for useful work.
- Enforce in code: endpoint **allowlist**, **max per payment**, and **cumulative daily USDC cap**.
- Hard-fail any code path that would swap/buy non-USDC.

## Social posts

- Drafts only under `drafts/social/` for a human to post.
- **No** Twitter/X / LinkedIn / API posting automation in this repo.

## Scope

- This repo is **only** `LiquidLogicX/liquid-logic-agent`.
- Do **not** touch `LiquidLogicX/liquid-logic-x` or any Sepolia FHE contracts from this codebase.
