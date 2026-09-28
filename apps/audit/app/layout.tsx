import type { ReactNode } from "react";

export const metadata = {
  title: "Liquid Logic Audit",
  description: "x402-paid agent wallet spend audit — $0.05 USDC on Base",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", margin: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
