// components/Admin/PricingTables/BinanceTable.jsx
'use client';

import { useState, useMemo } from 'react';
import styles from './tables.module.css';

export default function BinanceTable({ prices }) {
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState('symbol');
    const [sortDirection, setSortDirection] = useState('asc');
    const [page, setPage] = useState(1);
    const pageSize = 50;

    const filteredAndSorted = useMemo(() => {
        let filtered = prices;
        
        if (search) {
            const term = search.toLowerCase();
            filtered = prices.filter(p => 
                p.symbol.toLowerCase().includes(term)
            );
        }

        return filtered.sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            
            if (sortField === 'price') {
                aVal = parseFloat(a.price) || 0;
                bVal = parseFloat(b.price) || 0;
            }
            
            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [prices, search, sortField, sortDirection]);

    const paginated = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAndSorted.slice(start, start + pageSize);
    }, [filteredAndSorted, page]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    return (
        <div className={styles.tableContainer}>
            <div className={styles.tableControls}>
                <input
                    type="text"
                    placeholder="Search symbol..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                    className={styles.searchInputSmall}
                />
                
                {filteredAndSorted.length > pageSize && (
                    <div className={styles.paginationSmall}>
                        <button 
                            onClick={() => setPage(p => Math.max(1, p - 1))} 
                            disabled={page === 1}
                        >
                            ←
                        </button>
                        <span>{page} / {Math.ceil(filteredAndSorted.length / pageSize)}</span>
                        <button 
                            onClick={() => setPage(p => Math.min(Math.ceil(filteredAndSorted.length / pageSize), p + 1))} 
                            disabled={page === Math.ceil(filteredAndSorted.length / pageSize)}
                        >
                            →
                        </button>
                    </div>
                )}
            </div>
            
            <div className={styles.tableWrapper}>
                <table className={styles.compactTable}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('symbol')} className={styles.sortable}>
                                Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('price')} className={styles.sortable}>
                                Price {sortField === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('change24h')} className={styles.sortable}>
                                24h Change {sortField === 'change24h' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((item) => {
                            const change24h = parseFloat(item.change24h) || 0;
                            return (
                                <tr key={item.symbol} className={styles.binanceRow}>
                                    <td className={styles.symbolCell}>
                                        <strong>{item.symbol}</strong>
                                    </td>
                                    <td className={styles.priceCell}>
                                        ${parseFloat(item.price).toFixed(4)}
                                    </td>
                                    <td className={change24h >= 0 ? styles.positive : styles.negative}>
                                        {item.change24h ? (
                                            <>
                                                {change24h >= 0 ? '▲' : '▼'} 
                                                {Math.abs(change24h).toFixed(2)}%
                                            </>
                                        ) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                        {paginated.length === 0 && (
                            <tr>
                                <td colSpan="3" className={styles.noResults}>
                                    No Binance prices found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className={styles.tableFooter}>
                <div className={styles.resultsInfo}>
                    Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, filteredAndSorted.length)} of {filteredAndSorted.length} pairs
                </div>
            </div>
        </div>
    );
}