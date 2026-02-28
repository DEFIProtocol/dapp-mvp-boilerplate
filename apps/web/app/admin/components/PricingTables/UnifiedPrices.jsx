'use client';

import { useState, useMemo } from 'react';
import { sortData, useTableSort, SORT_CONFIGS } from '@/utils/sortUtils';
import styles from './tables.module.css';

export default function UnifiedPrices({ prices }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 50;

    const { sortField, sortDirection, handleSort, getSortIndicator } = useTableSort(
        SORT_CONFIGS.unified.defaultField,
        SORT_CONFIGS.unified.defaultDirection
    );

    const filteredAndSorted = useMemo(() => {
        let filtered = prices;
        
        if (search) {
            const term = search.toLowerCase();
            filtered = prices.filter(p => 
                p.symbol.toLowerCase().includes(term) ||
                (p.name || '').toLowerCase().includes(term) ||
                (p.source || '').toLowerCase().includes(term)
            );
        }

        // Sort using utility
        return sortData(filtered, sortField, sortDirection, SORT_CONFIGS.unified);
    }, [prices, search, sortField, sortDirection]);

    const paginated = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAndSorted.slice(start, start + pageSize);
    }, [filteredAndSorted, page]);

    const totalPages = Math.ceil(filteredAndSorted.length / pageSize);

    const formatPrice = (price) => {
        if (!price) return '—';
        const num = parseFloat(price);
        if (num < 0.01) return num.toFixed(6);
        if (num < 1) return num.toFixed(4);
        if (num < 100) return num.toFixed(2);
        return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };

    const formatMarketCap = (cap) => {
        if (!cap) return '—';
        const num = parseFloat(cap);
        if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toLocaleString()}`;
    };

    const formatVolume = (vol) => {
        if (!vol) return '—';
        const num = parseFloat(vol);
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toLocaleString()}`;
    };

    const getChangeClass = (change) => {
        if (!change) return '';
        return parseFloat(change) >= 0 ? styles.positive : styles.negative;
    };

    const getRowClass = (source) => {
        switch(source) {
            case 'binance':
                return styles.binanceRow;
            case 'coinbase':
                return styles.coinbaseRow;
            case 'coinranking':
                return styles.coinrankingRow;
            default:
                return '';
        }
    };

    // Calculate stats
    const binanceCount = prices.filter(p => p.source === 'binance').length;
    const coinbaseCount = prices.filter(p => p.source === 'coinbase').length;
    const coinrankingCount = prices.filter(p => p.source === 'coinranking').length;

    return (
        <div className={styles.tableContainer}>
            {/* Unified Stats */}
            <div className={styles.unifiedStats}>
                <div className={styles.unifiedStatItem}>
                    <span className={`${styles.sourceDot} ${styles.binance}`} />
                    <span className={styles.unifiedStatLabel}>Binance</span>
                    <span className={styles.unifiedStatValue}>{binanceCount}</span>
                </div>
                <div className={styles.unifiedStatItem}>
                    <span className={`${styles.sourceDot} ${styles.coinbase}`} />
                    <span className={styles.unifiedStatLabel}>Coinbase</span>
                    <span className={styles.unifiedStatValue}>{coinbaseCount}</span>
                </div>
                <div className={styles.unifiedStatItem}>
                    <span className={`${styles.sourceDot} ${styles.coinranking}`} />
                    <span className={styles.unifiedStatLabel}>Coinranking</span>
                    <span className={styles.unifiedStatValue}>{coinrankingCount}</span>
                </div>
                <div className={styles.unifiedStatItem}>
                    <span className={styles.unifiedStatLabel}>Total</span>
                    <span className={styles.unifiedStatValue}>{prices.length}</span>
                </div>
                <div className={styles.unifiedStatItem}>
                    <span className={styles.unifiedStatLabel}>Showing</span>
                    <span className={styles.unifiedStatValue}>{filteredAndSorted.length}</span>
                </div>
            </div>

            <div className={styles.tableControls}>
                <div className={styles.searchWrapper}>
                    <input
                        type="text"
                        placeholder="Search by symbol, name, or source..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className={styles.searchInput}
                    />
                </div>
                
                <div className={styles.pagination}>
                    <button 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        ← Prev
                    </button>
                    <span className={styles.pageInfo}>{page} / {totalPages}</span>
                    <button 
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                    >
                        Next →
                    </button>
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={`${styles.pricingTable} ${styles.unifiedTable}`}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('symbol')} className={styles.sortable}>
                                Symbol {getSortIndicator('symbol')}
                            </th>
                            <th onClick={() => handleSort('name')} className={styles.sortable}>
                                Name {getSortIndicator('name')}
                            </th>
                            <th onClick={() => handleSort('price')} className={styles.sortable}>
                                Price {getSortIndicator('price')}
                            </th>
                            <th onClick={() => handleSort('change')} className={styles.sortable}>
                                24h Change {getSortIndicator('change')}
                            </th>
                            <th onClick={() => handleSort('marketCap')} className={styles.sortable}>
                                Market Cap {getSortIndicator('marketCap')}
                            </th>
                            <th onClick={() => handleSort('volume')} className={styles.sortable}>
                                24h Volume {getSortIndicator('volume')}
                            </th>
                            <th onClick={() => handleSort('source')} className={styles.sortable}>
                                Source {getSortIndicator('source')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((item, index) => {
                            const change = parseFloat(item.change24h || item.priceChangePercent || item.change) || 0;
                            const rowClass = getRowClass(item.source);
                            
                            return (
                                <tr key={`${item.symbol}-${item.source}-${index}`} className={rowClass}>
                                    <td className={styles.symbolCell}>
                                        <strong>{item.symbol}</strong>
                                    </td>
                                    <td>{item.name || item.symbol}</td>
                                    <td className={styles.priceCell}>
                                        ${formatPrice(item.price)}
                                    </td>
                                    <td className={getChangeClass(change)}>
                                        {change !== 0 ? (
                                            <>
                                                {change >= 0 ? '▲' : '▼'} 
                                                {Math.abs(change).toFixed(2)}%
                                            </>
                                        ) : '—'}
                                    </td>
                                    <td className={styles.marketCapCell}>
                                        {formatMarketCap(item.marketCap)}
                                    </td>
                                    <td className={styles.volumeCell}>
                                        {formatVolume(item.volume24h || item.volume)}
                                    </td>
                                    <td>
                                        <span className={`${styles.sourceBadge} ${styles[item.source]}`}>
                                            {item.source}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {paginated.length === 0 && (
                            <tr>
                                <td colSpan="7" className={styles.noResults}>
                                    No prices found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className={styles.tableFooter}>
                <div className={styles.resultsInfo}>
                    Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, filteredAndSorted.length)} of {filteredAndSorted.length} prices
                </div>
            </div>
        </div>
    );
}