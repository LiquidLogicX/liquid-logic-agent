/**
 * Push local TREASURER_LEDGER_PATH JSONL to GitHub data/ledger.jsonl.
 * Enables the publish-ledger Action to refresh public/ledger from live Render activity.
 */
import fs from "node:fs";

export type LedgerSyncConfig = {
  ledgerPath: string;
  token: string;
  /** owner/name */
  repo: string;
  destPath?: string;
  branch?: string;
};

export type LedgerSyncResult = {
  ok: boolean;
  skipped?: boolean;
  commitSha?: string;
  message: string;
};

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "liquid-logic-treasurer-ledger-sync",
  };
}

export function loadLedgerSyncConfigFromEnv(
  ledgerPath: string,
): LedgerSyncConfig | null {
  const token =
    process.env.LEDGER_SYNC_GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    "";
  if (!token) return null;
  const repo =
    process.env.LEDGER_SYNC_REPO?.trim() || "LiquidLogicX/liquid-logic-agent";
  return {
    ledgerPath,
    token,
    repo,
    destPath: process.env.LEDGER_SYNC_PATH?.trim() || "data/ledger.jsonl",
    branch: process.env.LEDGER_SYNC_BRANCH?.trim() || "main",
  };
}

export async function syncLedgerToGitHub(
  cfg: LedgerSyncConfig,
): Promise<LedgerSyncResult> {
  const destPath = cfg.destPath || "data/ledger.jsonl";
  const branch = cfg.branch || "main";
  if (!fs.existsSync(cfg.ledgerPath)) {
    return { ok: false, message: `ledger missing: ${cfg.ledgerPath}` };
  }
  const content = fs.readFileSync(cfg.ledgerPath, "utf8");
  if (!content.trim()) {
    return { ok: true, skipped: true, message: "empty ledger — skip push" };
  }

  const apiBase = `https://api.github.com/repos/${cfg.repo}/contents/${destPath}`;
  const getUrl = `${apiBase}?ref=${encodeURIComponent(branch)}`;
  const getRes = await fetch(getUrl, { headers: ghHeaders(cfg.token) });
  let sha: string | undefined;
  if (getRes.status === 200) {
    const existing = (await getRes.json()) as { sha?: string; content?: string; encoding?: string };
    sha = existing.sha;
    if (existing.content && existing.encoding === "base64") {
      const remote = Buffer.from(existing.content.replace(/\n/g, ""), "base64").toString("utf8");
      if (remote === content) {
        return { ok: true, skipped: true, message: "ledger unchanged on GitHub" };
      }
    }
  } else if (getRes.status !== 404) {
    const t = await getRes.text();
    return { ok: false, message: `GET ${destPath} failed: ${getRes.status} ${t.slice(0, 200)}` };
  }

  const body: Record<string, unknown> = {
    message: "chore(ledger): sync from treasurer disk",
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers: { ...ghHeaders(cfg.token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    return { ok: false, message: `PUT ${destPath} failed: ${putRes.status} ${t.slice(0, 300)}` };
  }
  const putJson = (await putRes.json()) as { commit?: { sha?: string } };
  return {
    ok: true,
    commitSha: putJson.commit?.sha,
    message: `synced ${destPath} → ${cfg.repo}@${branch}`,
  };
}
