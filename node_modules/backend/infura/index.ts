import axios from "axios";
import { Pool } from "pg";

export interface HoldingsQuery {
  address?: string;
  chainId?: string;
}

export interface TokenRow {
  id?: number;
  uuid?: string;
  symbol?: string;
  address?: string;
  contract_address?: string;
  addresses?: any;
}

const formatUnits = (value: bigint, decimals: number, precision = 4): string => {
  if (decimals === 0) return value.toString();

  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, precision);

  return `${whole.toString()}.${fractionStr}`;
};

const normalizeAddress = (value?: string): string => {
  if (!value) return "";
  return value.toString().trim().toLowerCase();
};

const isValidEthAddress = (value?: string): boolean =>
  /^0x[a-f0-9]{40}$/i.test(value || "");

const padAddress = (address: string): string =>
  address.replace(/^0x/, "").padStart(64, "0");

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const HOLDINGS_CACHE_TTL_MS = parseInt(process.env.INFURA_HOLDINGS_TTL_MS || "300000", 10);
const holdingsCache = new Map<string, { timestamp: number; payload: any }>();

const chainConfig: Record<
  string,
  { network: string | null; key: string; nativeSymbol: string }
> = {
  "1": { network: "mainnet", key: "ethereum", nativeSymbol: "ETH" },
  "137": { network: "polygon-mainnet", key: "polygon", nativeSymbol: "MATIC" },
  "42161": { network: "arbitrum-mainnet", key: "arbitrum", nativeSymbol: "ETH" },
  "43114": { network: "avalanche-mainnet", key: "avalanche", nativeSymbol: "AVAX" },
  "56": { network: null, key: "bnb", nativeSymbol: "BNB" },
  "501": { network: null, key: "solana", nativeSymbol: "SOL" }
};

const getTokenAddressMeta = async (pool: Pool) => {
  try {
    const result = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'token_address'"
    );

    const columns = new Set(result.rows.map((row) => row.column_name));

    return {
      columns,
      tokenIdCol: columns.has("token_id") ? "token_id" : null,
      tokenSymbolCol: columns.has("token_symbol")
        ? "token_symbol"
        : columns.has("symbol")
        ? "symbol"
        : null,
      chainCol: columns.has("chain")
        ? "chain"
        : columns.has("network")
        ? "network"
        : null,
      addressCol: columns.has("address")
        ? "address"
        : columns.has("contract_address")
        ? "contract_address"
        : null
    };
  } catch {
    return {
      columns: new Set<string>(),
      tokenIdCol: null,
      tokenSymbolCol: null,
      chainCol: null,
      addressCol: null
    };
  }
};

const getTokenAddressesMap = async (pool: Pool) => {
  const meta = await getTokenAddressMeta(pool);
  const byTokenId = new Map<number, Record<string, string>>();
  const bySymbol = new Map<string, Record<string, string>>();

  if (!meta.chainCol || !meta.addressCol) {
    return { byTokenId, bySymbol, meta };
  }

  if (meta.tokenIdCol) {
    const query = `SELECT ${meta.tokenIdCol} AS token_id, ${meta.chainCol} AS chain, ${meta.addressCol} AS address FROM token_address`;
    const result = await pool.query(query);

    for (const row of result.rows) {
      if (row.token_id == null) continue;
      if (!byTokenId.has(row.token_id)) byTokenId.set(row.token_id, {});
      byTokenId.get(row.token_id)![row.chain] = row.address;
    }

    return { byTokenId, bySymbol, meta };
  }

  if (meta.tokenSymbolCol) {
    const query = `SELECT ${meta.tokenSymbolCol} AS symbol, ${meta.chainCol} AS chain, ${meta.addressCol} AS address FROM token_address`;
    const result = await pool.query(query);

    for (const row of result.rows) {
      const symbolKey = row.symbol ? row.symbol.toLowerCase() : null;
      if (!symbolKey) continue;
      if (!bySymbol.has(symbolKey)) bySymbol.set(symbolKey, {});
      bySymbol.get(symbolKey)![row.chain] = row.address;
    }

    return { byTokenId, bySymbol, meta };
  }

  return { byTokenId, bySymbol, meta };
};

const normalizeAddresses = (raw: any): Record<string, string> => {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
};

