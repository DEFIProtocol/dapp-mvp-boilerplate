const API_BASE = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

export type FaucetClaimResponse = {
  success: boolean;
  address?: string;
  amount?: string;
  txHash?: string;
  error?: string;
  nextEligibleAt?: string;
};

/**
 * Claim testnet USDC. Fulfilled server-side via a plain transfer() from the
 * backend's own pre-funded treasury wallet - no wallet signature/popup is
 * requested on the client, which is what avoids the "malicious contract"
 * warning previously triggered by calling mint() directly from the user's
 * own wallet on a brand-new, unfamiliar contract.
 */
export async function claimFaucetFunds(address: string, chainId: number): Promise<FaucetClaimResponse> {
  const response = await fetch(`${API_BASE}/api/smart-contracts/faucet/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId, address }),
  });

  const data = (await response.json().catch(() => null)) as FaucetClaimResponse | null;

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `Failed to claim paper trading funds: ${response.status}`);
  }

  return data;
}

export async function getFaucetStatus(address: string): Promise<{
  success: boolean;
  eligible: boolean;
  nextEligibleAt?: string;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/smart-contracts/faucet/status/${address}`, {
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Failed to check faucet status: ${response.status}`);
  }

  return data;
}
