/**
 * Operator HTTP surface on the treasurer process (public web service).
 * Auth: Authorization Bearer LLX_OPERATOR_TOKEN (not x402).
 * Routes:
 *   POST /api/freeze | /api/unfreeze
 *   GET  /api/holds
 *   POST /api/hold/request
 *   POST /api/hold/:id/approve | /api/hold/:id/deny
 *   GET  /healthz
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
  expireStaleHolds,
  getHoldResolution,
  listPendingHolds,
  recordDenied,
} from "./hold.js";
import { approveHold, requestHold } from "./client.js";
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
    console.log(`[treasurer] ledger sync (operator-api): ${result.message}`);
  } catch (err) {
    console.error(
      "[treasurer] ledger sync (operator-api) failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

function matchHoldAction(
  path: string,
): { holdId: string; action: "approve" | "deny" } | null {
  const m = /^\/api\/hold\/([^/]+)\/(approve|deny)$/.exec(path);
  if (!m) return null;
  return { holdId: decodeURIComponent(m[1]!), action: m[2] as "approve" | "deny" };
}

export function startOperatorHttpServer(opts: {
  config: TreasurerConfig;
  port?: number;
  host?: string;
}): http.Server {
  const { config } = opts;
  const port =
    opts.port ?? Number(process.env.PORT ?? process.env.OPERATOR_HTTP_PORT ?? 10000);
  const host = opts.host ?? process.env.OPERATOR_HTTP_HOST ?? "0.0.0.0";
  const ledger = new LedgerStore(config.ledgerPath);

  const server = http.createServer(async (req, res) => {
    const method = (req.method ?? "GET").toUpperCase();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (method === "GET" && (path === "/healthz" || path === "/health")) {
        expireStaleHolds(ledger, config.holdTtlSeconds);
        sendJson(res, 200, {
          ok: true,
          service: "liquid-logic-treasurer",
          frozen: isPaymentsFrozen(ledger),
          holdAboveUsdc: config.holdAboveUsdc,
          holdTtlSeconds: config.holdTtlSeconds,
          pendingHolds: listPendingHolds(ledger, config.holdTtlSeconds).length,
        });
        return;
      }

      const holdAction = matchHoldAction(path);
      if (method === "POST" && holdAction) {
        const auth = requireOperatorBearer(req.headers.authorization);
        if (!auth.ok) {
          sendJson(res, auth.status, { ok: false, error: auth.error });
          return;
        }
        await readBody(req);

        expireStaleHolds(ledger, config.holdTtlSeconds);
        const { holdId, action } = holdAction;
        const resolution = getHoldResolution(ledger.readAll(), holdId);

        if (action === "deny") {
          if (resolution === null) {
            sendJson(res, 404, { ok: false, error: `Hold not found: ${holdId}` });
            return;
          }
          if (resolution !== "pending") {
            sendJson(res, 409, {
              ok: false,
              error: `Hold not pending (${resolution})`,
              holdId,
              resolution,
            });
            return;
          }
          const event = recordDenied(ledger, { holdId });
          console.log("[treasurer] hold denied", holdId, event.timestamp);
          void maybeSyncLedger(config.ledgerPath);
          sendJson(res, 200, {
            ok: true,
            holdId,
            type: "denied",
            ts: event.timestamp,
          });
          return;
        }

        // approve
        if (resolution === null) {
          sendJson(res, 404, { ok: false, error: `Hold not found: ${holdId}` });
          return;
        }
        if (resolution !== "pending") {
          sendJson(res, 409, {
            ok: false,
            error: `Hold not pending (${resolution})`,
            holdId,
            resolution,
          });
          return;
        }
        if (isPaymentsFrozen(ledger)) {
          sendJson(res, 423, {
            ok: false,
            error: "Payments frozen — unfreeze before approving holds",
            holdId,
          });
          return;
        }

        try {
          const result = await approveHold({
            config,
            ledger,
            holdId,
            approvedBy: "operator",
          });
          const settled =
            result.status >= 200 &&
            result.status < 300 &&
            Boolean(result.txHash);
          console.log(
            "[treasurer] hold approved → payment",
            holdId,
            result.txHash ?? "(no tx hash)",
            "http",
            result.status,
          );
          void maybeSyncLedger(config.ledgerPath);
          if (!settled) {
            sendJson(res, 502, {
              ok: false,
              error:
                "Approve ran but settlement incomplete (need 2xx + txHash). Check CDP spend + endpoint ?wallet=.",
              holdId,
              status: result.status,
              txHash: result.txHash,
              walletAddress: result.walletAddress,
            });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            holdId,
            type: "payment",
            status: result.status,
            txHash: result.txHash,
            walletAddress: result.walletAddress,
            approvedBy: "operator",
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[treasurer] hold approve failed:", message);
          const status = message.startsWith("FROZEN:")
            ? 423
            : message.startsWith("GUARDRAIL:")
              ? 400
              : 500;
          sendJson(res, status, { ok: false, error: message, holdId });
        }
        return;
      }


      if (method === "POST" && path === "/api/hold/request") {
        const auth = requireOperatorBearer(req.headers.authorization);
        if (!auth.ok) {
          sendJson(res, auth.status, { ok: false, error: auth.error });
          return;
        }
        const raw = await readBody(req);
        let body: { url?: string; amountUsdc?: string; reason?: string } = {};
        if (raw.trim()) {
          try {
            body = JSON.parse(raw) as typeof body;
          } catch {
            sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
            return;
          }
        }
        const url = (body.url ?? "").trim();
        const amountUsdc = (body.amountUsdc ?? "").trim();
        if (!url || !amountUsdc) {
          sendJson(res, 400, {
            ok: false,
            error: "Body requires url and amountUsdc",
          });
          return;
        }
        try {
          const held = requestHold({
            config,
            ledger,
            url,
            amountUsdc,
            reason: body.reason,
          });
          void maybeSyncLedger(config.ledgerPath);
          sendJson(res, 200, {
            ok: true,
            type: "held",
            holdId: held.holdId,
            endpoint: held.endpoint,
            amountUsdc: held.amountUsdc,
            expiresAt: held.expiresAt,
            holdTtlSeconds: config.holdTtlSeconds,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[treasurer] hold request failed:", message);
          const status = message.startsWith("FROZEN:")
            ? 423
            : message.startsWith("GUARDRAIL:") ||
                message.startsWith("HOLD_DISABLED:") ||
                message.startsWith("HOLD_BELOW_THRESHOLD:") ||
                message.startsWith("HOLD_BAD_AMOUNT:")
              ? 400
              : 500;
          sendJson(res, status, { ok: false, error: message });
        }
        return;
      }

      if (method === "GET" && path === "/api/holds") {
        const auth = requireOperatorBearer(req.headers.authorization);
        if (!auth.ok) {
          sendJson(res, auth.status, { ok: false, error: auth.error });
          return;
        }
        const expired = expireStaleHolds(ledger, config.holdTtlSeconds);
        if (expired.length) void maybeSyncLedger(config.ledgerPath);
        const holds = listPendingHolds(ledger, config.holdTtlSeconds);
        sendJson(res, 200, {
          ok: true,
          holdAboveUsdc: config.holdAboveUsdc,
          holdTtlSeconds: config.holdTtlSeconds,
          expiredJustNow: expired,
          holds,
        });
        return;
      }

      if (method === "POST" && (path === "/api/freeze" || path === "/api/unfreeze")) {
        const auth = requireOperatorBearer(req.headers.authorization);
        if (!auth.ok) {
          sendJson(res, auth.status, { ok: false, error: auth.error });
          return;
        }

        // Drain body (optional JSON); ignore contents for freeze.
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
      `[treasurer] operator HTTP listening on http://${host}:${port} ` +
        `(freeze/unfreeze + hold request/approve/deny; Bearer LLX_OPERATOR_TOKEN)`,
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
