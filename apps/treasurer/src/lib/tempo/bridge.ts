/**
 * Best-effort mirror of Demo Pay steps to the LLX Bridge live view as crew
 * messages, so the demo can cut between the phone and the bridge. Never blocks
 * or fails a payment; skipped entirely when LLX_BRIDGE_TOKEN is unset.
 */
export interface BridgeMirror {
  post(args: { body: string; replyTo?: string | null; links?: string[] }): Promise<string | null>;
}

export const noopBridge: BridgeMirror = { post: async () => null };

export function createHttpBridge(opts: {
  url: string;
  token: string | null;
  topic: string;
  fetchImpl?: typeof globalThis.fetch;
}): BridgeMirror {
  if (!opts.token) return noopBridge;
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  return {
    async post({ body, replyTo, links }) {
      try {
        const res = await doFetch(`${opts.url}/api/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${opts.token}` },
          body: JSON.stringify({
            kind: "update",
            topic: opts.topic,
            body,
            ...(replyTo ? { reply_to: replyTo } : {}),
            ...(links?.length ? { links } : {}),
          }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          console.warn(`[treasurer] bridge mirror HTTP ${res.status}`);
          return null;
        }
        const data = (await res.json().catch(() => ({}))) as { message?: { id?: string }; id?: string };
        return data.message?.id ?? data.id ?? null;
      } catch (err) {
        console.warn("[treasurer] bridge mirror failed:", err instanceof Error ? err.message : err);
        return null;
      }
    },
  };
}
