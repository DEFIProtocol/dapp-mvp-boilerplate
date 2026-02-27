'use client';

import { useState, useMemo } from 'react';
import './tables.module.css';

export default function CoinrankingTable({ coins }) {
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState('rank');
    const [sortDirection, setSortDirection] = useState('asc');
    const [page, setPage] = useState(1);
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const pageSize = 100;

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

        // Sort
        return filtered.sort((a, b) => {
            let aVal, bVal;
            
            switch(sortField) {
                case 'rank':
                    aVal = a.rank || 9999;
                    bVal = b.rank || 9999;
                    break;
                case 'symbol':
                    aVal = a.symbol || '';
                    bVal = b.symbol || '';
                    break;
                case 'name':
                    aVal = a.name || '';
                    bVal = b.name || '';
                    break;
                case 'price':
                    aVal = parseFloat(a.price) || 0;
                    bVal = parseFloat(b.price) || 0;
                    break;
                case 'change':
                    aVal = parseFloat(a.change) || 0;
                    bVal = parseFloat(b.change) || 0;
                    break;
                case 'marketCap':
                    aVal = parseFloat(a.marketCap) || 0;
                    bVal = parseFloat(b.marketCap) || 0;
                    break;
                case 'volume':
                    aVal = parseFloat(a['24hVolume']) || 0;
                    bVal = parseFloat(b['24hVolume']) || 0;
                    break;
                default:
                    aVal = a.rank || 9999;
                    bVal = b.rank || 9999;
            }
            
            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [coins, search, sortField, sortDirection, minPrice, maxPrice]);

    const paginated = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAndSorted.slice(start, start + pageSize);
    }, [filteredAndSorted, page]);

    const totalPages = Math.ceil(filteredAndSorted.length / pageSize);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
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
        return parseFloat(change) >= 0 ? 'positive' : 'negative';
    };

    return (
        <div className="table-container coinranking-container">
            <div className="table-controls">
                <div className="search-filters">
                    <input
                        type="text"
                        placeholder="Search by symbol or name..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className="search-input"
                    />
                    
                    <div className="price-filters">
                        <input
                            type="number"
                            placeholder="Min price $"
                            value={minPrice}
                            onChange={(e) => {
                                setMinPrice(e.target.value);
                                setPage(1);
                            }}
                            className="price-input"
                            step="0.01"
                            min="0"
                        />
                        <span>-</span>
                        <input
                            type="number"
                            placeholder="Max price $"
                            value={maxPrice}
                            onChange={(e) => {
                                setMaxPrice(e.target.value);
                                setPage(1);
                            }}
                            className="price-input"
                            step="0.01"
                            min="0"
                        />
                    </div>
                </div>

                <div className="stats-badge">
                    <span className="badge coinranking">
                        {filteredAndSorted.length} / {coins.length} coins
                    </span>
                </div>
            </div>

            <div className="table-wrapper">
                <table className="pricing-table coinranking-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('rank')}>
                                Rank {sortField === 'rank' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('symbol')}>
                                Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('name')}>
                                Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('price')}>
                                Price {sortField === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('change')}>
                                24h Change {sortField === 'change' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('marketCap')}>
                                Market Cap {sortField === 'marketCap' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('volume')}>
                                24h Volume {sortField === 'volume' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((coin) => (
                            <tr key={coin.uuid} className="coinranking-row">
                                <td className="rank-cell">#{coin.rank || '—'}</td>
                                <td className="symbol-cell">
                                    <strong>{coin.symbol}</strong>
                                </td>
                                <td>{coin.name}</td>
                                <td className="price-cell">
                                    ${parseFloat(coin.price).toFixed(4)}
                                </td>
                                <td className={getChangeClass(coin.change)}>
                                    {coin.change ? (
                                        <>
                                            {parseFloat(coin.change) >= 0 ? '▲' : '▼'} 
                                            {Math.abs(parseFloat(coin.change)).toFixed(2)}%
                                        </>
                                    ) : '—'}
                                </td>
                                <td className="marketcap-cell">
                                    {formatMarketCap(coin.marketCap)}
                                </td>
                                <td className="volume-cell">
                                    {formatVolume(coin['24hVolume'])}
                                </td>
                            </tr>
                        ))}
                        {paginated.length === 0 && (
                            <tr>
                                <td colSpan="7" className="no-results">
                                    No coins found matching your filters
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="pagination-container">
                    <div className="pagination">
                        <button 
                            onClick={() => setPage(1)}
                            disabled={page === 1}
                            className="page-nav"
                        >
                            ⏮ First
                        </button>
                        <button 
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="page-nav"
                        >
                            ← Prev
                        </button>
                        
                        <div className="page-numbers">
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
                                        className={`page-number ${page === pageNum ? 'active' : ''}`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>
                        
                        <button 
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="page-nav"
                        >
                            Next →
                        </button>
                        <button 
                            onClick={() => setPage(totalPages)}
                            disabled={page === totalPages}
                            className="page-nav"
                        >
                            Last ⏭
                        </button>
                    </div>
                    
                    <div className="page-info">
                        Page {page} of {totalPages} • Showing {paginated.length} coins
                    </div>
                </div>
            )}
        </div>
    );
}