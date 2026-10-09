/**
 * Tempo rail HTTP routes (LLX Pay Demo Pay card → treasurer).
 * Auth: Authorization: Bearer $TREASURER_SERVICE_TOKEN (not the operator token).
 *
 *   GET  /api/tempo/config
 *   GET  /api/tempo/last-proof-attempt    last recorder call (status, body preview, payment tx)
 *   POST /api/tempo/flows                 { amountUsdc, memo?, clientRequestId?, requestedBy? }
 *   GET  /api/tempo/flows/:id
 *   POST /api/tempo/flows/:id/approve     { approvedBy? }
 *   POST /api/tempo/flows/:id/deny        { deniedBy? }
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { requireServiceBearer } from "../operator-auth.js";
import { publicTempoConfig } from "./config.js";
import { TempoFlowError } from "./flows.js";
import { getLastProofAttempt } from "./last-proof-attempt.js";
import type { TempoRuntime } from "./runtime.js";

type Send = (res: ServerResponse, status: number, body: Record<string, unknown>) => void;

export async function handleTempoRoute(opts: {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  runtime: TempoRuntime;
  readBody: (req: IncomingMessage) => Promise<string>;
  sendJson: Send;
  onLedgerChange?: () => void;
}): Promise<void> {
  const { req, res, method, path, runtime, sendJson } = opts;
  const rail = runtime.rail;
  if (!rail) {
    sendJson(res, 503, { ok: false, enabled: false, error: "Tempo rail is off on this treasurer" });
    return;
  }
  const auth = requireServiceBearer(req.headers.authorization, rail.cfg.serviceToken);
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error });
    return;
  }

  let body: Record<string, unknown> = {};
  if (method === "POST") {
    const raw = await opts.readBody(req);
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
        return;
      }
    }
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);

  try {
    if (method === "GET" && path === "/api/tempo/config") {
      sendJson(res, 200, { ok: true, ...publicTempoConfig(rail.cfg) });
      return;
    }
    if (method === "GET" && path === "/api/tempo/last-proof-attempt") {
      const attempt = getLastProofAttempt();
      sendJson(res, 200, {
        ok: true,
        attempt: attempt
          ? {
              at: attempt.at,
              paymentTxHash: attempt.paymentTxHash,
              status: attempt.status,
              bodyPreview: attempt.bodyPreview,
              error: attempt.error,
              ok: attempt.ok,
            }
          : null,
      });
      return;
    }
    if (method === "POST" && path === "/api/tempo/flows") {
      const amountUsdc = str("amountUsdc") ?? "";
      const { flow } = await rail.start({
        amountUsdc,
        memo: str("memo"),
        clientRequestId: str("clientRequestId"),
        requestedBy: str("requestedBy"),
      });
      opts.onLedgerChange?.();
      sendJson(res, 201, { ok: true, flow });
      return;
    }
    const m = /^\/api\/tempo\/flows\/([^/]+)(?:\/(approve|deny))?$/.exec(path);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      const action = m[2];
      if (method === "GET" && !action) {
        const flow = rail.get(id);
        if (!flow) {
          sendJson(res, 404, { ok: false, error: "Flow not found" });
          return;
        }
        sendJson(res, 200, { ok: true, flow });
        return;
      }
      if (method === "POST" && action === "approve") {
        const { flow } = await rail.approve(id, str("approvedBy") ?? "operator (LLX Pay)");
        opts.onLedgerChange?.();
        sendJson(res, 200, { ok: true, flow });
        return;
      }
      if (method === "POST" && action === "deny") {
        const flow = rail.deny(id, str("deniedBy") ?? "operator (LLX Pay)");
        opts.onLedgerChange?.();
        sendJson(res, 200, { ok: true, flow });
        return;
      }
    }
    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    if (err instanceof TempoFlowError) {
      sendJson(res, err.status, { ok: false, error: err.message, code: err.code });
      return;
    }
    console.error("[treasurer] tempo route error:", err instanceof Error ? err.message : err);
    sendJson(res, 500, { ok: false, error: "Internal error" });
  }
}
