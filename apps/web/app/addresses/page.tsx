import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import {
  ADDRESSES_DISCLAIMER,
  ADDRESSES_LEDE,
  ADDRESSES_TITLE,
  OFFICIAL_ADDRESSES,
  basescanAddress,
} from "@/lib/addresses";

const DESCRIPTION =
  "The official Liquid Logic X wallets and contracts on Base, in full. If an address is not on this page, it is not ours.";

export const metadata: Metadata = {
  title: "Official addresses",
  description: DESCRIPTION,
  alternates: { canonical: "/addresses" },
  openGraph: {
    title: "Official addresses — Liquid Logic X",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid Logic X" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Official addresses — Liquid Logic X",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function AddressesPage() {
  return (
    <main className="page addresses">
      <h1>{ADDRESSES_TITLE}</h1>
      <p className="page-lede">{ADDRESSES_LEDE}</p>

      <div className="tablewrap addr-table">
        <table>
          <caption className="sr-only">
            Official Liquid Logic X addresses on Base
          </caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Address</th>
              <th scope="col">Purpose</th>
              <th scope="col">Basescan</th>
            </tr>
          </thead>
          <tbody>
            {OFFICIAL_ADDRESSES.map((row) => (
              <tr key={row.address}>
                <th scope="row" className="addr-name">
                  {row.name}
                </th>
                <td>
                  <div className="ca addr-ca">
                    <code className="mono">{row.address}</code>
                    <CopyButton value={row.address} />
                  </div>
                </td>
                <td className="addr-purpose">
                  {row.purpose}
                  {row.link ? (
                    <>
                      {" "}
                      <a href={row.link.href} rel="noopener noreferrer">
                        {row.link.label} →
                      </a>
                    </>
                  ) : null}
                  {row.explorers ? (
                    <span className="addr-explorers">
                      {row.explorers.map((e, i) => (
                        <span key={e.chain}>
                          {i > 0 ? " · " : ""}
                          <a
                            href={e.url}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {e.chain}
                          </a>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </td>
                <td className="addr-link">
                  {row.onBase ? (
                    <a
                      href={basescanAddress(row.address)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Basescan ↗
                    </a>
                  ) : (
                    <span className="addr-none">Not on Base</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="addr-disclaimer">
        <strong>{ADDRESSES_DISCLAIMER}</strong>
      </p>
    </main>
  );
}
