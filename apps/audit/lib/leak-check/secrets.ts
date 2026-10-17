/**
 * Secret-looking input detector. Linear-time patterns only (no nested quantifiers,
 * no backreferences). Returns a boolean: it never returns or logs the match.
 */
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/,
  /\b(?:sk|pk|rk)[-_](?:live|test|proj|ant|or)?[-_]?[A-Za-z0-9]{16,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /(?:0x)?[0-9a-fA-F]{48,}/, // private keys, tx hashes, long hex blobs (a 40-hex wallet address is allowed)
  /[A-Za-z0-9+/_-]{40,}/, // long unbroken token-like run
  /\$\s?[0-9][0-9,]{3,}(?:\.[0-9]+)?/, // balances / amounts of $1,000 or more
];
const SECRET_KEY = /^(?:.*[-_ ])?(?:secret|password|passwd|passphrase|mnemonic|seed|api[-_ ]?key|private[-_ ]?key|auth[-_ ]?token|access[-_ ]?token|credential)s?$/i;

const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g; // public wallet addresses are labels, not secrets

export function looksSecret(raw: string): boolean {
  const s = raw.replace(ADDRESS, "0xADDR");
  for (const p of PATTERNS) if (p.test(s)) return true;
  return false;
}

/** Walk a parsed JSON value (iteratively, bounded depth) and test every key and string. */
export function containsSecretLike(root: unknown): boolean {
  const stack: { v: unknown; d: number }[] = [{ v: root, d: 0 }];
  let visited = 0;
  while (stack.length) {
    const { v, d } = stack.pop()!;
    if (++visited > 5000 || d > 12) return true; // pathological shape: treat as unsafe
    if (typeof v === "string") {
      if (looksSecret(v)) return true;
    } else if (Array.isArray(v)) {
      for (const x of v) stack.push({ v: x, d: d + 1 });
    } else if (typeof v === "object" && v !== null) {
      for (const [k, x] of Object.entries(v)) {
        if (SECRET_KEY.test(k) || looksSecret(k)) return true;
        stack.push({ v: x, d: d + 1 });
      }
    }
  }
  return false;
}
