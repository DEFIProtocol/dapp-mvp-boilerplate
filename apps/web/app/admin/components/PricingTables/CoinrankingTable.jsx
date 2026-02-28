'use client';

import { useState, useMemo } from 'react';
import { sortData, useTableSort, SORT_CONFIGS } from '@/utils/sortUtils';
import styles from './tables.module.css';

export default function CoinrankingTable({ coins }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const pageSize = 100;

    const { sortField, sortDirection, handleSort, getSortIndicator } = useTableSort(
        SORT_CONFIGS.coinranking.defaultField,
        SORT_CONFIGS.coinranking.defaultDirection
    );

    const filteredAndSorted = useMemo(() => {
        let filtered = coins;
        
        // Text search
        if (search) {
            const term = search.toLowerCase();
            filtered = filtered.filter(c => 
                c.symbol?.toLowerCase().includes(term) ||
                c.name?.toLowerCase().includes(term)
            );
        }

        // Price range filter
        if (minPrice !== '') {
            filtered = filtered.filter(c => parseFloat(c.price) >= parseFloat(minPrice));
        }
        if (maxPrice !== '') {
            filtered = filtered.filter(c => parseFloat(c.price) <= parseFloat(maxPrice));
        }

        // Sort using utility
        return sortData(filtered, sortField, sortDirection, SORT_CONFIGS.coinranking);
    }, [coins, search, sortField, sortDirection, minPrice, maxPrice]);

    const paginated = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAndSorted.slice(start, start + pageSize);
    }, [filteredAndSorted, page]);

    const totalPages = Math.ceil(filteredAndSorted.length / pageSize);

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

    // Calculate stats
    const totalMarketCap = coins.reduce((acc, coin) => acc + (parseFloat(coin.marketCap) || 0), 0);
    const avgChange = coins.reduce((acc, coin) => acc + (parseFloat(coin.change) || 0), 0) / (coins.length || 1);

    return (
        <div className={styles.tableContainer}>
            {/* Coinranking Stats */}
            <div className={styles.coinrankingStats}>
                <div className={styles.coinrankingStatItem}>
                    <span className={styles.coinrankingStatLabel}>Total Coins</span>
                    <span className={styles.coinrankingStatValue}>{coins.length}</span>
                </div>
                <div className={styles.coinrankingStatItem}>
                    <span className={styles.coinrankingStatLabel}>Showing</span>
                    <span className={styles.coinrankingStatValue}>{filteredAndSorted.length}</span>
                </div>
                <div className={styles.coinrankingStatItem}>
                    <span className={styles.coinrankingStatLabel}>Avg 24h Change</span>
                    <span className={avgChange >= 0 ? styles.positive : styles.negative}>
                        {avgChange >= 0 ? '▲' : '▼'} {Math.abs(avgChange).toFixed(2)}%
                    </span>
                </div>
                <div className={styles.coinrankingStatItem}>
                    <span className={styles.coinrankingStatLabel}>Total Market Cap</span>
                    <span className={styles.coinrankingStatValue}>{formatMarketCap(totalMarketCap)}</span>
                </div>
            </div>

            <div className={styles.tableControls}>
                <div className={styles.searchFilters}>
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
                    
                    <div className={styles.priceFilters}>
                        <input
                            type="number"
                            placeholder="Min price $"
                            value={minPrice}
                            onChange={(e) => {
                                setMinPrice(e.target.value);
                                setPage(1);
                            }}
                            className={styles.priceInput}
                            step="0.01"
                            min="0"
                        />
                        <span className={styles.priceSeparator}>—</span>
                        <input
                            type="number"
                            placeholder="Max price $"
                            value={maxPrice}
                            onChange={(e) => {
                                setMaxPrice(e.target.value);
                                setPage(1);
                            }}
                            className={styles.priceInput}
                            step="0.01"
                            min="0"
                        />
                    </div>
                </div>

                <div className={styles.statsBadge}>
                    <span className={`${styles.badge} ${styles.coinranking}`}>
                        {filteredAndSorted.length} / {coins.length} coins
                    </span>
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={`${styles.pricingTable} ${styles.coinrankingTable}`}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('rank')} className={styles.sortable}>
                                Rank {getSortIndicator('rank')}
                            </th>
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
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((coin) => (
                            <tr key={coin.uuid} className={styles.coinrankingRow}>
                                <td className={styles.rankCell}>#{coin.rank || '—'}</td>
                                <td className={styles.symbolCell}>
                                    <strong>{coin.symbol}</strong>
                                </td>
                                <td>{coin.name}</td>
                                <td className={styles.priceCell}>
                                    ${formatPrice(coin.price)}
                                </td>
                                <td className={getChangeClass(coin.change)}>
                                    {coin.change ? (
                                        <>
                                            {parseFloat(coin.change) >= 0 ? '▲' : '▼'} 
                                            {Math.abs(parseFloat(coin.change)).toFixed(2)}%
                                        </>
                                    ) : '—'}
                                </td>
                                <td className={styles.marketCapCell}>
                                    {formatMarketCap(coin.marketCap)}
                                </td>
                                <td className={styles.volumeCell}>
                                    {formatVolume(coin['24hVolume'])}
                                </td>
                            </tr>
                        ))}
                        {paginated.length === 0 && (
                            <tr>
                                <td colSpan="7" className={styles.noResults}>
                                    No coins found matching your filters
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className={styles.paginationContainer}>
                    <div className={styles.pagination}>
                        <button 
                            onClick={() => setPage(1)}
                            disabled={page === 1}
                            className={styles.pageNav}
                        >
                            ⏮ First
                        </button>
                        <button 
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className={styles.pageNav}
                        >
                            ← Prev
                        </button>
                        
                        <div className={styles.pageNumbers}>
                            {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (page <= 3) {
                                    pageNum = i + 1;
                                } else if (page >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = page - 2 + i;
                                }
                                
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setPage(pageNum)}
                                        className={`${styles.pageNumber} ${page === pageNum ? styles.active : ''}`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>
                        
                        <button 
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className={styles.pageNav}
                        >
                            Next →
                        </button>
                        <button 
                            onClick={() => setPage(totalPages)}
                            disabled={page === totalPages}
                            className={styles.pageNav}
                        >
                            Last ⏭
                        </button>
                    </div>
                    
                    <div className={styles.pageInfo}>
                        Page {page} of {totalPages} • Showing {paginated.length} coins
                    </div>
                </div>
            )}
        </div>
    );
}