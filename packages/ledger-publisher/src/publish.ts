/**
 * Cron-friendly ledger publisher.
 * Reads JSONL → public/ledger/*.json + index.html + drafts/social/*.md
 * Does NOT post to Twitter/X/LinkedIn — drafts only for humans.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  atomicToUsdc,
  basescanTxUrl,
  isPaymentEvent,
  parseLedgerJsonl,
  usdcToAtomic,
  type LedgerEvent,
  type PaymentEvent,
} from "@liquid-logic/shared";

function loadEvents(filePath: string): LedgerEvent[] {
  if (!fs.existsSync(filePath)) return [];
  return parseLedgerJsonl(fs.readFileSync(filePath, "utf8"));
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function withBasescan(e: LedgerEvent): LedgerEvent {
  if ("txHash" in e && e.txHash && !("basescanUrl" in e && e.basescanUrl)) {
    return { ...e, basescanUrl: basescanTxUrl(e.txHash) } as LedgerEvent;
  }
  return e;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDayHtml(day: string, events: LedgerEvent[]): string {
  const rows = events
    .map((e) => {
      const tx =
        "txHash" in e && e.txHash
          ? `<a href="${escapeHtml(basescanTxUrl(e.txHash))}" rel="noopener noreferrer">${escapeHtml(e.txHash.slice(0, 10))}…</a>`
          : "—";
      const amount =
        "amountUsdc" in e && e.amountUsdc ? `${escapeHtml(String(e.amountUsdc))} USDC` : "—";
      const endpoint =
        "endpoint" in e && e.endpoint ? escapeHtml(String(e.endpoint)) : escapeHtml(e.type);
      return `<tr>
  <td>${escapeHtml(e.timestamp)}</td>
  <td>${escapeHtml(e.type)}</td>
  <td>${endpoint}</td>
  <td>${amount}</td>
  <td>${tx}</td>
  <td>${escapeHtml(e.reason ?? "")}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Liquid Logic Agent ledger — ${escapeHtml(day)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #0f172a; background: #f8fafc; }
    h1 { font-size: 1.25rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; font-size: 0.875rem; }
    th { background: #f1f5f9; }
    a { color: #2563eb; }
    .note { color: #64748b; font-size: 0.875rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>Operating spend ledger — ${escapeHtml(day)}</h1>
  <p class="note">USDC on Base for x402 services only. Every tx links to BaseScan when a hash exists. Not investment advice; no treasury-growth framing.</p>
  <table>
    <thead>
      <tr><th>Time (UTC)</th><th>Type</th><th>Endpoint / detail</th><th>Amount</th><th>BaseScan</th><th>Reason</th></tr>
    </thead>
    <tbody>
${rows || `<tr><td colspan="6">No events this day.</td></tr>`}
    </tbody>
  </table>
</body>
</html>
`;
}

function renderSocialDraft(
  day: string,
  payments: PaymentEvent[],
  wallet?: string,
): string {
  const lines = [
    `# Social draft — ${day}`,
    ``,
    `> Human to post. Do **not** auto-post to Twitter/X/LinkedIn.`,
    ``,
    `## Suggested text`,
    ``,
    `Liquid Logic Agent operating spend (${day}, USDC on Base / x402 services only):`,
    ``,
  ];

  if (payments.length === 0) {
    lines.push(`- No service payments recorded this day.`);
  } else {
    for (const p of payments) {
      const url = p.basescanUrl ?? (p.txHash ? basescanTxUrl(p.txHash) : "(no tx yet)");
      lines.push(
        `- ${p.amountUsdc} USDC → ${p.endpoint}${p.txHash ? ` — ${url}` : ""}`,
      );
    }
  }

  lines.push(``);
  lines.push(`Ledger: https://liquidlogicx.com/ledger`);
  if (wallet) {
    lines.push(`Wallet: https://basescan.org/address/${wallet}`);
  }
  lines.push(``);
  return lines.join("\n");
}

function findRepoRoot(): string {
  // Prefer cwd when already at monorepo root; else walk up from this package.
  const markers = ["apps/treasurer", "packages/ledger-publisher"];
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (
      markers.every((m) => fs.existsSync(path.join(dir, m))) ||
      fs.existsSync(path.join(dir, "GUARDRAILS.md"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function main(): void {
  const root = findRepoRoot();
  const jsonl = path.resolve(
    process.env.LEDGER_JSONL_PATH ?? path.join(root, "data/ledger.jsonl"),
  );
  const outDir = path.resolve(
    process.env.LEDGER_OUT_DIR ?? path.join(root, "public/ledger"),
  );
  const draftsDir = path.resolve(
    process.env.SOCIAL_DRAFTS_DIR ?? path.join(root, "drafts/social"),
  );
  const wallet = process.env.AGENT_WALLET_ADDRESS;

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(draftsDir, { recursive: true });

  const events = loadEvents(jsonl).map(withBasescan);
  const byDay = new Map<string, LedgerEvent[]>();
  for (const e of events) {
    const d = dayKey(e.timestamp);
    const list = byDay.get(d) ?? [];
    list.push(e);
    byDay.set(d, list);
  }

  const today = new Date().toISOString().slice(0, 10);
  const days = [...byDay.keys()].sort();

  const paymentsAll = events.filter(isPaymentEvent);
  const latest = {
    generatedAt: new Date().toISOString(),
    network: "eip155:8453",
    asset: "USDC",
    walletAddress: wallet ?? null,
    totalEvents: events.length,
    totalPayments: paymentsAll.length,
    totalPaidUsdcApprox: Number(
      atomicToUsdc(
        paymentsAll.reduce((s, p) => {
          try {
            return s + usdcToAtomic(p.amountUsdc || "0");
          } catch {
            return s;
          }
        }, 0n),
      ),
    ),
    days,
    today,
    recentPayments: paymentsAll.slice(-20).map((p) => ({
      ...p,
      basescanUrl: p.txHash ? basescanTxUrl(p.txHash) : p.basescanUrl,
    })),
  };

  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(latest, null, 2) + "\n");

  for (const day of days) {
    const dayEvents = byDay.get(day)!;
    fs.writeFileSync(
      path.join(outDir, `${day}.json`),
      JSON.stringify({ day, events: dayEvents }, null, 2) + "\n",
    );
    fs.writeFileSync(path.join(outDir, "index.html"), renderDayHtml(day, dayEvents));
    // Keep per-day HTML as well
    fs.writeFileSync(path.join(outDir, `${day}.html`), renderDayHtml(day, dayEvents));

    const dayPayments = dayEvents.filter(isPaymentEvent);
    fs.writeFileSync(
      path.join(draftsDir, `${day}.md`),
      renderSocialDraft(day, dayPayments, wallet),
    );
  }

  // Always refresh index.html for latest day (or empty today)
  const indexDay = days.includes(today) ? today : days[days.length - 1];
  if (indexDay) {
    fs.writeFileSync(
      path.join(outDir, "index.html"),
      renderDayHtml(indexDay, byDay.get(indexDay) ?? []),
    );
  } else {
    fs.writeFileSync(
      path.join(outDir, "index.html"),
      renderDayHtml(today, []),
    );
    fs.writeFileSync(
      path.join(draftsDir, `${today}.md`),
      renderSocialDraft(today, [], wallet),
    );
  }

  const mirrors = [
    path.join(root, "apps/web/public/ledger"),
    path.join(root, "apps/audit/public/ledger"),
  ];
  const mirrored: string[] = [];
  for (const dest of mirrors) {
    const destResolved = path.resolve(dest);
    if (destResolved === path.resolve(outDir)) continue;
    fs.mkdirSync(destResolved, { recursive: true });
    for (const name of fs.readdirSync(outDir)) {
      const src = path.join(outDir, name);
      if (!fs.statSync(src).isFile()) continue;
      fs.copyFileSync(src, path.join(destResolved, name));
    }
    mirrored.push(destResolved);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        events: events.length,
        days: days.length,
        outDir,
        draftsDir,
        mirrored,
        note: "Social drafts written for human posting only — no auto-post.",
      },
      null,
      2,
    ),
  );
}

main();
