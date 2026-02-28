"use client";
import React, { useState, useMemo } from 'react';
import styles from '../styles/PricingManager.module.css';

const formatPrice = (price) => {
    if (price === null || price === undefined) return '—';
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const formatMarketCap = (marketCap) => {
    if (!marketCap) return '—';
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    if (marketCap >= 1e3) return `$${(marketCap / 1e3).toFixed(2)}K`;
    return `$${marketCap.toFixed(2)}`;
};

const formatPercentage = (value) => {
    if (value === null || value === undefined) return '—';
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return '—';
    return (
        <span className={numValue >= 0 ? styles.priceUp : styles.priceDown}>
            {numValue >= 0 ? '+' : ''}{numValue.toFixed(2)}%
        </span>
    );
};

const SortIcon = ({ column, currentSort }) => {
    if (currentSort.column !== column) return <span className={styles.sortIcon}>↕️</span>;
    return <span className={styles.sortIcon}>{currentSort.direction === 'asc' ? '↑' : '↓'}</span>;
};

export default function CompareTable({ data }) {
    const [sortConfig, setSortConfig] = useState({
        column: 'marketCap',
        direction: 'desc'
    });

    const sortedData = useMemo(() => {
        const sortableData = [...data];
        
        sortableData.sort((a, b) => {
            let aValue = a[sortConfig.column];
            let bValue = b[sortConfig.column];

            // Handle null values
            if (aValue === null || aValue === undefined) aValue = sortConfig.direction === 'asc' ? Infinity : -Infinity;
            if (bValue === null || bValue === undefined) bValue = sortConfig.direction === 'asc' ? Infinity : -Infinity;

            // Special handling for difference percentage
            if (sortConfig.column === 'differencePercentage') {
                aValue = a.differencePercentage ? parseFloat(a.differencePercentage) : -Infinity;
                bValue = b.differencePercentage ? parseFloat(b.differencePercentage) : -Infinity;
            }

            if (aValue < bValue) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

        return sortableData;
    }, [data, sortConfig]);

    const requestSort = (column) => {
        setSortConfig({
            column,
            direction: sortConfig.column === column && sortConfig.direction === 'asc' ? 'desc' : 'asc'
        });
    };

    const getColumnHeader = (column, label) => (
        <th onClick={() => requestSort(column)} className={styles.sortableHeader}>
            <div className={styles.headerContent}>
                {label}
                <SortIcon column={column} currentSort={sortConfig} />
            </div>
        </th>
    );

    return (
        <div className={styles.compareTableContainer}>
            <table className={styles.compareTable}>
                <thead>
                    <tr>
                        {getColumnHeader('symbol', 'Token')}
                        {getColumnHeader('priceChange', '% Change')}
                        {getColumnHeader('binancePrice', 'Binance')}
                        {getColumnHeader('coinbasePrice', 'Coinbase')}
                        {getColumnHeader('differencePercentage', '% Difference')}
                        {getColumnHeader('marketCap', 'Market Cap')}
                        <th>Sources</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map((item, index) => {
                        // Determine which exchange has the higher price
                        let higherExchange = null;
                        if (item.binancePrice && item.coinbasePrice) {
                            higherExchange = item.binancePrice > item.coinbasePrice ? 'binance' : 'coinbase';
                        }
                        
                        return (
                            <tr key={item.symbol} className={index % 2 === 0 ? styles.evenRow : styles.oddRow}>
                                <td className={styles.tokenCell}>
                                    <div className={styles.tokenInfo}>
                                        <span className={styles.tokenSymbol}>{item.symbol}</span>
                                        <span className={styles.tokenName}>{item.name}</span>
                                    </div>
                                </td>
                                <td className={styles.priceChangeCell}>
                                    {formatPercentage(item.priceChange)}
                                </td>
                                <td className={`${styles.priceCell} ${higherExchange === 'binance' ? styles.higherPrice : ''}`}>
                                    {item.binancePrice ? (
                                        <>
                                            <span className={styles.priceValue}>${formatPrice(item.binancePrice)}</span>
                                            {item.source.binance && (
                                                <span className={`${styles.sourceBadge} ${higherExchange === 'binance' ? styles.higherBadge : ''}`}>
                                                    B
                                                </span>
                                            )}
                                        </>
                                    ) : '—'}
                                </td>
                                <td className={`${styles.priceCell} ${higherExchange === 'coinbase' ? styles.higherPrice : ''}`}>
                                    {item.coinbasePrice ? (
                                        <>
                                            <span className={styles.priceValue}>${formatPrice(item.coinbasePrice)}</span>
                                            {item.source.coinbase && (
                                                <span className={`${styles.sourceBadge} ${higherExchange === 'coinbase' ? styles.higherBadge : ''}`}>
                                                    C
                                                </span>
                                            )}
                                        </>
                                    ) : '—'}
                                </td>
                                <td className={styles.differenceCell}>
                                    {item.differencePercentage ? (
                                        <div className={styles.differenceWrapper}>
                                            <span className={
                                                parseFloat(item.differencePercentage) < 1 ? styles.differenceLow :
                                                parseFloat(item.differencePercentage) < 3 ? styles.differenceMedium :
                                                parseFloat(item.differencePercentage) < 5 ? styles.differenceHigh :
                                                styles.differenceExtreme
                                            }>
                                                {item.differencePercentage}%
                                            </span>
                                            {higherExchange && (
                                                <span className={styles.higherIndicator}>
                                                    ↑ {higherExchange === 'binance' ? 'B' : 'C'}
                                                </span>
                                            )}
                                        </div>
                                    ) : '—'}
                                </td>
                                <td className={styles.marketCapCell}>
                                    {formatMarketCap(item.marketCap)}
                                </td>
                                <td className={styles.sourcesCell}>
                                    <div className={styles.sourceIndicators}>
                                        {item.source.binance && (
                                            <span className={`${styles.sourceDot} ${styles.binance} ${higherExchange === 'binance' ? styles.higherSource : ''}`} 
                                                  title={higherExchange === 'binance' ? 'Binance (Higher)' : 'Binance'}>
                                                B
                                            </span>
                                        )}
                                        {item.source.coinbase && (
                                            <span className={`${styles.sourceDot} ${styles.coinbase} ${higherExchange === 'coinbase' ? styles.higherSource : ''}`} 
                                                  title={higherExchange === 'coinbase' ? 'Coinbase (Higher)' : 'Coinbase'}>
                                                C
                                            </span>
                                        )}
                                        {item.source.coinranking && (
                                            <span className={`${styles.sourceDot} ${styles.coinranking}`} title="Coinranking">
                                                R
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}