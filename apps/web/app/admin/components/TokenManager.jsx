"use client"
import React, { useState, useMemo, useCallback } from 'react';
import { useTokens } from '@/contexts/TokenContext';
import { usePriceStore } from '@/contexts/PriceStoreContext';
import { useOneInchTokens } from '@/contexts/OneInchTokens\Context';
import { useTokenCrud } from '@/hooks/useTokenCrud';
import { useSimpleDebounce } from '@/hooks/useSimpleDebounce';
import { filterAndSortTokens } from '@/utils/tokenHelpers';
import TokensTable from './Tables/TokensTable';
import OneInchCompareTable from './Tables/OneInchCompareTable';
import './styles/TokenManager.module.css';

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
    const [bulkStatus, setBulkStatus] = useState({ type: '', message: '' });

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
        setTimeout(() => setBulkStatus({ type: '', message: '' }), 3000);
    }, [selectedTokens, deleteToken]);

    if (loadingDb && !displayTokens.length) {
        return <div className="loading">Loading tokens...</div>;
    }

    if (showOneInchCompare) {
        return (
            <OneInchCompareTable
                dbTokens={dbTokens}
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
            />
        );
    }

    return (
        <div className="admin-token-manager">
            <div className="manager-header">
                <div className="header-left">
                    <h2>Token Management</h2>
                    <div className="stats">
                        <span className="stat-item">🛢️ Total: {displayTokens.length}</span>
                        <span className="stat-item">📊 Showing: {filteredTokens.length}</span>
                    </div>
                </div>
                
                <div className="header-right">
                    <button onClick={() => setShowOneInchCompare(true)} className="action-btn">
                        🧩 Compare 1inch
                    </button>
                    {selectedTokens.length > 0 && (
                        <button onClick={handleBulkDelete} className="action-btn danger">
                            🗑️ Delete ({selectedTokens.length})
                        </button>
                    )}
                </div>
            </div>

            {bulkStatus.message && (
                <div className={`status-message ${bulkStatus.type}`}>
                    {bulkStatus.message}
                </div>
            )}

            {globalError && (
                <div className="status-message error">
                    ⚠️ Price data unavailable: {globalError}
                </div>
            )}

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
    );
}