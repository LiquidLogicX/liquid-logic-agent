/**
 * Push TREASURER_LEDGER_PATH JSONL to GitHub data/ledger.jsonl.
 * Union-merges with the remote file so a sparse Render disk cannot wipe history.
 *
 * LAUNCH_GENESIS_RESET (note on remote): local/disk events with timestamp
 * strictly before the marker are excluded from the merge that is pushed.
 * The Render disk file is never rewritten by this filter (operator may wipe
 * separately). Post-marker local events still union-merge and push.
 *
 * LEDGER_LAUNCH_RESET=1 without a remote marker: skip push; do not rewrite disk.
 */
import fs from "node:fs";
import {
  localEventsForGenesisAwareMerge,
  mergeLedgerEvents,
  parseLedgerJsonl,
  serializeLedgerJsonl,
} from "@liquid-logic/shared";

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
  mergedEvents?: number;
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

/**
 * Pure merge used by sync + tests: when remote has LAUNCH_GENESIS_RESET,
 * drop local events before the marker timestamp, then union-merge.
 * Does not touch any filesystem.
 */
export function mergeLedgerForGitHubPush(
  remoteEvents: ReturnType<typeof parseLedgerJsonl>,
  localEvents: ReturnType<typeof parseLedgerJsonl>,
): {
  merged: ReturnType<typeof parseLedgerJsonl>;
  markerTimestamp?: string;
  droppedLocal: number;
} {
  const { marker, localForMerge } = localEventsForGenesisAwareMerge(
    localEvents,
    remoteEvents,
  );
  const merged = mergeLedgerEvents(remoteEvents, localForMerge);
  return {
    merged,
    markerTimestamp: marker?.timestamp,
    droppedLocal: localEvents.length - localForMerge.length,
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
  const localRaw = fs.readFileSync(cfg.ledgerPath, "utf8");
  const localEvents = parseLedgerJsonl(localRaw);
  // Snapshot for "disk untouched" checks — we never write for genesis filter.
  const diskBefore = localRaw;

  const apiBase = `https://api.github.com/repos/${cfg.repo}/contents/${destPath}`;
  const getUrl = `${apiBase}?ref=${encodeURIComponent(branch)}`;
  const getRes = await fetch(getUrl, { headers: ghHeaders(cfg.token) });
  let sha: string | undefined;
  let remoteEvents = [] as ReturnType<typeof parseLedgerJsonl>;
  if (getRes.status === 200) {
    const existing = (await getRes.json()) as {
      sha?: string;
      content?: string;
      encoding?: string;
    };
    sha = existing.sha;
    if (existing.content && existing.encoding === "base64") {
      const remote = Buffer.from(
        existing.content.replace(/\n/g, ""),
        "base64",
      ).toString("utf8");
      remoteEvents = parseLedgerJsonl(remote);
    }
  } else if (getRes.status !== 404) {
    const t = await getRes.text();
    return {
      ok: false,
      message: `GET ${destPath} failed: ${getRes.status} ${t.slice(0, 200)}`,
    };
  }

  const envLaunchReset =
    process.env.LEDGER_LAUNCH_RESET === "1" ||
    process.env.LEDGER_LAUNCH_RESET?.toLowerCase() === "true";

  const { merged, markerTimestamp, droppedLocal } = mergeLedgerForGitHubPush(
    remoteEvents,
    localEvents,
  );

  // Env-only reset without a remote marker: refuse to push (cannot filter by
  // timestamp). Disk stays untouched — operator must publish the marker or wipe.
  if (envLaunchReset && !markerTimestamp) {
    return {
      ok: true,
      skipped: true,
      mergedEvents: remoteEvents.length,
      message:
        "LEDGER_LAUNCH_RESET=1 but no LAUNCH_GENESIS_RESET on remote — skipped push; disk untouched",
    };
  }

  const content = serializeLedgerJsonl(merged);
  if (!content.trim()) {
    return { ok: true, skipped: true, message: "empty ledger — skip push" };
  }

  const remoteSerialized = serializeLedgerJsonl(remoteEvents);
  if (sha && remoteSerialized === content) {
    // Integrity: never rewrite disk on the genesis-aware path.
    if (fs.readFileSync(cfg.ledgerPath, "utf8") !== diskBefore) {
      return {
        ok: false,
        message: "internal error: disk changed unexpectedly during sync",
      };
    }
    return {
      ok: true,
      skipped: true,
      mergedEvents: merged.length,
      message: markerTimestamp
        ? `ledger unchanged on GitHub (genesis filter dropped ${droppedLocal} local pre-marker event(s); marker@${markerTimestamp})`
        : "ledger unchanged on GitHub (union match)",
    };
  }

  // When a genesis marker is present, do NOT write the merged union back onto
  // Render disk (that would truncate or reshape operator history). Push only.
  // Without a marker, recover full union onto disk so daily-cap / dump see it.
  if (!markerTimestamp && serializeLedgerJsonl(localEvents) !== content) {
    fs.writeFileSync(cfg.ledgerPath, content, "utf8");
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
    return {
      ok: false,
      message: `PUT ${destPath} failed: ${putRes.status} ${t.slice(0, 300)}`,
    };
  }
  const putJson = (await putRes.json()) as { commit?: { sha?: string } };
  return {
    ok: true,
    commitSha: putJson.commit?.sha,
    mergedEvents: merged.length,
    message: markerTimestamp
      ? `synced ${destPath} → ${cfg.repo}@${branch} (${merged.length} events; genesis filter dropped ${droppedLocal} local pre-marker; disk untouched)`
      : `synced ${destPath} → ${cfg.repo}@${branch} (${merged.length} events, union merge)`,
  };
}
