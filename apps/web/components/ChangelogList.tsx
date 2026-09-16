import { CHANGELOG } from "@/lib/changelog";

function formatChangelogDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ChangelogList() {
  return (
    <ol className="log">
      {CHANGELOG.map((e) => (
        <li key={`${e.date}-${e.href}-${e.title}`}>
          <time dateTime={e.date}>{formatChangelogDate(e.date)}</time>
          <div>
            <strong>{e.title}</strong>
            <span className="d">{e.detail}</span>
          </div>
          <a href={e.href} rel="noopener noreferrer" target="_blank">
            {e.hrefLabel}
          </a>
        </li>
      ))}
    </ol>
  );
}
