// components/Admin/Tables/TokenDetails.jsx
import React, { useState, useMemo, useEffect } from 'react';
import TokenAddresses from './TokenAddresses';
import './TokenDetails.css';

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
        { key: 'market_cap', label: 'Market Cap', type: 'number' },
        { key: 'volume_24h', label: '24h Volume', type: 'number' },
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

    return (
        <div className="token-details">
            <div className="details-header">
                <h4>{token.symbol} Details</h4>
                {globalPrice && (
                    <div className="price-info">
                        <span className={`source-badge ${globalPrice.source}`}>
                            {globalPrice.source} Price: ${globalPrice.price.toFixed(4)}
                        </span>
                    </div>
                )}
            </div>

            {saveStatus === 'success' && (
                <div className="save-status success">✓ Saved</div>
            )}

            <div className="details-grid">
                {fields.map(field => (
                    <div key={field.key} className="detail-item">
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
                                className="edit-input"
                                step={field.type === 'number' ? 'any' : undefined}
                            />
                        ) : (
                            <div className="value">
                                {field.type === 'number' && editData[field.key]
                                    ? field.key === 'price' 
                                        ? `$${parseFloat(editData[field.key]).toFixed(4)}`
                                        : parseFloat(editData[field.key]).toLocaleString()
                                    : editData[field.key] || '—'}
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

            <div className="details-actions">
                {isEditing ? (
                    <>
                        <button
                            onClick={handleSave}
                            className="action-btn success"
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
                            className="action-btn secondary"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="action-btn primary"
                    >
                        Edit Token
                    </button>
                )}
            </div>
        </div>
    );
}