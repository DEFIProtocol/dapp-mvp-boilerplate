'use client';

import { useState, useMemo } from 'react';
import { sortData, useTableSort, SORT_CONFIGS } from '@/utils/sortUtils';
import styles from './tables.module.css';

export default function BinanceTable({ prices }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [showVolume, setShowVolume] = useState(false);
    const pageSize = 50;

    const { sortField, sortDirection, handleSort, getSortIndicator } = useTableSort(
        SORT_CONFIGS.binance.defaultField,
        SORT_CONFIGS.binance.defaultDirection
    );

    const filteredAndSorted = useMemo(() => {
        let filtered = prices;
        
        if (search) {
            const term = search.toLowerCase();
            filtered = prices.filter(p => 
                p.symbol.toLowerCase().includes(term) ||
                p.baseAsset?.toLowerCase().includes(term) ||
                p.quoteAsset?.toLowerCase().includes(term)
            );
        }

        // Sort using utility
        return sortData(filtered, sortField, sortDirection, SORT_CONFIGS.binance);
    }, [prices, search, sortField, sortDirection]);

    const paginated = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAndSorted.slice(start, start + pageSize);
    }, [filteredAndSorted, page]);

    const totalPages = Math.ceil(filteredAndSorted.length / pageSize);

    const formatVolume = (volume) => {
        if (!volume) return '—';
        const num = parseFloat(volume);
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
        return `$${num.toFixed(2)}`;
    };

    const formatPrice = (price) => {
        if (!price) return '—';
        const num = parseFloat(price);
        if (num < 0.01) return num.toFixed(6);
        if (num < 1) return num.toFixed(4);
        if (num < 100) return num.toFixed(2);
        return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };

    const getChangeClass = (change) => {
        if (!change) return '';
        return parseFloat(change) >= 0 ? styles.positive : styles.negative;
    };

    // Calculate WebSocket stats
    const wsCount = prices.filter(p => p.source === 'binance-ws').length;
    const restCount = prices.filter(p => p.source === 'binance-rest').length;
    const wsConnected = wsCount > 0;

    // Calculate average 24h change
    const avgChange = prices.reduce((acc, p) => {
        const change = parseFloat(p.priceChangePercent || p.change24h) || 0;
        return acc + change;
    }, 0) / (prices.length || 1);

    return (
        <div className={styles.tableContainer}>
            {/* Binance Stats */}
            <div className={styles.binanceStats}>
                <div className={styles.binanceStatItem}>
                    <span className={`${styles.wsIndicator} ${wsConnected ? styles.connected : styles.disconnected}`} />
                    <span className={styles.binanceStatLabel}>WebSocket</span>
                    <span className={styles.binanceStatValue}>{wsConnected ? 'Live' : 'Disconnected'}</span>
                </div>
                <div className={styles.binanceStatItem}>
                    <span className={styles.binanceStatLabel}>Live Pairs</span>
                    <span className={styles.binanceStatValue}>{wsCount}</span>
                </div>
                <div className={styles.binanceStatItem}>
                    <span className={styles.binanceStatLabel}>REST Pairs</span>
                    <span className={styles.binanceStatValue}>{restCount}</span>
                </div>
                <div className={styles.binanceStatItem}>
                    <span className={styles.binanceStatLabel}>Total Pairs</span>
                    <span className={styles.binanceStatValue}>{prices.length}</span>
                </div>
                <div className={styles.binanceStatItem}>
                    <span className={styles.binanceStatLabel}>Avg 24h Change</span>
                    <span className={avgChange >= 0 ? styles.positive : styles.negative}>
                        {avgChange >= 0 ? '▲' : '▼'} {Math.abs(avgChange).toFixed(2)}%
                    </span>
                </div>
            </div>

            <div className={styles.tableControls}>
                <div className={styles.searchWrapper}>
                    <input
                        type="text"
                        placeholder="Search symbol..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className={styles.searchInput}
                    />
                </div>
                
                <div className={styles.tableOptions}>
                    <button 
                        className={`${styles.toggleBtn} ${showVolume ? styles.active : ''}`}
                        onClick={() => setShowVolume(!showVolume)}
                    >
                        <span>📊</span> Volume
                    </button>
                    
                    <div className={styles.pagination}>
                        <button 
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            ←
                        </button>
                        <span className={styles.pageInfo}>{page} / {totalPages}</span>
                        <button 
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                        >
                            →
                        </button>
                    </div>
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={`${styles.pricingTable} ${styles.binanceTable}`}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('symbol')} className={styles.sortable}>
                                Symbol {getSortIndicator('symbol')}
                            </th>
                            <th onClick={() => handleSort('price')} className={styles.sortable}>
                                Price {getSortIndicator('price')}
                            </th>
                            <th onClick={() => handleSort('change24h')} className={styles.sortable}>
                                24h Change {getSortIndicator('change24h')}
                            </th>
                            {showVolume && (
                                <th onClick={() => handleSort('volume')} className={styles.sortable}>
                                    24h Volume {getSortIndicator('volume')}
                                </th>
                            )}
                            <th onClick={() => handleSort('high')} className={styles.sortable}>
                                24h High {getSortIndicator('high')}
                            </th>
                            <th onClick={() => handleSort('low')} className={styles.sortable}>
                                24h Low {getSortIndicator('low')}
                            </th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((item) => {
                            const change24h = parseFloat(item.priceChangePercent || item.change24h) || 0;
                            const isWebSocket = item.source === 'binance-ws';
                            
                            return (
                                <tr key={item.symbol} className={styles.binanceRow}>
                                    <td className={styles.symbolCell}>
                                        <strong>{item.symbol}</strong>
                                        {item.baseAsset && item.quoteAsset && (
                                            <div className={styles.pairInfo}>
                                                {item.baseAsset}/{item.quoteAsset}
                                            </div>
                                        )}
                                    </td>
                                    <td className={styles.priceCell}>
                                        ${formatPrice(item.price)}
                                    </td>
                                    <td className={getChangeClass(change24h)}>
                                        {change24h !== 0 ? (
                                            <>
                                                {change24h >= 0 ? '▲' : '▼'} 
                                                {Math.abs(change24h).toFixed(2)}%
                                            </>
                                        ) : '—'}
                                    </td>
                                    {showVolume && (
                                        <td className={styles.volumeCell}>
                                            {formatVolume(item.volume)}
                                        </td>
                                    )}
                                    <td className={styles.priceCell}>
                                        ${formatPrice(item.high24h)}
                                    </td>
                                    <td className={styles.priceCell}>
                                        ${formatPrice(item.low24h)}
                                    </td>
                                    <td>
                                        <div className={styles.sourceIndicator}>
                                            <span className={`${styles.sourceDot} ${isWebSocket ? styles.ws : styles.rest}`} />
                                            <span className={isWebSocket ? styles.wsText : styles.restText}>
                                                {isWebSocket ? 'WebSocket' : 'REST'}
                                            </span>
                                            {isWebSocket && <span className={styles.liveBadge}>● LIVE</span>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {paginated.length === 0 && (
                            <tr>
                                <td colSpan={showVolume ? 7 : 6} className={styles.noResults}>
                                    No Binance prices found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {filteredAndSorted.length > pageSize && (
                <div className={styles.tableFooter}>
                    <div className={styles.resultsInfo}>
                        Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, filteredAndSorted.length)} of {filteredAndSorted.length} pairs
                    </div>
                </div>
            )}
        </div>
    );
}