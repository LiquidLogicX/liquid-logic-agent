/**
 * $LLX contract on Virtuals (Base). Leave NEXT_PUBLIC_LLX_CONTRACT empty
 * until the address is provided — the homepage then renders nothing for it.
 */
export function llxContractAddress(): string | null {
  const raw = (process.env.NEXT_PUBLIC_LLX_CONTRACT ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return null;
  }
  return raw;
}
