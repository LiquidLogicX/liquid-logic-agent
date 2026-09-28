"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        window.prompt("Copy the contract address:", value);
        return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy the contract address:", value);
    }
  }

  return (
    <button type="button" className="copy" onClick={() => void onCopy()}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
