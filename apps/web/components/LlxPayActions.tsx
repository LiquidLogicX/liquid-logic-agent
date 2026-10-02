"use client";

import { useRef, useState, type FormEvent } from "react";
import { LLX_PAY_DEMO_URL } from "@/lib/llxPay";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

const FALLBACK_ERROR =
  "We couldn't take your request right now. Please email hello@liquidlogicx.com and we'll get back to you.";

export function LlxPayActions() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const companyRef = useRef<HTMLInputElement>(null);

  function openForm() {
    setOpen(true);
    requestAnimationFrame(() => companyRef.current?.focus());
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: String(fd.get("company") || ""),
          email: String(fd.get("email") || ""),
          website: String(fd.get("website") || ""),
        }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (res.ok && body?.ok) {
        setState({ kind: "done", message: body.message || "Thanks. We'll be in touch." });
      } else {
        setState({ kind: "error", message: body?.message || FALLBACK_ERROR });
      }
    } catch {
      setState({ kind: "error", message: FALLBACK_ERROR });
    }
  }

  return (
    <div className="llxpay-cta">
      <div className="llxpay-buttons">
        <button
          type="button"
          className="btn primary"
          aria-expanded={open}
          aria-controls="llxpay-request"
          onClick={openForm}
        >
          Request access
        </button>
        <div className="llxpay-demo">
          <a
            className="btn secondary"
            href={LLX_PAY_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Try the demo
          </a>
          <small>testnet</small>
        </div>
      </div>

      {open && (
        <div id="llxpay-request" className="llxpay-form-wrap">
          {state.kind === "done" ? (
            <p className="llxpay-msg ok" role="status">
              {state.message}
            </p>
          ) : (
            <form className="llxpay-form" onSubmit={onSubmit} noValidate={false}>
              <label>
                <span>Company name</span>
                <input
                  ref={companyRef}
                  name="company"
                  type="text"
                  required
                  maxLength={120}
                  autoComplete="organization"
                />
              </label>
              <label>
                <span>Work email</span>
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  inputMode="email"
                />
              </label>
              {/* Honeypot: hidden from people and assistive tech. */}
              <div className="llxpay-hp" aria-hidden="true">
                <label>
                  Website
                  <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <button
                type="submit"
                className="btn primary"
                disabled={state.kind === "sending"}
              >
                {state.kind === "sending" ? "Sending…" : "Request access"}
              </button>
              {state.kind === "error" && (
                <p className="llxpay-msg err" role="alert">
                  {state.message}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
