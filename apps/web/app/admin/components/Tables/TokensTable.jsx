// components/Admin/Tables/TokensTable.jsx
import React, { useMemo } from 'react';
import TokenDetails from './TokenDetails';
import './TokensTable.module.css';

export default function TokensTable({
    tokens,
    expandedRows,
    selectedTokens,
    onToggleExpand,
    onSelectToken,
    onSort,
    sortConfig,
    searchTerm,
    onSearchChange,
    globalPrices,
    dbTokenMap,
    onUpdateToken
}) {
    const formatPrice = (price) => {
        if (!price) return '—';
        const num = parseFloat(price);
        if (num < 0.01) return num.toFixed(6);
        if (num < 1) return num.toFixed(4);
        return num.toFixed(2);
    };

    const formatMarketCap = (cap) => {
        if (!cap) return '—';
        const num = parseFloat(cap);
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toLocaleString()}`;
    };

    const getPriceSource = (symbol) => {
        const price = globalPrices?.[symbol];
        return price ? price.source : null;
    };

    return (
        <div className="table-container">
            <div className="search-bar">
                <input
                    type="text"
                    placeholder="Search by symbol or name..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="table-wrapper">
                <table className="tokens-table">
                    <thead>
                        <tr>
                            <th className="checkbox-col">
                                <input
                                    type="checkbox"
                                    checked={selectedTokens.length === tokens.length && tokens.length > 0}
                                    onChange={() => onSelectToken(tokens)}
                                />
                            </th>
                            <th onClick={() => onSort('symbol')} className="sortable">
                                Symbol {sortConfig.key === 'symbol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => onSort('name')} className="sortable">
                                Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => onSort('price')} className="sortable">
                                Price {sortConfig.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Source</th>
                            <th onClick={() => onSort('market_cap')} className="sortable">
                                Market Cap {sortConfig.key === 'market_cap' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tokens.map((token) => {
                            const tokenId = token.id || token.symbol;
                            const isExpanded = expandedRows.has(tokenId);
                            const isSelected = selectedTokens.some(t => t.id === token.id);
                            const priceSource = getPriceSource(token.symbol);

                            return (
                                <React.Fragment key={tokenId}>
                                    <tr className={`token-row ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`}>
                                        <td className="checkbox-col">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onSelectToken(token)}
                                            />
                                        </td>
                                        <td className="symbol-cell">
                                            <strong>{token.symbol}</strong>
                                        </td>
                                        <td>{token.name || token.symbol}</td>
                                        <td className="price-cell">
                                            ${formatPrice(token.price)}
                                            {priceSource && (
                                                <span className={`source-badge ${priceSource}`}>
                                                    {priceSource}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {priceSource ? (
                                                <span className={`source-indicator ${priceSource}`}>
                                                    ●
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="marketcap-cell">
                                            {formatMarketCap(token.marketCap || token.market_cap)}
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => onToggleExpand(tokenId)}
                                                className="action-btn small"
                                            >
                                                {isExpanded ? '▼' : '▶'} Details
                                            </button>
                                        </td>
                                    </tr>
                                    
                                    {isExpanded && (
                                        <tr className="details-row">
                                            <td colSpan="7">
                                                <TokenDetails
                                                    token={token}
                                                    onUpdate={onUpdateToken}
                                                    globalPrice={globalPrices?.[token.symbol]}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {tokens.length === 0 && (
                            <tr>
                                <td colSpan="7" className="no-results">
                                    No tokens found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}