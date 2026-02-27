// components/Admin/Tables/TokenAddresses.jsx
import React, { useState } from 'react';
import './TokenAddresses.css';

export default function TokenAddresses({ chains, onChange, isEditing }) {
    const [newChain, setNewChain] = useState('');
    const [newAddress, setNewAddress] = useState('');

    const addAddress = () => {
        if (newChain.trim() && newAddress.trim()) {
            onChange({ ...chains, [newChain.trim()]: newAddress.trim() });
            setNewChain('');
            setNewAddress('');
        }
    };

    const removeAddress = (chain) => {
        const updated = { ...chains };
        delete updated[chain];
        onChange(updated);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="token-addresses">
            <h4>Chain Addresses</h4>
            
            <div className="addresses-list">
                {Object.entries(chains).map(([chain, address]) => (
                    <div key={chain} className="address-item">
                        <span className="chain-name">{chain}:</span>
                        <span className="address mono" title={address}>
                            {address.substring(0, 6)}...{address.substring(address.length - 4)}
                        </span>
                        <div className="address-actions">
                            <button
                                onClick={() => copyToClipboard(address)}
                                className="icon-btn"
                                title="Copy address"
                            >
                                📋
                            </button>
                            {isEditing && (
                                <button
                                    onClick={() => removeAddress(chain)}
                                    className="icon-btn danger"
                                    title="Remove address"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                
                {Object.keys(chains).length === 0 && (
                    <div className="no-addresses">No chain addresses</div>
                )}
            </div>

            {isEditing && (
                <div className="add-address-form">
                    <input
                        type="text"
                        placeholder="Chain (e.g., ethereum)"
                        value={newChain}
                        onChange={(e) => setNewChain(e.target.value)}
                        className="chain-input"
                    />
                    <input
                        type="text"
                        placeholder="Address"
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        className="address-input mono"
                    />
                    <button
                        onClick={addAddress}
                        className="add-btn"
                        disabled={!newChain.trim() || !newAddress.trim()}
                    >
                        Add
                    </button>
                </div>
            )}
        </div>
    );
}