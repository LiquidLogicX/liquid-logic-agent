import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { ADDRESSES_FOOTER, ADDRESSES_TITLE, OFFICIAL_ADDRESSES } from "@/lib/addresses";

const DESCRIPTION =
  "The official Liquid Logic X contract and wallet addresses on Base, with explorer links. If an address is not on this page, it is not ours.";

export const metadata: Metadata = {
  title: ADDRESSES_TITLE,
  description: DESCRIPTION,
  openGraph: { title: `${ADDRESSES_TITLE} — Liquid Logic X`, description: DESCRIPTION },
};

export default function AddressesPage() {
  return (
    <main className="page addresses">
      <h1>{ADDRESSES_TITLE}</h1>
      <p className="page-lede">
        Network: Base, unless noted. Check any address against this list before you send funds or trade.
        Agents:{" "}
        <a href="/skill.md">liquidlogicx.com/skill.md</a>
        {" "}(index) ·{" "}
        <a href="https://xlock.liquidlogicx.com/skill.md" rel="noopener noreferrer">
          xlock.liquidlogicx.com/skill.md
        </a>
        .
      </p>

      <div className="tablewrap">
        <table className="addr-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Address</th>
              <th scope="col">Purpose</th>
              <th scope="col">Explorer</th>
            </tr>
          </thead>
          <tbody>
            {OFFICIAL_ADDRESSES.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td className="addr-cell">
                  <code>{row.address}</code> <CopyButton value={row.address} />
                </td>
                <td>
                  {row.purpose}
                  {row.related ? (
                    <>
                      {" "}
                      <a href={row.related.href} rel="noopener noreferrer">
                        {row.related.label} →
                      </a>
                    </>
                  ) : null}
                  {row.chains ? (
                    <span className="addr-chains">
                      {row.chains.map((c, i) => (
                        <span key={c.label}>
                          {i > 0 ? " · " : ""}
                          <a href={c.href} rel="noopener noreferrer">
                            {c.label}
                          </a>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </td>
                <td>
                  <a href={row.explorer.href} rel="noopener noreferrer">
                    {row.explorer.label} →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="addr-footer">
        <strong>{ADDRESSES_FOOTER}</strong>
      </p>
    </main>
  );
}
