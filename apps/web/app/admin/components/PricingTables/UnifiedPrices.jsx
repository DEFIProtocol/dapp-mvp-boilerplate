'use client';

import { useState, useMemo } from 'react';
import './tables.module.css';

export default function UnifiedPrices({ prices }) {
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
                p.symbol.toLowerCase().includes(term) ||
                (p.source || '').toLowerCase().includes(term)
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

    const totalPages = Math.ceil(filteredAndSorted.length / pageSize);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const getSourceBadge = (source) => {
        const classes = {
            'binance': 'badge binance',
            'coinbase': 'badge coinbase',
            'coinranking': 'badge coinranking'
        };
        return <span className={classes[source] || 'badge'}>{source}</span>;
    };

    return (
        <div className="table-container">
            <div className="table-controls">
                <input
                    type="text"
                    placeholder="Search by symbol..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                    className="search-input"
                />
                <div className="pagination">
                    <button 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        ← Prev
                    </button>
                    <span>Page {page} of {totalPages}</span>
                    <button 
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                    >
                        Next →
                    </button>
                </div>
            </div>

            <table className="pricing-table">
                <thead>
                    <tr>
                        <th onClick={() => handleSort('symbol')}>
                            Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th>Price</th>
                        <th onClick={() => handleSort('source')}>
                            Source {sortField === 'source' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th>Pair</th>
                        <th>Last Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {paginated.map((item) => (
                        <tr key={item.symbol} className={`source-${item.source}`}>
                            <td className="symbol-cell">
                                <strong>{item.symbol}</strong>
                            </td>
                            <td className="price-cell">
                                ${parseFloat(item.price).toFixed(4)}
                            </td>
                            <td>{getSourceBadge(item.source)}</td>
                            <td>{item.pair || '—'}</td>
                            <td className="timestamp-cell">
                                {new Date(item.lastUpdated).toLocaleTimeString()}
                            </td>
                        </tr>
                    ))}
                    {paginated.length === 0 && (
                        <tr>
                            <td colSpan="5" className="no-results">
                                No prices found
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}