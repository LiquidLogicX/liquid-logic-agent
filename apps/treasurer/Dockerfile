# Node 22+ for CDP / jose ESM. Treasurer pays USDC on Base to x402 only.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ledger-publisher/package.json packages/ledger-publisher/
COPY apps/treasurer/package.json apps/treasurer/
COPY apps/audit/package.json apps/audit/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@liquid-logic/shared --workspace=@liquid-logic/treasurer

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/treasurer ./apps/treasurer
# npm workspaces hoist to root node_modules — nested package node_modules often absent
RUN npm run build -w @liquid-logic/shared && npm run build -w @liquid-logic/treasurer

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Omit CDP_X402_ENVIRONMENT for Base mainnet. Set development for Sepolia only.
RUN useradd -m -u 10001 treasurer
COPY --from=build /app/packages/shared /app/packages/shared
COPY --from=build /app/apps/treasurer /app/apps/treasurer
COPY --from=build /app/node_modules /app/node_modules
COPY package.json /app/package.json
RUN mkdir -p /app/data && chown -R treasurer:treasurer /app/data
USER treasurer
VOLUME ["/app/data"]
WORKDIR /app/apps/treasurer
CMD ["node", "dist/worker.js"]
