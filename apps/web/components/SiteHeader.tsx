import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { href: "/#controls", label: "Controls" },
  { href: "/#ledger", label: "Ledger" },
  { href: "/#endpoints", label: "Endpoints" },
  { href: "/#llx", label: "$LLX" },
  { href: "/plans", label: "Roadmap" },
  { href: "/#changelog", label: "Changelog" },
] as const;

export function SiteHeader() {
  return (
    <header className="top">
      <div className="wrap top-inner">
        <a className="brand" href="/">
          <img
            className="mark"
            src="/llx-logo.png"
            width={40}
            height={40}
            alt="Liquid Logic X"
          />
          Liquid Logic X
        </a>
        <nav className="primary" aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="top-trailing">
          <ThemeToggle />
          <span className="status">
            <i aria-hidden="true" />
            Treasurer operating
          </span>
        </div>
      </div>
    </header>
  );
}
