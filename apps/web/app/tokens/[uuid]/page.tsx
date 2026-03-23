// app/tokens/[uuid]/page.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTokens } from "@/contexts/TokenContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useChainContext } from "@/contexts/ChainContext";
import { useUserContext } from "@/contexts/UserContext";
import { useKlinesStore } from "@/hooks/candles/useKlineStore";
import { Check, Plus, Star, ArrowLeft, ExternalLink, Copy, RefreshCw } from "lucide-react";
import styles from "./TokenDetails.module.css";
import { UnifiedPriceChart } from "../../src/components/charts/UnifiedPriceChart";
import MarketOrder from "./components/MarketOrder";

// Format large numbers
const formatNumber = (num: number | null | undefined): string => {
  if (!num) return '--';
  const n = parseFloat(String(num));
  if (isNaN(n)) return '--';

  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
};

const formatPrice = (price: number | null | undefined): string => {
  if (!price) return '$0.00';
  const num = parseFloat(String(price));
  if (isNaN(num)) return '$0.00';

  if (num >= 1) {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (num >= 0.01) {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
};

interface TokenDetails {
  uuid: string;
  name: string;
  symbol: string;
  description?: string;
  iconUrl?: string;
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  change24h: number | null;
  rank: number | null;
  website?: string;
  addresses?: Record<string, string>;
  decimals?: number;
}

export default function TokenDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const uuid = params.uuid as string;
  
  const { tokens, loading: tokensLoading } = useTokens();
  const { priceMap } = usePriceStore();
  const { selectedChain, getChainLabel } = useChainContext();
  const { isInWatchlist, toggleWatchlistToken } = useUserContext();
  
  const [timePeriod, setTimePeriod] = useState('24h');
  const [copied, setCopied] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get token data from context
  const tokenData = useMemo(() => {
    if (!tokens || !uuid) return null;
    return tokens.find(token => token.uuid === uuid);
  }, [tokens, uuid]);

  // Get price data from price store
  const priceData = useMemo(() => {
    if (!tokenData?.symbol) return null;
    return priceMap[tokenData.symbol.toUpperCase()];
  }, [priceMap, tokenData]);

  // Combined token details
  const combinedData = useMemo<TokenDetails | null>(() => {
    if (!tokenData) return null;

    return {
      uuid: tokenData.uuid || uuid,
      name: tokenData.name || tokenData.symbol || 'Unknown',
      symbol: tokenData.symbol || 'N/A',
      description: tokenData.description,
      iconUrl: tokenData.image,
      price: priceData?.price ?? tokenData.price ?? null,
      marketCap: priceData?.marketCap ?? tokenData.marketCap ?? null,
      volume24h: tokenData.volume24h ?? null,
      change24h: priceData?.change24h ?? tokenData.change ?? null,
      rank: tokenData.rank ?? null,
      website: tokenData.website,
      addresses: tokenData.addresses || tokenData.chains,
      decimals: tokenData.decimals,
    };
  }, [tokenData, priceData, uuid]);

  // Chart data from klines store
  const timeframeMap: Record<string, string> = {
    '1h': '1h',
    '4h': '4h',
    '24h': '1d',
    '7d': '1d',
    '30d': '1d'
  };

  const { 
    data: candles, 
    loading: chartLoading, 
    exchange 
  } = useKlinesStore(combinedData?.symbol || 'BTC', {
    interval: timeframeMap[timePeriod] || '1h',
    limit: 500
  });

  const percentChange = combinedData?.change24h || 0;
  const isPositiveChange = percentChange >= 0;
  const isWatchlisted = combinedData ? isInWatchlist(combinedData) : false;

  const handleCopy = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Trigger refresh logic here
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  if (tokensLoading && !combinedData) {
    return (
      <div className={styles.page}>
        <div className={styles.gradientBg} />
        <main className={styles.main}>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
            <p>Loading token details...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!combinedData) {
    return (
      <div className={styles.page}>
        <div className={styles.gradientBg} />
        <main className={styles.main}>
          <div className={styles.errorContainer}>
            <p>Unable to load token details</p>
            <button onClick={() => router.push('/tokens')} className={styles.backButton}>
              ← Back to Tokens
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.gradientBg} />
      <main className={styles.main}>
        {/* Back Button */}
        <button onClick={() => router.push('/tokens')} className={styles.backButton}>
          <ArrowLeft size={18} />
          <span>Back to Tokens</span>
        </button>

        {/* Token Header */}
        <div className={styles.tokenHeader}>
          <div className={styles.tokenHero}>
            <div className={styles.tokenIconWrapper}>
              {combinedData.iconUrl ? (
                <img 
                  src={combinedData.iconUrl} 
                  alt={combinedData.name} 
                  className={styles.tokenIcon}
                />
              ) : (
                <div className={styles.tokenIconFallback}>
                  {combinedData.symbol.slice(0, 1)}
                </div>
              )}
            </div>

            <div className={styles.tokenInfo}>
              <div className={styles.tokenTitle}>
                <h1 className={styles.tokenName}>{combinedData.name}</h1>
                <span className={styles.tokenSymbol}>{combinedData.symbol}</span>
                {combinedData.rank && (
                  <span className={styles.tokenRank}>Rank #{combinedData.rank}</span>
                )}
              </div>

              <div className={`${styles.priceSection} ${isPositiveChange ? styles.positive : styles.negative}`}>
                <div className={styles.currentPrice}>
                  <span className={styles.priceLabel}>Current Price</span>
                  <span className={styles.priceValue}>{formatPrice(combinedData.price)}</span>
                </div>
                <div className={styles.priceChange}>
                  <span className={styles.changeBadge}>
                    {isPositiveChange ? '+' : ''}{percentChange.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.tokenActions}>
              <button
                className={`${styles.watchlistButton} ${isWatchlisted ? styles.added : ''}`}
                onClick={() => toggleWatchlistToken(combinedData)}
              >
                {isWatchlisted ? <Check size={18} /> : <Plus size={18} />}
                <span>{isWatchlisted ? 'Added' : 'Watchlist'}</span>
              </button>
              
              <button 
                className={styles.refreshButton}
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw size={16} className={isRefreshing ? styles.spinning : ''} />
                <span>Refresh</span>
              </button>

              {combinedData.website && (
                <a
                  href={combinedData.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.websiteButton}
                >
                  <ExternalLink size={16} />
                  <span>Website</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <label>Market Cap</label>
            <span className={styles.statValue}>${formatNumber(combinedData.marketCap)}</span>
            <span className={styles.statUnit}>USD</span>
          </div>

          <div className={styles.statCard}>
            <label>24h Volume</label>
            <span className={styles.statValue}>${formatNumber(combinedData.volume24h)}</span>
            <span className={styles.statUnit}>USD</span>
          </div>

          <div className={styles.statCard}>
            <label>24h Change</label>
            <span className={`${styles.statValue} ${isPositiveChange ? styles.positiveText : styles.negativeText}`}>
              {isPositiveChange ? '+' : ''}{percentChange.toFixed(2)}%
            </span>
            <span className={styles.statUnit}>USD</span>
          </div>
        </div>

        {/* Chart + Order Grid */}
        <div className={styles.chartOrderGrid}>
          <div className={styles.chartPanel}>
            <UnifiedPriceChart 
              candles={candles}
              symbol={combinedData.symbol}
              exchange={exchange || "Loading"}
              onTimeframeChange={setTimePeriod}
              selectedTimeframe={timePeriod}
              isLoading={chartLoading}
              height={450}
            />
          </div>
          <div className={styles.orderPanel}>
            <h3 className={styles.orderPanelTitle}>Market Order</h3>
            <MarketOrder
              usdPrice={combinedData.price}
              tokenName={combinedData.name}
              symbol={combinedData.symbol}
              decimals={combinedData.decimals || 18}
            />
          </div>
        </div>

        {/* Description Section */}
        {combinedData.description && (
          <div className={styles.descriptionCard}>
            <h3>About {combinedData.name}</h3>
            <div className={styles.descriptionText}>
              {combinedData.description}
            </div>
          </div>
        )}

        {/* Network Addresses Section */}
        {combinedData.addresses && Object.keys(combinedData.addresses).length > 0 && (
          <div className={styles.addressesCard}>
            <h3>Network Addresses</h3>
            <div className={styles.addressesList}>
              {Object.entries(combinedData.addresses).map(([network, address]) => (
                <div key={network} className={styles.addressItem}>
                  <span className={styles.networkLabel}>{network}</span>
                  <code className={styles.addressValue} title={address}>
                    {address}
                  </code>
                  <button
                    className={styles.copyButton}
                    onClick={() => handleCopy(address, network)}
                  >
                    {copied === network ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}