
import { Suspense } from 'react';
import BinanceTable from './PricingTables/BinanceTable';
import CoinbaseTable from './PricingTables/CoinbaseTable';
import CoinrankingTable from './PricingTables/CoinrankingTable';
import UnifiedPrices from './PricingTables/UnifiedPrices';
import './styles/PricingManager.module.css';

async function fetchPricingData() {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    console.log('Fetching from:', baseUrl); // Debug log
    
    try {
        const [unified, binance, coinbase, coinranking] = await Promise.all([
            fetch(`${baseUrl}/api/prices`).then(async r => {
                if (!r.ok) throw new Error(`Unified prices: ${r.status}`);
                return r.json();
            }),
            fetch(`${baseUrl}/api/binance/prices`).then(async r => {
                if (!r.ok) throw new Error(`Binance: ${r.status}`);
                return r.json();
            }),
            fetch(`${baseUrl}/api/coinbase/prices`).then(async r => {
                if (!r.ok) throw new Error(`Coinbase: ${r.status}`);
                return r.json();
            }),
            fetch(`${baseUrl}/api/coinranking/coins?limit=1200`).then(async r => {
                if (!r.ok) throw new Error(`Coinranking: ${r.status}`);
                return r.json();
            })
        ]);

        return {
            unified: unified.data || [],
            binance: binance.data || [],
            coinbase: coinbase.data || [],
            coinranking: coinranking.data?.coins || []
        };
    } catch (error) {
        console.error('Error fetching pricing data:', error);
        // Return empty data instead of throwing
        return {
            unified: [],
            binance: [],
            coinbase: [],
            coinranking: [],
            error: error.message
        };
    }
}

export default async function PricingManager() {
    const data = await fetchPricingData();
    
    // Show error state if fetch failed
    if (data.error) {
        return (
            <div className="error-state">
                <h3>Error Loading Pricing Data</h3>
                <p>{data.error}</p>
                <p>Make sure your backend server is running at {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}</p>
            </div>
        );
    }

    return (
        <div className="pricing-manager">
            {/* Header Stats */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Tokens</div>
                    <div className="stat-value">{data.unified.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Binance Pairs</div>
                    <div className="stat-value">{data.binance.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Coinbase Pairs</div>
                    <div className="stat-value">{data.coinbase.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Coinranking</div>
                    <div className="stat-value">{data.coinranking.length}</div>
                </div>
            </div>

            {/* Source Breakdown - only show if we have unified data */}
            {data.unified.length > 0 && (
                <div className="source-stats">
                    <h3>Price Source Breakdown</h3>
                    <div className="source-bars">
                        {['binance', 'coinbase', 'coinranking'].map(source => {
                            const count = data.unified.filter(p => p.source === source).length;
                            const percentage = ((count / data.unified.length) * 100).toFixed(1);
                            return (
                                <div key={source} className="source-bar-item">
                                    <div className="source-label">{source}</div>
                                    <div className="bar-container">
                                        <div 
                                            className={`bar ${source}`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                    <div className="source-count">{count} ({percentage}%)</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Unified Prices Table */}
            <div className="section">
                <div className="section-header">
                    <h3>Unified Prices (Hierarchy: Binance → Coinbase → Coinranking)</h3>
                    <div className="section-controls">
                        <span className="badge binance">Binance Priority</span>
                        <span className="badge coinbase">Coinbase Priority</span>
                        <span className="badge coinranking">Coinranking Base</span>
                    </div>
                </div>
                <Suspense fallback={<div>Loading unified prices...</div>}>
                    <UnifiedPrices prices={data.unified} />
                </Suspense>
            </div>

            {/* Individual Source Tables */}
            <div className="tables-grid">
                <div className="section">
                    <h3>Binance (Real-time WebSocket)</h3>
                    <Suspense fallback={<div>Loading...</div>}>
                        <BinanceTable prices={data.binance} />
                    </Suspense>
                </div>

                <div className="section">
                    <h3>Coinbase (Real-time WebSocket)</h3>
                    <Suspense fallback={<div>Loading...</div>}>
                        <CoinbaseTable prices={data.coinbase} />
                    </Suspense>
                </div>

                <div className="section full-width">
                    <h3>Coinranking (Base - 1200+ tokens)</h3>
                    <Suspense fallback={<div>Loading...</div>}>
                        <CoinrankingTable coins={data.coinranking} />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}