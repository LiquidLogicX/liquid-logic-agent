import { LlxPayActions } from "@/components/LlxPayActions";
import { LlxPayVideo } from "@/components/LlxPayVideo";
import { SettlementProofs } from "@/components/SettlementProofs";
import { LLX_PAY_FIRST_PAYMENT_URL } from "@/lib/llxPay";

export function LlxPaySection() {
  return (
    <section className="block llxpay" id="llx-pay">
      <div className="wrap llxpay-grid">
        <div className="llxpay-head">
          <h2>
            LLX Pay <span className="badge">Early access</span>
          </h2>
          <p className="llxpay-sub">
            Company USDC payments on Arc. Multi-signer approvals, instant
            settlement, a receipt for every payment.
          </p>
        </div>

        <div className="llxpay-media">
          <LlxPayVideo />
        </div>

        <div className="llxpay-body">
          <p className="llxpay-proof">
            Running on Arc mainnet since Sep 29, 2026.{" "}
            <a
              href={LLX_PAY_FIRST_PAYMENT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              View first payment
            </a>
          </p>
          <ul className="llxpay-points">
            <li>
              <strong>Company wallet:</strong> a Safe your team controls. LLX
              never holds your keys.
            </li>
            <li>
              <strong>Approvals:</strong> set who sends and who approves, with
              rule checks before money moves.
            </li>
            <li>
              <strong>Receipts:</strong> every payment settles in under a
              second, with a receipt and an explorer link.
            </li>
          </ul>
          <LlxPayActions />
          <SettlementProofs />
        </div>
      </div>
    </section>
  );
}
