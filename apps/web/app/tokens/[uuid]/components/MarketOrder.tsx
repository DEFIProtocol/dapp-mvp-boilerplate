// app/tokens/[uuid]/components/MarketOrder.tsx
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { Settings, RefreshCw } from "lucide-react";
import { useChainContext } from "@/contexts/ChainContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useTokens } from "@/contexts/TokenContext";
import styles from "../TokenDetails.module.css";

interface MarketOrderProps {
  usdPrice: number | null;
  tokenName: string;
  symbol: string;
  decimals: number;
}

const nativePriceFallbacks: Record<string, number> = {
  'ETH': 2500,
  'BNB': 300,
  'MATIC': 0.7,
  'AVAX': 35,
  'SOL': 100
};

export default function MarketOrder({ usdPrice, tokenName, symbol, decimals }: MarketOrderProps) {
  const { address } = useAccount();
  const { selectedChain, getChainLabel, availableChains } = useChainContext();
  const { priceMap, refresh } = usePriceStore();
  const { tokens } = useTokens();
  
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(2.5);
  const [pricedIn, setPricedIn] = useState("usd");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const nativeSymbol = useMemo(() => {
    const chainMap: Record<string, string> = {
      '1': 'ETH', '10': 'ETH', '42161': 'ETH',
      '56': 'BNB', '137': 'MATIC', '43114': 'AVAX', '501': 'SOL'
    };
    return chainMap[String(selectedChain)] || 'ETH';
  }, [selectedChain]);

  const nativePrice = useMemo(() => {
    const price = priceMap[nativeSymbol.toUpperCase()];
    if (price?.price) return Number(price.price);
    return nativePriceFallbacks[nativeSymbol] || 0;
  }, [priceMap, nativeSymbol]);

  const tokenUsdPrice = useMemo(() => Number(usdPrice) || 0, [usdPrice]);
  const pricePerToken = nativePrice && tokenUsdPrice 
    ? (tokenUsdPrice / nativePrice).toFixed(6) 
    : '--';

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    refresh();
    setIsRefreshing(false);
  };

  const handleBuy = () => {
    if (!address) {
      alert("Please connect your wallet");
      return;
    }
    alert(`Buy ${amount} ${tokenName}`);
  };

  const handleSell = () => {
    if (!address) {
      alert("Please connect your wallet");
      return;
    }
    alert(`Sell ${amount} ${tokenName}`);
  };

  return (
    <div className={styles.orderContainer}>
      <div className={styles.orderControls}>
        <div className={styles.chainSelector}>
          <label>Select Chain</label>
          <select className={styles.chainSelect}>
            {availableChains?.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.pricingOptions}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="priceUnit"
              value="native"
              checked={pricedIn === 'native'}
              onChange={(e) => setPricedIn(e.target.value)}
            />
            <span>Priced in {nativeSymbol}</span>
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="priceUnit"
              value="usd"
              checked={pricedIn === 'usd'}
              onChange={(e) => setPricedIn(e.target.value)}
            />
            <span>Priced in USD</span>
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="priceUnit"
              value="token"
              checked={pricedIn === 'token'}
              onChange={(e) => setPricedIn(e.target.value)}
            />
            <span>Priced in {tokenName}</span>
          </label>
        </div>

        <div className={styles.settingsWrapper}>
          <button 
            className={styles.settingsButton}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings size={18} />
          </button>
          {showSettings && (
            <div className={styles.settingsDropdown}>
              <div className={styles.slippageSection}>
                <label>Slippage Tolerance</label>
                <div className={styles.slippageOptions}>
                  {[0.5, 2.5, 5].map((value) => (
                    <button
                      key={value}
                      className={`${styles.slippageOption} ${slippage === value ? styles.active : ''}`}
                      onClick={() => setSlippage(value)}
                    >
                      {value}%
                    </button>
                  ))}
                </div>
              </div>
              <button 
                className={styles.refreshPricesButton}
                onClick={handleRefreshPrices}
                disabled={isRefreshing}
              >
                <RefreshCw size={14} className={isRefreshing ? styles.spinning : ''} />
                Refresh Prices
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.priceInfo}>
        <div className={styles.priceInfoRow}>
          <span>{nativeSymbol} Price:</span>
          <span className={styles.priceValue}>${nativePrice?.toFixed(2) || '--'}</span>
        </div>
        <div className={styles.priceInfoRow}>
          <span>Token Price:</span>
          <span className={styles.priceValue}>{formatPrice(tokenUsdPrice)}</span>
        </div>
        <div className={styles.priceInfoRow}>
          <span>Price per Token:</span>
          <span className={styles.priceValue}>{pricePerToken} {nativeSymbol}</span>
        </div>
      </div>

      <input
        type="text"
        placeholder={`Enter amount in ${pricedIn === 'usd' ? 'USD' : pricedIn === 'native' ? nativeSymbol : tokenName}`}
        className={styles.amountInput}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <div className={styles.orderButtons}>
        <button 
          className={styles.buyButton}
          onClick={handleBuy}
          disabled={!amount || !address}
        >
          Buy
        </button>
        <button 
          className={styles.sellButton}
          onClick={handleSell}
          disabled={!amount || !address}
        >
          Sell
        </button>
      </div>
    </div>
  );
}

function formatPrice(price: number): string {
  if (!price) return '$0.00';
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}