const getTokenAddressForChain = ({
  token,
  chainId,
  chainKey
}: {
  token: TokenRow;
  chainId: string;
  chainKey: string;
}) => {
  const addresses = normalizeAddresses(token?.addresses);

  return (
    addresses?.[chainId] ||
    addresses?.[chainKey] ||
    token?.address ||
    token?.contract_address ||
    null
  );
};

export const getHoldings = async (pool: Pool, query: HoldingsQuery) => {
  const { address, chainId } = query;

  const normalizedAddress = normalizeAddress(address);
  const chainKey = String(chainId || "1");

  if (!isValidEthAddress(normalizedAddress)) {
    throw new Error("Valid address is required");
  }

  const cacheKey = `${normalizedAddress}:${chainKey}`;
  const cached = holdingsCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < HOLDINGS_CACHE_TTL_MS) {
    return { ...cached.payload, cached: true };
  }

  const config = chainConfig[chainKey];
  if (!config || !config.network) {
    throw new Error(`Chain ${chainKey} not supported by Infura`);
  }

  const projectId = process.env.INFURA_PRIVATE_KEY;
  if (!projectId) {
    throw new Error("INFURA_PRIVATE_KEY is not configured");
  }

  const rpcUrl = `https://${config.network}.infura.io/v3/${projectId}`;

  const rpcCall = async (method: string, params: any[]) => {
    const response = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    });

    if (response.data?.error) {
      throw new Error(response.data.error.message || "RPC error");
    }

    return response.data?.result;
  };

  const balanceHex = await rpcCall("eth_getBalance", [normalizedAddress, "latest"]);
  const nativeBalance = balanceHex ? BigInt(balanceHex) : 0n;

  const tokensResult = await pool.query("SELECT * FROM tokens ORDER BY symbol");
  const tokens: TokenRow[] = tokensResult.rows || [];

  const addressMap = await getTokenAddressesMap(pool);

  const enrichedTokens = tokens.map((token) => {
    let addresses = {};

    if (addressMap.byTokenId.size && token.id != null) {
      addresses = addressMap.byTokenId.get(token.id) || {};
    } else if (addressMap.bySymbol.size && token.symbol) {
      addresses = addressMap.bySymbol.get(token.symbol.toLowerCase()) || {};
    }

    return { ...token, addresses };
  });

  const tokensWithAddress = enrichedTokens
    .map((token) => {
      const tokenAddress = getTokenAddressForChain({
        token,
        chainId: chainKey,
        chainKey: config.key
      });

      return {
        token,
        address: normalizeAddress(tokenAddress || "")
      };
    })
    .filter((item) => item.address && item.address.startsWith("0x"));

  const decimalsCache = new Map<string, number>();
  const holdings: any[] = [];
  const batches = chunkArray(tokensWithAddress, 8);

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async ({ token, address: tokenAddress }) => {
        const balanceData = `0x70a08231${padAddress(normalizedAddress)}`;
        const balanceResult = await rpcCall("eth_call", [
          { to: tokenAddress, data: balanceData },
          "latest"
        ]);

        if (!balanceResult) return null;

        const balanceValue = BigInt(balanceResult);
        if (balanceValue === 0n) return null;

        let decimals = decimalsCache.get(tokenAddress);
        if (decimals === undefined) {
          try {
            const decimalsResult = await rpcCall("eth_call", [
              { to: tokenAddress, data: "0x313ce567" },
              "latest"
            ]);
            decimals = decimalsResult ? parseInt(decimalsResult, 16) : 18;
          } catch {
            decimals = 18;
          }
          decimalsCache.set(tokenAddress, decimals);
        }

        return {
          symbol: token.symbol,
          uuid: token.uuid,
          address: tokenAddress,
          decimals,
          rawBalance: balanceValue.toString(),
          balance: formatUnits(balanceValue, decimals)
        };
      })
    );

    results.filter(Boolean).forEach((item) => holdings.push(item));
  }

  const payload = {
    chainId: chainKey,
    network: config.network,
    nativeSymbol: config.nativeSymbol,
    address: normalizedAddress,
    nativeBalance: {
      raw: nativeBalance.toString(),
      balance: formatUnits(nativeBalance, 18)
    },
    holdings,
    timestamp: Date.now()
  };

  holdingsCache.set(cacheKey, { timestamp: payload.timestamp, payload });

  return payload;
};