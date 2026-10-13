import { NavMoreMenu } from "@/components/NavMoreMenu";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { href: "/#llx-pay", label: "LLX Pay" },
  { href: "https://xlock.liquidlogicx.com", label: "X-Lock" },
  { href: "/#llx", label: "$LLX" },
] as const;

const MORE = [
  { href: "/#controls", label: "Controls" },
  { href: "/ledger", label: "Ledger" },
  { href: "/docs", label: "Endpoint docs" },
  { href: "/plans", label: "Roadmap" },
  { href: "/#changelog", label: "Changelog" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="top">
      <div className="wrap top-inner">
        <div className="top-main">
          <a className="brand" href="/">
            <img
              className="mark"
              src="/llx-logo.png"
              width={40}
              height={40}
              alt="Liquid Logic X"
            />
            <span className="brand-name">
              Liquid Logic <span className="brand-x">X</span>
            </span>
          </a>
          <nav className="primary" aria-label="Primary">
            {NAV.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
            <NavMoreMenu items={MORE} />
          </nav>
        </div>
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
