// components/Admin/Tables/TokenDetails.jsx
import React, { useState, useMemo, useEffect } from 'react';
import TokenAddresses from './TokenAddresses';
import styles from './TokenDetails.module.css';

export default function TokenDetails({ token, onUpdate, globalPrice }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({ ...token });
    const [saveStatus, setSaveStatus] = useState(null);
    const [chains, setChains] = useState(token.chains || {});

    useEffect(() => {
        setEditData({ ...token });
        setChains(token.chains || {});
    }, [token]);

    const fields = useMemo(() => [
        { key: 'symbol', label: 'Symbol', type: 'text', readOnly: true },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'price', label: 'Price', type: 'number' },
        { key: 'change24h', label: '24h Change', type: 'number' },
        { key: 'marketCap', label: 'Market Cap', type: 'number' },
        { key: 'volume24h', label: '24h Volume', type: 'number' },
        { key: 'decimals', label: 'Decimals', type: 'number' },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'uuid', label: 'UUID', type: 'text', readOnly: true }
    ], []);

    const handleSave = async () => {
        setSaveStatus('saving');
        
        const changes = {};
        fields.forEach(field => {
            if (!field.readOnly && editData[field.key] !== token[field.key]) {
                changes[field.key] = editData[field.key];
            }
        });

        if (JSON.stringify(chains) !== JSON.stringify(token.chains || {})) {
            changes.chains = chains;
        }

        if (Object.keys(changes).length === 0) {
            setSaveStatus('success');
            setTimeout(() => { setSaveStatus(null); setIsEditing(false); }, 1000);
            return;
        }

        const result = await onUpdate(token.symbol, changes);
        setSaveStatus(result.success ? 'success' : 'error');
        
        if (result.success) {
            setTimeout(() => { setSaveStatus(null); setIsEditing(false); }, 1500);
        }
    };

    const formatValue = (field, value) => {
        if (value === null || value === undefined) return '—';
        
        if (field.type === 'number') {
            if (field.key === 'price') {
                return `$${parseFloat(value).toFixed(4)}`;
            }
            if (field.key === 'change24h') {
                const num = parseFloat(value);
                return (
                    <span className={num >= 0 ? styles.positive : styles.negative}>
                        {num >= 0 ? '▲' : '▼'} {Math.abs(num).toFixed(2)}%
                    </span>
                );
            }
            if (field.key === 'marketCap' || field.key === 'volume24h') {
                const num = parseFloat(value);
                if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
                if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
                if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
                return `$${num.toLocaleString()}`;
            }
            return parseFloat(value).toLocaleString();
        }
        
        return value;
    };

    const getSourceBadge = () => {
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
        <div className={styles.tokenDetails}>
            <div className={styles.detailsHeader}>
                <div className={styles.titleSection}>
                    <h4>{token.symbol} Details</h4>
                    {getSourceBadge()}
                </div>
                {globalPrice && (
                    <div className={styles.priceInfo}>
                        <span className={`${styles.sourceBadge} ${styles[globalPrice.source]}`}>
                            {globalPrice.source} Price: ${globalPrice.price.toFixed(4)}
                        </span>
                    </div>
                )}
            </div>

            {saveStatus === 'success' && (
                <div className={`${styles.saveStatus} ${styles.success}`}>✓ Saved</div>
            )}
            {saveStatus === 'error' && (
                <div className={`${styles.saveStatus} ${styles.error}`}>✕ Save failed</div>
            )}

            <div className={styles.detailsGrid}>
                {fields.map(field => (
                    <div key={field.key} className={styles.detailItem}>
                        <label>{field.label}</label>
                        {isEditing && !field.readOnly ? (
                            <input
                                type={field.type}
                                value={editData[field.key] || ''}
                                onChange={(e) => setEditData({
                                    ...editData,
                                    [field.key]: field.type === 'number' 
                                        ? (e.target.value === '' ? '' : parseFloat(e.target.value))
                                        : e.target.value
                                })}
                                className={styles.editInput}
                                step={field.type === 'number' ? 'any' : undefined}
                            />
                        ) : (
                            <div className={styles.value}>
                                {formatValue(field, editData[field.key])}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <TokenAddresses
                chains={chains}
                onChange={setChains}
                isEditing={isEditing}
            />

            <div className={styles.detailsActions}>
                {isEditing ? (
                    <>
                        <button
                            onClick={handleSave}
                            className={`${styles.actionBtn} ${styles.success}`}
                            disabled={saveStatus === 'saving'}
                        >
                            {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            onClick={() => {
                                setEditData({ ...token });
                                setChains(token.chains || {});
                                setIsEditing(false);
                            }}
                            className={`${styles.actionBtn} ${styles.secondary}`}
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => setIsEditing(true)}
                        className={`${styles.actionBtn} ${styles.primary}`}
                    >
                        Edit Token
                    </button>
                )}
            </div>
        </div>
    );
}