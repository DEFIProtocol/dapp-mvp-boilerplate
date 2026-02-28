"use client"
import React, { useState, useMemo, useCallback } from 'react';
import { useTokens } from '@/contexts/TokenContext';
import { usePriceStore } from '@/contexts/PriceStoreContext';
import { useOneInchTokens } from '@/contexts/OneInchTokensContext';
import { useTokenCrud } from '@/hooks/useTokenCrud';
import { useSimpleDebounce } from '@/hooks/useSimpleDebounce';
import { filterAndSortTokens } from '@/utils/tokenHelpers';
import TokensTable from './Tables/TokensTable';
import OneInchCompareTable from './Tables/OneInchCompareTable';
import AddTokenModal from './modals/AddTokenModal';
import styles from './styles/TokenManager.module.css';

export default function TokenManager({ initialTokens = [] }) {
    // Contexts
    const { tokens: dbTokens, loading: loadingDb, error: errorDb } = useTokens();
    const { priceMap: globalPrices, loading: globalLoading, error: globalError, formatPrice } = usePriceStore();
    const { tokensList: oneInchTokens, isLoading: oneInchLoading, chainId, setChainId } = useOneInchTokens();
    const { createToken, deleteToken, updateToken } = useTokenCrud();

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useSimpleDebounce(searchTerm, 300);
    const [sortConfig, setSortConfig] = useState({ key: 'symbol', direction: 'asc' });
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [selectedTokens, setSelectedTokens] = useState([]);
    const [showOneInchCompare, setShowOneInchCompare] = useState(false);
    const [showAddTokenModal, setShowAddTokenModal] = useState(false);
    const [bulkStatus, setBulkStatus] = useState({ type: '', message: '' });
    const [isProcessing, setIsProcessing] = useState(false);

    // Simple chain mapping
    const getChainKey = (id) => {
        const map = { 
            1: 'ethereum', 
            56: 'bnb', 
            137: 'polygon', 
            42161: 'arbitrum', 
            43114: 'avalanche' 
        };
        return map[id] || 'ethereum';
    };

    // Filter DB tokens by chain address (for compare view)
    const getDbTokensOnChain = useCallback((chainId) => {
        const chainKey = getChainKey(chainId);
        return (dbTokens || []).filter(token => {
            try {
                const chains = typeof token.chains === 'string' 
                    ? JSON.parse(token.chains) 
                    : (token.chains || {});
                return chains[chainKey]?.length > 0;
            } catch {
                return false;
            }
        });
    }, [dbTokens]);

    // Data
    const displayTokens = initialTokens.length ? initialTokens : (dbTokens || []);
    
    const filteredTokens = useMemo(() => 
        filterAndSortTokens(displayTokens, debouncedSearch, sortConfig),
        [displayTokens, debouncedSearch, sortConfig]
    );

    const dbTokenMap = useMemo(() => {
        const map = new Map();
        dbTokens?.forEach(t => map.set(t.symbol?.toLowerCase(), t));
        return map;
    }, [dbTokens]);

    const oneInchMap = useMemo(() => {
        const map = {};
        oneInchTokens?.forEach(t => map[t.symbol?.toUpperCase()] = t);
        return map;
    }, [oneInchTokens]);

    // Handlers
    const handleSort = useCallback((key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

    const toggleRowExpansion = useCallback((id) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const toggleTokenSelection = useCallback((token) => {
        setSelectedTokens(prev => {
            const exists = prev.some(t => t.id === token.id);
            return exists ? prev.filter(t => t.id !== token.id) : [...prev, token];
        });
    }, []);

    const handleBulkDelete = useCallback(async () => {
        if (!selectedTokens.length || !window.confirm(`Delete ${selectedTokens.length} token(s)?`)) return;
        
        setIsProcessing(true);
        let success = 0, failed = 0;
        
        for (const token of selectedTokens) {
            const result = await deleteToken(token.symbol);
            result.success ? success++ : failed++;
        }
        
        setBulkStatus({
            type: failed ? 'warning' : 'success',
            message: `Deleted ${success} tokens${failed ? `, ${failed} failed` : ''}`
        });
        setSelectedTokens([]);
        setIsProcessing(false);
        setTimeout(() => setBulkStatus({ type: '', message: '' }), 3000);
    }, [selectedTokens, deleteToken]);

    if (loadingDb && !displayTokens.length) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner}></div>
                <div className={styles.loadingText}>Loading tokens...</div>
            </div>
        );
    }

    if (showOneInchCompare) {
        const dbTokensOnChain = getDbTokensOnChain(chainId);
        const chainKey = getChainKey(chainId);

        return (
            <OneInchCompareTable
                dbTokens={dbTokensOnChain}
                oneInchTokens={oneInchTokens}
                oneInchMap={oneInchMap}
                globalPrices={globalPrices}
                dbTokenMap={dbTokenMap}
                onClose={() => setShowOneInchCompare(false)}
                onAddFromOneInch={createToken}
                onUpdateToken={updateToken}
                onDeleteToken={deleteToken}
                chainId={chainId}
                setChainId={setChainId}
                formatPrice={formatPrice}
                currentChainKey={chainKey}
            />
        );
    }

    return (
        <div className={styles.tokenManager}>
            {/* Header Stats */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Tokens</div>
                    <div className={styles.statValue}>{displayTokens.length}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Showing</div>
                    <div className={styles.statValue}>{filteredTokens.length}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>With Prices</div>
                    <div className={styles.statValue}>
                        {displayTokens.filter(t => globalPrices[t.symbol?.toUpperCase()]).length}
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Selected</div>
                    <div className={styles.statValue}>{selectedTokens.length}</div>
                </div>
            </div>

            {/* Source Stats */}
            <div className={styles.sourceStats}>
                <div className={styles.sourceStatItem}>
                    <span className={`${styles.sourceDot} ${styles.binance}`} />
                    <span className={styles.sourceStatLabel}>Database</span>
                    <span className={styles.sourceStatValue}>{dbTokens?.length || 0}</span>
                </div>
                <div className={styles.sourceStatItem}>
                    <span className={`${styles.sourceDot} ${styles.coinbase}`} />
                    <span className={styles.sourceStatLabel}>1inch</span>
                    <span className={styles.sourceStatValue}>{oneInchTokens?.length || 0}</span>
                </div>
                <div className={styles.sourceStatItem}>
                    <span className={`${styles.sourceDot} ${styles.coinranking}`} />
                    <span className={styles.sourceStatLabel}>With Prices</span>
                    <span className={styles.sourceStatValue}>
                        {Object.keys(globalPrices || {}).length}
                    </span>
                </div>
            </div>

            {/* Status Messages */}
            {bulkStatus.message && (
                <div className={`${styles.statusMessage} ${styles[bulkStatus.type]}`}>
                    {bulkStatus.message}
                </div>
            )}

            {globalError && (
                <div className={`${styles.statusMessage} ${styles.error}`}>
                    <span className={styles.messageIcon}>⚠️</span>
                    Price data unavailable: {globalError}
                </div>
            )}

            {errorDb && (
                <div className={`${styles.statusMessage} ${styles.error}`}>
                    <span className={styles.messageIcon}>⚠️</span>
                    Database error: {errorDb}
                </div>
            )}

            {/* Action Bar */}
            <div className={styles.actionBar}>
                <div className={styles.searchWrapper}>
                    <input
                        type="text"
                        placeholder="Search tokens..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                        disabled={isProcessing}
                    />
                </div>
                
                <div className={styles.actionButtons}>
                    <button 
                        onClick={() => setShowAddTokenModal(true)}
                        className={`${styles.actionBtn} ${styles.coinranking}`}
                        disabled={isProcessing}
                    >
                        <span className={styles.btnIcon}>➕</span>
                        Add Token
                    </button>

                    <button 
                        onClick={() => setShowOneInchCompare(true)} 
                        className={`${styles.actionBtn} ${styles.coinbase}`}
                        disabled={isProcessing}
                    >
                        <span className={styles.btnIcon}>🧩</span>
                        Compare 1inch
                    </button>
                    
                    {selectedTokens.length > 0 && (
                        <button 
                            onClick={handleBulkDelete} 
                            className={`${styles.actionBtn} ${styles.binance}`}
                            disabled={isProcessing}
                        >
                            <span className={styles.btnIcon}>🗑️</span>
                            Delete ({selectedTokens.length})
                        </button>
                    )}
                </div>
            </div>

            {/* Tokens Table */}
            <div className={styles.tableSection}>
                <TokensTable
                    tokens={filteredTokens}
                    expandedRows={expandedRows}
                    selectedTokens={selectedTokens}
                    onToggleExpand={toggleRowExpansion}
                    onSelectToken={toggleTokenSelection}
                    onSort={handleSort}
                    sortConfig={sortConfig}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    globalPrices={globalPrices}
                    dbTokenMap={dbTokenMap}
                    onUpdateToken={updateToken}
                />
            </div>

            {/* Add Token Modal */}
            {showAddTokenModal && (
                <AddTokenModal
                    onClose={() => setShowAddTokenModal(false)}
                    onCreateToken={createToken}
                    globalPrices={globalPrices}
                    oneInchTokens={oneInchTokens}
                />
            )}
        </div>
    );
}