import { useState, useEffect } from 'react';
import { useTokens } from '../contexts/TokenContext';

export function usePricingData() {
    const { tokens: tokenContextTokens, loading: tokensLoading } = useTokens();
    const [data, setData] = useState({
        unified: [],
        binance: [],
        coinbase: [],
        coinranking: [],
        error: null
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        
        async function fetchPricingData() {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            
            try {
                const [unifiedRes, binanceRes, coinbaseRes, coinrankingRes] = await Promise.all([
                    fetch(`${baseUrl}/api/prices`),
                    fetch(`${baseUrl}/api/binance/prices`),
                    fetch(`${baseUrl}/api/coinbase/prices`),
                    fetch(`${baseUrl}/api/coinranking/coins?limit=1200`)
                ]);

                if (!unifiedRes.ok) throw new Error(`Unified prices: ${unifiedRes.status}`);
                if (!binanceRes.ok) throw new Error(`Binance: ${binanceRes.status}`);
                if (!coinbaseRes.ok) throw new Error(`Coinbase: ${coinbaseRes.status}`);
                if (!coinrankingRes.ok) throw new Error(`Coinranking: ${coinrankingRes.status}`);

                const unifiedData = await unifiedRes.json();
                const binanceData = await binanceRes.json();
                const coinbaseData = await coinbaseRes.json();
                const coinrankingData = await coinrankingRes.json();

                if (isMounted) {
                    setData({
                        unified: unifiedData?.data || unifiedData || [],
                        binance: binanceData?.data || binanceData || [],
                        coinbase: coinbaseData?.data || coinbaseData || [],
                        coinranking: coinrankingData?.data?.coins || coinrankingData?.coins || coinrankingData?.data || [],
                        error: null
                    });
                }
            } catch (error) {
                console.error('Error fetching pricing data:', error);
                if (isMounted) {
                    setData({
                        unified: [],
                        binance: [],
                        coinbase: [],
                        coinranking: [],
                        error: error instanceof Error ? error.message : 'Unknown error occurred'
                    });
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        
        fetchPricingData();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // Safely get arrays
    const unifiedPrices = Array.isArray(data.unified) ? data.unified : [];
    const binancePrices = Array.isArray(data.binance) ? data.binance : [];
    const coinbasePrices = Array.isArray(data.coinbase) ? data.coinbase : [];
    const coinrankingCoins = Array.isArray(data.coinranking) ? data.coinranking : [];

    // Create symbol maps for quick lookup
    const binanceMap = new Map();
    binancePrices.forEach(item => {
        if (item.symbol) {
            binanceMap.set(item.symbol.toLowerCase(), item);
        }
    });

    const coinbaseMap = new Map();
    coinbasePrices.forEach(item => {
        if (item.symbol) {
            coinbaseMap.set(item.symbol.toLowerCase(), item);
        }
    });

    const coinrankingMap = new Map();
    coinrankingCoins.forEach(item => {
        if (item.symbol) {
            coinrankingMap.set(item.symbol.toLowerCase(), item);
        }
    });

    // Create unified comparison data
    const comparisonData = [];
    const allSymbols = new Set([
        ...binanceMap.keys(),
        ...coinbaseMap.keys(),
        ...coinrankingMap.keys()
    ]);

    allSymbols.forEach(symbol => {
        const binance = binanceMap.get(symbol);
        const coinbase = coinbaseMap.get(symbol);
        const coinranking = coinrankingMap.get(symbol);
        
        // Get token info from context if available
        const tokenInfo = tokenContextTokens?.find(
            t => t.symbol?.toLowerCase() === symbol.toLowerCase()
        );

        // Calculate price difference between Binance and Coinbase
        let priceDifference = null;
        let differencePercentage = null;
        
        if (binance?.price && coinbase?.price) {
            priceDifference = Math.abs(binance.price - coinbase.price);
            differencePercentage = ((Math.abs(binance.price - coinbase.price) / ((binance.price + coinbase.price) / 2)) * 100).toFixed(2);
        }

        // Get best available price change
        const priceChange = binance?.priceChangePercent || 
                           coinbase?.priceChangePercent || 
                           coinranking?.change;

        comparisonData.push({
            symbol: symbol.toUpperCase(),
            name: tokenInfo?.name || coinranking?.name || symbol.toUpperCase(),
            binancePrice: binance?.price || null,
            coinbasePrice: coinbase?.price || null,
            coinrankingPrice: coinranking?.price || null,
            priceChange: priceChange ? parseFloat(priceChange) : null,
            priceDifference,
            differencePercentage,
            marketCap: coinranking?.marketCap || null,
            volume24h: binance?.volume || coinbase?.volume || coinranking?.volume24h,
            source: {
                binance: !!binance,
                coinbase: !!coinbase,
                coinranking: !!coinranking
            }
        });
    });

    // Calculate coverage metrics
    const calculateCoverage = () => {
        if (!tokenContextTokens?.length || !unifiedPrices.length) {
            return {
                binance: { count: 0, percentage: '0' },
                coinbase: { count: 0, percentage: '0' },
                coinranking: { count: 0, percentage: '0' }
            };
        }

        const contextSymbols = new Set(
            tokenContextTokens.map(t => t.symbol?.toLowerCase()).filter(Boolean)
        );

        const binanceCoverage = [...contextSymbols].filter(symbol => 
            binanceMap.has(symbol)
        ).length;

        const coinbaseCoverage = [...contextSymbols].filter(symbol => 
            coinbaseMap.has(symbol)
        ).length;

        const coinrankingCoverage = [...contextSymbols].filter(symbol => 
            coinrankingMap.has(symbol)
        ).length;

        const totalTokens = contextSymbols.size;

        return {
            binance: {
                count: binanceCoverage,
                percentage: ((binanceCoverage / totalTokens) * 100).toFixed(1)
            },
            coinbase: {
                count: coinbaseCoverage,
                percentage: ((coinbaseCoverage / totalTokens) * 100).toFixed(1)
            },
            coinranking: {
                count: coinrankingCoverage,
                percentage: ((coinrankingCoverage / totalTokens) * 100).toFixed(1)
            }
        };
    };

    const coverage = calculateCoverage();

    return {
        loading: loading || tokensLoading,
        error: data.error,
        unifiedPrices,
        binancePrices,
        coinbasePrices,
        coinrankingCoins,
        comparisonData,
        coverage,
        tokenContextTokens
    };
}