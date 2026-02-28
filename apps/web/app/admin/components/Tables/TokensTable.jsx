// components/Admin/Tables/TokensTable.jsx
import React, { useState } from 'react';
import TokenDetails from './TokenDetails';
import styles from './TokensTable.module.css';

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
    const [editingToken, setEditingToken] = useState(null);

    const handleSort = (key) => {
        onSort(key);
    };

    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return '↕️';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

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

    const getChangeClass = (change) => {
        if (!change) return '';
        return parseFloat(change) >= 0 ? styles.positive : styles.negative;
    };

    const getSourceBadge = (token) => {
        // Determine source based on token data
        if (token.oneinch_data) {
            return <span className={`${styles.sourceBadge} ${styles.oneinch}`}>1inch</span>;
        } else if (token.source === 'binance' || token.binance_data) {
            return <span className={`${styles.sourceBadge} ${styles.binance}`}>Binance</span>;
        } else if (token.source === 'coinbase' || token.coinbase_data) {
            return <span className={`${styles.sourceBadge} ${styles.coinbase}`}>Coinbase</span>;
        } else if (token.source === 'coinranking' || token.coinranking_data) {
            return <span className={`${styles.sourceBadge} ${styles.coinranking}`}>Coinranking</span>;
        }
        return <span className={`${styles.sourceBadge} ${styles.database}`}>DB</span>;
    };

    return (
        <div className={styles.tokensTable}>
            <div className={styles.tableHeader}>
                <div className={styles.searchSection}>
                    <input
                        type="text"
                        placeholder="Search tokens..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
                <div className={styles.stats}>
                    <span className={styles.statItem}>📊 {tokens.length} tokens</span>
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.checkboxCol}>
                                <input
                                    type="checkbox"
                                    onChange={() => {}}
                                    checked={selectedTokens.length === tokens.length && tokens.length > 0}
                                />
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
                            <th onClick={() => handleSort('change24h')} className={styles.sortable}>
                                % Change {getSortIndicator('change24h')}
                            </th>
                            <th onClick={() => handleSort('marketCap')} className={styles.sortable}>
                                Market Cap {getSortIndicator('marketCap')}
                            </th>
                            <th className={styles.sourceCol}>Source</th>
                            <th className={styles.actionsCol}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {tokens.map((token) => {
                            const isExpanded = expandedRows.has(token.id);
                            const isSelected = selectedTokens.some(t => t.id === token.id);
                            const globalPrice = globalPrices?.[token.symbol?.toUpperCase()];
                            const change24h = globalPrice?.change24h || token.change24h;
                            const marketCap = globalPrice?.marketCap || token.marketCap;
                            
                            return (
                                <React.Fragment key={token.id}>
                                    <tr 
                                        className={`${styles.tokenRow} ${isSelected ? styles.selected : ''}`}
                                        onClick={() => onSelectToken(token)}
                                    >
                                        <td className={styles.checkboxCol} onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onSelectToken(token)}
                                            />
                                        </td>
                                        <td className={styles.symbolCell}>
                                            <strong>{token.symbol}</strong>
                                        </td>
                                        <td>{token.name}</td>
                                        <td className={styles.priceCell}>
                                            ${formatPrice(globalPrice?.price || token.price)}
                                        </td>
                                        <td className={getChangeClass(change24h)}>
                                            {change24h ? (
                                                <>
                                                    {parseFloat(change24h) >= 0 ? '▲' : '▼'} 
                                                    {Math.abs(parseFloat(change24h)).toFixed(2)}%
                                                </>
                                            ) : '—'}
                                        </td>
                                        <td className={styles.marketCapCell}>
                                            {formatMarketCap(marketCap)}
                                        </td>
                                        <td className={styles.sourceCell}>
                                            {getSourceBadge(token)}
                                        </td>
                                        <td className={styles.actionsCell}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onToggleExpand(token.id);
                                                }}
                                                className={styles.detailsBtn}
                                            >
                                                {isExpanded ? '▼' : '▶'} Details
                                            </button>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className={styles.detailsRow}>
                                            <td colSpan="8">
                                                <TokenDetails
                                                    token={token}
                                                    onUpdate={onUpdateToken}
                                                    globalPrice={globalPrice}
                                                    onClose={() => onToggleExpand(token.id)}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {tokens.length === 0 && (
                            <tr>
                                <td colSpan="8" className={styles.noResults}>
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