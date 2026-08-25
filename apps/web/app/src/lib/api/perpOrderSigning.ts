/**
 * EIP-712 order signing helpers for perpetual order placement.
 *
 * The on-chain SettlementEngine contract (deployed with
 * `EIP712("PerpSettlement", "1")`) verifies a real signature per order via
 * OrderLib.verifySignature before it will open a matched position. The
 * struct/typed-data shape below must match OrderLib.Order and its
 * ORDER_TYPEHASH exactly, or the signature will fail to recover the
 * trader's address on-chain and every match will revert.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

export type OnChainOrderSide = 0 | 1; // 0 = Long, 1 = Short

export type OrderSigningConfig = {
  chainId: number;
  perpEngine: string;
  settlementEngine: string;
  collateralToken: string;
};

export const ORDER_TYPES = {
  Order: [
    { name: "trader", type: "address" },
    { name: "side", type: "uint8" },
    { name: "exposure", type: "uint256" },
    { name: "limitPrice", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "marketId", type: "bytes32" },
  ],
} as const;

let cachedConfig: OrderSigningConfig | null = null;

/**
 * Fetch (and cache) the deployed SettlementEngine address + chain id needed
 * to build the EIP-712 domain. Cached in-memory for the lifetime of the page
 * so we don't re-fetch on every order submission.
 */
export async function getOrderSigningConfig(): Promise<OrderSigningConfig> {
  if (cachedConfig) return cachedConfig;

  const response = await fetch(`${API_BASE}/api/smart-contracts/orders/config`);
  if (!response.ok) {
    throw new Error(`Failed to load order signing config: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to load order signing config");
  }

  cachedConfig = {
    chainId: data.chainId,
    perpEngine: data.perpEngine,
    settlementEngine: data.settlementEngine,
    collateralToken: data.collateralToken,
  };

  return cachedConfig;
}

export function resolveMarketIdBytes32(symbol: string): `0x${string}` {
  // Mirrors backend resolveMarketId(): ethers.encodeBytes32String(`${SYMBOL}/USD`)
  const label = `${symbol.toUpperCase()}/USD`;
  const bytes = new TextEncoder().encode(label);
  if (bytes.length > 31) {
    throw new Error(`Symbol too long to encode as bytes32: ${symbol}`);
  }
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return `0x${Array.from(padded).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export type PerpOrderForSigning = {
  trader: `0x${string}`;
  side: OnChainOrderSide;
  exposure: bigint;
  limitPrice: bigint;
  expiry: bigint;
  nonce: bigint;
  marketId: `0x${string}`;
};

export function buildOrderDomain(config: OrderSigningConfig) {
  return {
    name: "PerpSettlement",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.settlementEngine as `0x${string}`,
  } as const;
}

/**
 * Build a fresh nonce for a new order. minValidNonce defaults to 0 per
 * trader on-chain and is only ever raised explicitly, so a monotonically
 * increasing millisecond timestamp is always valid and avoids collisions
 * between orders placed in quick succession.
 */
export function generateOrderNonce(): bigint {
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
}

/**
 * Default expiry: 10 minutes from now, in unix seconds (uint256 on-chain).
 */
export function generateOrderExpiry(secondsFromNow: number = 600): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + secondsFromNow);
}
