'use client';

import { useState, useMemo } from 'react';
import './tables.module.css';

export default function CoinbaseTable({ prices }) {
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState('symbol');
    const [sortDirection, setSortDirection] = useState('asc');
    const [page, setPage] = useState(1);
    const [showVolume, setShowVolume] = useState(false);
    const pageSize = 50;

    const filteredAndSorted = useMemo(() => {
        let filtered = prices;
        
        if (search) {
            const term = search.toLowerCase();
            filtered = prices.filter(p => 
                p.symbol.toLowerCase().includes(term) ||
                p.name?.toLowerCase().includes(term)
            );
        }

        return filtered.sort((a, b) => {
            let aVal, bVal;
            
            switch(sortField) {
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
                case 'change24h':
                    aVal = parseFloat(a.change24h) || 0;
                    bVal = parseFloat(b.change24h) || 0;
                    break;
                case 'volume':
                    aVal = parseFloat(a.volume24h) || 0;
                    bVal = parseFloat(b.volume24h) || 0;
                    break;
                default:
                    aVal = a.symbol || '';
                    bVal = b.symbol || '';
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

    const totalPages = Math.ceil(filteredAndSorted.length / pageSize);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

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
        return parseFloat(change) >= 0 ? 'positive' : 'negative';
    };

    return (
        <div className="table-container">
            <div className="table-controls">
                <div className="search-wrapper">
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
                </div>
                
                <div className="table-options">
                    <button 
                        className={`toggle-btn ${showVolume ? 'active' : ''}`}
                        onClick={() => setShowVolume(!showVolume)}
                        title="Toggle volume column"
                    >
                        📊 Volume
                    </button>
                    
                    <div className="pagination">
                        <button 
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            ←
                        </button>
                        <span>{page} / {totalPages}</span>
                        <button 
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                        >
                            →
                        </button>
                    </div>
                </div>
            </div>

            <div className="table-wrapper">
                <table className="pricing-table coinbase-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('symbol')}>
                                Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('name')}>
                                Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('price')}>
                                Price {sortField === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('change24h')}>
                                24h Change {sortField === 'change24h' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            {showVolume && (
                                <th onClick={() => handleSort('volume')}>
                                    24h Volume {sortField === 'volume' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                            )}
                            <th>Pair</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((item) => (
                            <tr key={item.symbol} className="coinbase-row">
                                <td className="symbol-cell">
                                    <strong>{item.symbol}</strong>
                                </td>
                                <td>{item.name || item.symbol}</td>
                                <td className="price-cell">
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
                                    <td className="volume-cell">
                                        {formatVolume(item.volume24h)}
                                    </td>
                                )}
                                <td className="pair-cell">{item.pair}</td>
                                <td>
                                    <span className="source-badge coinbase">
                                        {item.source === 'coinbase-ws' ? '🟢 Live' : '🔵 REST'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {paginated.length === 0 && (
                            <tr>
                                <td colSpan={showVolume ? 7 : 6} className="no-results">
                                    No Coinbase prices found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {filteredAndSorted.length > pageSize && (
                <div className="table-footer">
                    <div className="results-info">
                        Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, filteredAndSorted.length)} of {filteredAndSorted.length} pairs
                    </div>
                </div>
            )}
        </div>
    );
}