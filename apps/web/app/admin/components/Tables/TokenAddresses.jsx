// components/Admin/Tables/TokenAddresses.jsx
import React, { useState } from 'react';
import styles from './TokenAddresses.module.css';

export default function TokenAddresses({ chains, onChange, isEditing }) {
    const [newChain, setNewChain] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [copiedChain, setCopiedChain] = useState(null);

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

    const copyToClipboard = async (chain, text) => {
        await navigator.clipboard.writeText(text);
        setCopiedChain(chain);
        setTimeout(() => setCopiedChain(null), 2000);
    };

    return (
        <div className={styles.tokenAddresses}>
            <h4>Chain Addresses</h4>
            
            <div className={styles.addressesList}>
                {Object.entries(chains).map(([chain, address]) => (
                    <div key={chain} className={styles.addressItem}>
                        <span className={styles.chainName}>{chain}:</span>
                        <span className={styles.address} title={address}>
                            {address.substring(0, 6)}...{address.substring(address.length - 4)}
                        </span>
                        <div className={styles.addressActions}>
                            <button
                                onClick={() => copyToClipboard(chain, address)}
                                className={`${styles.iconBtn} ${copiedChain === chain ? styles.copied : ''}`}
                                title="Copy address"
                            >
                                📋
                            </button>
                            {isEditing && (
                                <button
                                    onClick={() => removeAddress(chain)}
                                    className={`${styles.iconBtn} ${styles.danger}`}
                                    title="Remove address"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                
                {Object.keys(chains).length === 0 && (
                    <div className={styles.noAddresses}>
                        <span>No chain addresses</span>
                    </div>
                )}
            </div>

            {isEditing && (
                <div className={styles.addAddressForm}>
                    <input
                        type="text"
                        placeholder="Chain (e.g., ethereum)"
                        value={newChain}
                        onChange={(e) => setNewChain(e.target.value)}
                        className={styles.chainInput}
                    />
                    <input
                        type="text"
                        placeholder="Address"
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        className={styles.addressInput}
                    />
                    <button
                        onClick={addAddress}
                        className={styles.addBtn}
                        disabled={!newChain.trim() || !newAddress.trim()}
                    >
                        Add
                    </button>
                </div>
            )}
        </div>
    );
}