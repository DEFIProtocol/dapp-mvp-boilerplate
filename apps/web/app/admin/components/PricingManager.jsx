"use client";
import React, { useState } from "react";
import { usePricingData } from "@/hooks/usePricingData";
import BinanceTable from './PricingTables/BinanceTable';
import CoinbaseTable from './PricingTables/CoinbaseTable';
import CoinrankingTable from './PricingTables/CoinrankingTable';
import UnifiedPrices from './PricingTables/UnifiedPrices';
import CompareTable from './PricingTables/CompareTable'; // Add this import
import styles from './styles/PricingManager.module.css';

export default function PricingManager() {
    const [activeView, setActiveView] = useState("unified");
    const {
        loading,
        error,
        unifiedPrices,
        binancePrices,
        coinbasePrices,
        coinrankingCoins,
        comparisonData,  // Add this
        coverage,
        tokenContextTokens
    } = usePricingData();

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner}></div>
                <div className={styles.loadingText}>Loading pricing data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorState}>
                <h3>⚠️ Error Loading Pricing Data</h3>
                <p>{error}</p>
                <p>Make sure your backend server is running at:</p>
                <code>{process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}</code>
                <button 
                    onClick={() => window.location.reload()} 
                    className={styles.retryButton}
                >
                    Retry
                </button>
            </div>
        );
    }

    const avgCoverage = (
        (parseFloat(coverage.binance.percentage) + 
         parseFloat(coverage.coinbase.percentage) + 
         parseFloat(coverage.coinranking.percentage)) / 3
    ).toFixed(1);

    return (
        <div className={styles.pricingManager}>
            {/* Header Stats */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Tokens (Unified)</div>
                    <div className={styles.statValue}>{unifiedPrices.length}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Token Context</div>
                    <div className={styles.statValue}>{tokenContextTokens?.length || 0}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Coverage Avg</div>
                    <div className={styles.statValue}>{avgCoverage}%</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Data Sources</div>
                    <div className={styles.statValue}>3</div>
                </div>
            </div>

            {/* Double Bar Charts */}
            {unifiedPrices.length > 0 && (
                <div className={styles.doubleChartSection}>
                    {/* Price Source Distribution Chart */}
                    <div className={styles.chartCard}>
                        <div className={styles.chartHeader}>
                            <h3>📊 Price Source Distribution</h3>
                            <span className={styles.chartSubtitle}>From Unified Prices</span>
                        </div>
                        <div className={styles.chartBars}>
                            {['binance', 'coinbase', 'coinranking'].map(source => {
                                const count = unifiedPrices.filter(p => p && p.source === source).length;
                                const percentage = unifiedPrices.length > 0 
                                    ? ((count / unifiedPrices.length) * 100).toFixed(1)
                                    : '0';
                                
                                return (
                                    <div key={source} className={styles.chartBarItem}>
                                        <div className={styles.chartBarLabel}>
                                            <span className={`${styles.sourceDot} ${styles[source]}`}></span>
                                            <span>{source.charAt(0).toUpperCase() + source.slice(1)}</span>
                                        </div>
                                        <div className={styles.chartBarContainer}>
                                            <div 
                                                className={`${styles.chartBar} ${styles[source]}`}
                                                style={{ width: `${percentage}%` }}
                                            >
                                                <span className={styles.chartBarValue}>{percentage}%</span>
                                            </div>
                                        </div>
                                        <div className={styles.chartBarCount}>{count} tokens</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Token Context Coverage Chart */}
                    <div className={styles.chartCard}>
                        <div className={styles.chartHeader}>
                            <h3>🎯 Token Context Coverage</h3>
                            <span className={styles.chartSubtitle}>
                                Of {tokenContextTokens?.length || 0} tracked tokens
                            </span>
                        </div>
                        <div className={styles.chartBars}>
                            {[
                                { source: 'binance', ...coverage.binance },
                                { source: 'coinbase', ...coverage.coinbase },
                                { source: 'coinranking', ...coverage.coinranking }
                            ].map(item => (
                                <div key={item.source} className={styles.chartBarItem}>
                                    <div className={styles.chartBarLabel}>
                                        <span className={`${styles.sourceDot} ${styles[item.source]}`}></span>
                                        <span>{item.source.charAt(0).toUpperCase() + item.source.slice(1)}</span>
                                    </div>
                                    <div className={styles.chartBarContainer}>
                                        <div 
                                            className={`${styles.chartBar} ${styles[item.source]}`}
                                            style={{ width: `${item.percentage}%` }}
                                        >
                                            <span className={styles.chartBarValue}>{item.percentage}%</span>
                                        </div>
                                    </div>
                                    <div className={styles.chartBarCount}>
                                        {item.count} / {tokenContextTokens?.length || 0} tokens
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* View Tabs */}
            <div className={styles.viewTabs}>
                <button
                    className={`${styles.viewTab} ${activeView === "unified" ? styles.active : ""}`}
                    onClick={() => setActiveView("unified")}
                >
                    📊 Unified View
                </button>
                <button
                    className={`${styles.viewTab} ${activeView === "binance" ? styles.active : ""}`}
                    onClick={() => setActiveView("binance")}
                >
                    🟡 Binance
                </button>
                <button
                    className={`${styles.viewTab} ${activeView === "coinbase" ? styles.active : ""}`}
                    onClick={() => setActiveView("coinbase")}
                >
                    🔵 Coinbase
                </button>
                <button
                    className={`${styles.viewTab} ${activeView === "coinranking" ? styles.active : ""}`}
                    onClick={() => setActiveView("coinranking")}
                >
                    💎 Coinranking
                </button>
                <button
                    className={`${styles.viewTab} ${activeView === "compare" ? styles.active : ""}`}
                    onClick={() => setActiveView("compare")}
                >
                    🔍 Compare
                </button>
            </div>

            {/* Content based on active view */}
            {activeView === "unified" && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3>Unified Prices</h3>
                        <div className={styles.sectionControls}>
                            <span className={`${styles.badge} ${styles.binance}`}>Binance Priority</span>
                            <span className={`${styles.badge} ${styles.coinbase}`}>Coinbase Priority</span>
                            <span className={`${styles.badge} ${styles.coinranking}`}>Coinranking Base</span>
                        </div>
                    </div>
                    {unifiedPrices.length > 0 ? (
                        <div className={styles.tableContainer}>
                            <UnifiedPrices prices={unifiedPrices} />
                        </div>
                    ) : (
                        <div className={styles.noData}>No unified price data available</div>
                    )}
                </div>
            )}

            {activeView === "binance" && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3>Binance</h3>
                        <span className={`${styles.badge} ${styles.binance}`}>Real-time WebSocket</span>
                    </div>
                    {binancePrices.length > 0 ? (
                        <div className={styles.tableContainer}>
                            <BinanceTable prices={binancePrices} />
                        </div>
                    ) : (
                        <div className={styles.noData}>No Binance data available</div>
                    )}
                </div>
            )}

            {activeView === "coinbase" && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3>Coinbase</h3>
                        <span className={`${styles.badge} ${styles.coinbase}`}>Real-time WebSocket</span>
                    </div>
                    {coinbasePrices.length > 0 ? (
                        <div className={styles.tableContainer}>
                            <CoinbaseTable prices={coinbasePrices} />
                        </div>
                    ) : (
                        <div className={styles.noData}>No Coinbase data available</div>
                    )}
                </div>
            )}

            {activeView === "coinranking" && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3>Coinranking</h3>
                        <span className={`${styles.badge} ${styles.coinranking}`}>Base Dataset (1200+ tokens)</span>
                    </div>
                    {coinrankingCoins.length > 0 ? (
                        <div className={styles.tableContainer}>
                            <CoinrankingTable coins={coinrankingCoins} />
                        </div>
                    ) : (
                        <div className={styles.noData}>No Coinranking data available</div>
                    )}
                </div>
            )}

            {activeView === "compare" && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3>Compare Datasets: Binance vs Coinbase</h3>
                        <div className={styles.sectionControls}>
                            <span className={`${styles.badge} ${styles.binance}`}>
                                {comparisonData?.filter(d => d.source.binance).length || 0} Binance
                            </span>
                            <span className={`${styles.badge} ${styles.coinbase}`}>
                                {comparisonData?.filter(d => d.source.coinbase).length || 0} Coinbase
                            </span>
                            <span className={`${styles.badge} ${styles.coinranking}`}>
                                {comparisonData?.filter(d => d.source.coinranking).length || 0} Coinranking
                            </span>
                        </div>
                    </div>
                    {comparisonData?.length > 0 ? (
                        <CompareTable data={comparisonData} />
                    ) : (
                        <div className={styles.noData}>No comparison data available</div>
                    )}
                </div>
            )}
        </div>
    );
}