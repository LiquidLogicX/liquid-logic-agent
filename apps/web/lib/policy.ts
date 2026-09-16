export type SpendingPolicy = {
  walletAddress?: string;
  allowlist?: string[];
  maxPerPaymentUsdc?: string;
  dailyCapUsdc?: string;
  network?: string;
  asset?: string;
  spentWindow?: string;
  note?: string;
};

export function networkLabel(network?: string): string {
  if (network === "eip155:8453") return "Base mainnet";
  if (network === "eip155:84532") return "Base Sepolia";
  return network ?? "—";
}

export async function fetchPolicy(base = ""): Promise<SpendingPolicy | null> {
  const bust = `t=${Date.now()}`;
  const res = await fetch(`${base}/policy.json?${bust}`, {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!res.ok) return null;
  return (await res.json()) as SpendingPolicy;
}
