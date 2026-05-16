const API_BASE = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '') + '/api';

export interface SupportedToken {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface TransferQuoteInput {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  slippage?: number;
}

export interface TransferQuoteResponse {
  success: boolean;
  quote?: {
    id?: string;
    tool?: string;
    action?: any;
    estimate?: {
      toAmount?: string;
      toAmountMin?: string;
      gasCosts?: Array<{ amountUSD?: string }>;
      feeCosts?: Array<{ amountUSD?: string }>;
    };
    transactionRequest?: {
      to: string;
      data?: string;
      value?: string;
      gasLimit?: string;
      gasPrice?: string;
    };
    includedSteps?: any[];
  };
  raw?: any;
  error?: string;
}

export interface TransferExecuteResponse {
  success: boolean;
  executionType?: "wallet-transaction";
  transactionRequest?: {
    to: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
  };
  fallbackUrl?: string;
  error?: string;
}

export interface PaperTradingStatusResponse {
  success: boolean;
  chainId?: number;
  status?: {
    eligibleNow: boolean;
    nextEligibleAt: string | null;
    lastGrantAt: string | null;
    grantCount: number;
    lastGrantTxHash: string | null;
    lastGrantChainId: number | null;
    challengeExpiresAt: string | null;
  };
  error?: string;
}

export interface PaperTradingChallengeResponse {
  success: boolean;
  chainId?: number;
  expiresAt?: string;
  challenge?: string;
  error?: string;
}

export interface PaperTradingGrantResponse {
  success: boolean;
  chainId?: number;
  walletAddress?: string;
  amount?: string;
  usdcTxHash?: string;
  ethTxHash?: string | null;
  ethDripError?: string | null;
  status?: PaperTradingStatusResponse["status"];
  nextEligibleAt?: string;
  error?: string;
}

export async function getSupportedTokens(chainId: number): Promise<SupportedToken[]> {
  const response = await fetch(`${API_BASE}/1inch/tokens?chainId=${chainId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch chain tokens");
  }

  const payload = await response.json();
  const tokenMap = payload?.data?.tokens || payload?.data || payload?.tokens || {};

  if (!tokenMap || typeof tokenMap !== "object") {
    return [];
  }

  return Object.values(tokenMap)
    .map((token: any) => ({
      address: token.address as `0x${string}`,
      symbol: token.symbol,
      name: token.name,
      decimals: Number(token.decimals ?? 18),
      logoURI: token.logoURI,
    }))
    .filter((token: SupportedToken) => Boolean(token.address && token.symbol));
}

export async function quoteTransfer(input: TransferQuoteInput): Promise<TransferQuoteResponse> {
  const response = await fetch(`${API_BASE}/transfers/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as TransferQuoteResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Failed to quote transfer");
  }

  return payload;
}

export async function executeTransfer(quote: any): Promise<TransferExecuteResponse> {
  const response = await fetch(`${API_BASE}/transfers/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quote }),
  });

  const payload = (await response.json()) as TransferExecuteResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Failed to prepare transfer execution");
  }

  return payload;
}

export async function createCoinbasePaySession(input: {
  amount: number;
  asset: string;
  walletAddress: string;
  chain: string;
}): Promise<{ paymentUrl: string; session: any; sessionToken?: string }> {
  let response = await fetch(`${API_BASE}/coinbase-onramp/create-session-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amount,
      asset: input.asset,
      walletAddress: input.walletAddress,
      blockchains: [input.chain],
      redirectUrl: typeof window !== "undefined" ? window.location.origin : undefined,
    }),
  });

  if (response.status === 404) {
    response = await fetch(`${API_BASE}/coinbase-onramp/create-pay-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: input.amount,
        asset: input.asset,
        walletAddress: input.walletAddress,
        chain: input.chain,
      }),
    });
  }

  const payload = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || payload.message || "Failed to create Coinbase Pay session");
  }

  const sessionToken = payload.sessionToken as string | undefined;
  const fallbackSessionToken = payload?.session?.sessionId as string | undefined;
  const basePaymentUrl = payload.paymentUrl as string | undefined;
  const effectiveSessionToken = sessionToken || fallbackSessionToken;
  const paymentUrl = effectiveSessionToken
    ? `https://pay.coinbase.com/buy/select-asset?sessionToken=${encodeURIComponent(effectiveSessionToken)}`
    : basePaymentUrl;

  if (!paymentUrl) {
    throw new Error("Failed to create Coinbase Pay session URL");
  }

  return {
    paymentUrl,
    session: payload.session,
    sessionToken: effectiveSessionToken,
  };
}

export async function getPaperTradingStatus(walletAddress: string, chainId: number): Promise<PaperTradingStatusResponse> {
  const response = await fetch(`${API_BASE}/paper-trading/faucet/status/${walletAddress}?chainId=${chainId}`, {
    cache: "no-store",
  });

  const payload = (await response.json()) as PaperTradingStatusResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Failed to fetch paper trading status");
  }

  return payload;
}

export async function createPaperTradingChallenge(input: {
  walletAddress: string;
  chainId: number;
}): Promise<PaperTradingChallengeResponse> {
  const response = await fetch(`${API_BASE}/paper-trading/faucet/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as PaperTradingChallengeResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Failed to create paper trading challenge");
  }

  return payload;
}

export async function grantPaperTradingFunds(input: {
  walletAddress: string;
  chainId: number;
  signature: string;
}): Promise<PaperTradingGrantResponse> {
  const response = await fetch(`${API_BASE}/paper-trading/faucet/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as PaperTradingGrantResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || payload.nextEligibleAt || "Failed to grant paper trading funds");
  }

  return payload;
}
