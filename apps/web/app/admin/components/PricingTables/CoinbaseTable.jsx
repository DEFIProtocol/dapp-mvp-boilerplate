'use client';

import { useState, useMemo } from 'react';
import { sortData, useTableSort, SORT_CONFIGS } from '@/utils/sortUtils';
import styles from './tables.module.css';

export default function CoinbaseTable({ prices }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [showVolume, setShowVolume] = useState(false);
    const pageSize = 50;

    const { sortField, sortDirection, handleSort, getSortIndicator } = useTableSort(
        SORT_CONFIGS.coinbase.defaultField,
        SORT_CONFIGS.coinbase.defaultDirection
    );

    const filteredAndSorted = useMemo(() => {
        let filtered = prices;
        
        if (search) {
            const term = search.toLowerCase();
            filtered = prices.filter(p => 
                p.symbol.toLowerCase().includes(term) ||
                p.name?.toLowerCase().includes(term)
            );
        }

        // Sort using utility
        return sortData(filtered, sortField, sortDirection, SORT_CONFIGS.coinbase);
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

    const getChangeClass = (change) => {
        if (!change) return '';
        return parseFloat(change) >= 0 ? styles.positive : styles.negative;
    };

    // Calculate WebSocket stats
    const wsCount = prices.filter(p => p.source === 'coinbase-ws').length;
    const restCount = prices.filter(p => p.source === 'coinbase-rest').length;
    const wsConnected = wsCount > 0;

    return (
        <div className={styles.tableContainer}>
            {/* Coinbase Stats */}
            <div className={styles.coinbaseStats}>
                <div className={styles.coinbaseStatItem}>
                    <span className={`${styles.wsIndicator} ${wsConnected ? styles.connected : styles.disconnected}`} />
                    <span className={styles.coinbaseStatLabel}>WebSocket</span>
                    <span className={styles.coinbaseStatValue}>{wsConnected ? 'Live' : 'Disconnected'}</span>
                </div>
                <div className={styles.coinbaseStatItem}>
                    <span className={styles.coinbaseStatLabel}>Live Pairs</span>
                    <span className={styles.coinbaseStatValue}>{wsCount}</span>
                </div>
                <div className={styles.coinbaseStatItem}>
                    <span className={styles.coinbaseStatLabel}>REST Pairs</span>
                    <span className={styles.coinbaseStatValue}>{restCount}</span>
                </div>
                <div className={styles.coinbaseStatItem}>
                    <span className={styles.coinbaseStatLabel}>Total</span>
                    <span className={styles.coinbaseStatValue}>{prices.length}</span>
                </div>
            </div>

            <div className={styles.tableControls}>
                <div className={styles.searchWrapper}>
                    <input
                        type="text"
                        placeholder="Search by symbol or name..."
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
                <table className={`${styles.pricingTable} ${styles.coinbaseTable}`}>
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
                            <th onClick={() => handleSort('change24h')} className={styles.sortable}>
                                24h Change {getSortIndicator('change24h')}
                            </th>
                            {showVolume && (
                                <th onClick={() => handleSort('volume')} className={styles.sortable}>
                                    24h Volume {getSortIndicator('volume')}
                                </th>
                            )}
                            <th>Pair</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((item) => {
                            const isWebSocket = item.source === 'coinbase-ws';
                            return (
                                <tr key={item.symbol} className={styles.coinbaseRow}>
                                    <td className={styles.symbolCell}>
                                        <strong>{item.symbol}</strong>
                                    </td>
                                    <td>{item.name || item.symbol}</td>
                                    <td className={styles.priceCell}>
                                        ${parseFloat(item.price).toFixed(4)}
                                    </td>
                                    <td className={getChangeClass(item.change24h)}>
                                        {item.change24h ? (
                                            <>
                                                {parseFloat(item.change24h) >= 0 ? '▲' : '▼'} 
                                                {Math.abs(parseFloat(item.change24h)).toFixed(2)}%
                                            </>
                                        ) : '—'}
                                    </td>
                                    {showVolume && (
                                        <td className={styles.volumeCell}>
                                            {formatVolume(item.volume24h)}
                                        </td>
                                    )}
                                    <td className={styles.pairCell}>{item.pair}</td>
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
                                    No Coinbase prices found
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