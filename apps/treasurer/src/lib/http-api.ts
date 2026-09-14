/**
 * Minimal operator HTTP surface on the treasurer process.
 * Auth: Authorization Bearer LLX_OPERATOR_TOKEN (not x402).
 * Routes: POST /api/freeze, POST /api/unfreeze, GET /healthz
 */
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TreasurerConfig } from "./config.js";
import { LedgerStore } from "./ledger-store.js";
import {
  isPaymentsFrozen,
  recordFrozen,
  recordUnfrozen,
} from "./freeze.js";
import { requireOperatorBearer } from "./operator-auth.js";
import {
  loadLedgerSyncConfigFromEnv,
  syncLedgerToGitHub,
} from "./sync-ledger-github.js";

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function maybeSyncLedger(ledgerPath: string): Promise<void> {
  const syncCfg = loadLedgerSyncConfigFromEnv(ledgerPath);
  if (!syncCfg) return;
  try {
    const result = await syncLedgerToGitHub(syncCfg);
    console.log(`[treasurer] ledger sync (freeze-api): ${result.message}`);
  } catch (err) {
    console.error(
      "[treasurer] ledger sync (freeze-api) failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export function startOperatorHttpServer(opts: {
  config: TreasurerConfig;
  port?: number;
  host?: string;
}): http.Server {
  const { config } = opts;
  const port = opts.port ?? Number(process.env.PORT ?? process.env.OPERATOR_HTTP_PORT ?? 10000);
  const host = opts.host ?? process.env.OPERATOR_HTTP_HOST ?? "0.0.0.0";
  const ledger = new LedgerStore(config.ledgerPath);

  const server = http.createServer(async (req, res) => {
    const method = (req.method ?? "GET").toUpperCase();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (method === "GET" && (path === "/healthz" || path === "/health")) {
        sendJson(res, 200, {
          ok: true,
          service: "liquid-logic-treasurer",
          frozen: isPaymentsFrozen(ledger),
        });
        return;
      }

      if (method === "POST" && (path === "/api/freeze" || path === "/api/unfreeze")) {
        const auth = requireOperatorBearer(req.headers.authorization);
        if (!auth.ok) {
          sendJson(res, auth.status, { ok: false, error: auth.error });
          return;
        }

        // Drain body (optional JSON); ignore contents for step 2.
        await readBody(req);

        if (path === "/api/freeze") {
          if (isPaymentsFrozen(ledger)) {
            sendJson(res, 200, {
              ok: true,
              frozen: true,
              already: true,
              message: "Already frozen",
            });
            return;
          }
          const event = recordFrozen(ledger);
          console.log("[treasurer] operator freeze recorded", event.timestamp);
          void maybeSyncLedger(config.ledgerPath);
          sendJson(res, 200, {
            ok: true,
            frozen: true,
            type: event.type,
            ts: event.timestamp,
          });
          return;
        }

        // /api/unfreeze
        if (!isPaymentsFrozen(ledger)) {
          sendJson(res, 200, {
            ok: true,
            frozen: false,
            already: true,
            message: "Already unfrozen",
          });
          return;
        }
        const event = recordUnfrozen(ledger);
        console.log("[treasurer] operator unfreeze recorded", event.timestamp);
        void maybeSyncLedger(config.ledgerPath);
        sendJson(res, 200, {
          ok: true,
          frozen: false,
          type: event.type,
          ts: event.timestamp,
        });
        return;
      }

      sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (err) {
      console.error(
        "[treasurer] http-api error:",
        err instanceof Error ? err.message : err,
      );
      sendJson(res, 500, { ok: false, error: "Internal error" });
    }
  });

  server.listen(port, host, () => {
    console.log(
      `[treasurer] operator HTTP listening on http://${host}:${port} (POST /api/freeze|/api/unfreeze)`,
    );
  });

  server.on("error", (err) => {
    console.error(
      "[treasurer] operator HTTP failed to bind:",
      err instanceof Error ? err.message : err,
    );
  });

  return server;
}
