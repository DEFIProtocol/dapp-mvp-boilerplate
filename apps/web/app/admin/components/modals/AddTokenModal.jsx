// components/Admin/Modals/AddTokenModal.jsx
import React, { useState } from 'react';
import styles from './AddTokenModal.module.css';

export default function AddTokenModal({ onClose, onCreateToken, globalPrices, oneInchTokens }) {
    const [formData, setFormData] = useState({
        symbol: '',
        name: '',
        decimals: 18,
        type: 'custom',
        chains: {},
        address: ''
    });
    const [selectedChain, setSelectedChain] = useState('ethereum');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const chainOptions = [
        { id: 'ethereum', label: 'Ethereum' },
        { id: 'bnb', label: 'BNB Chain' },
        { id: 'polygon', label: 'Polygon' },
        { id: 'arbitrum', label: 'Arbitrum' },
        { id: 'avalanche', label: 'Avalanche' },
        { id: 'solana', label: 'Solana' }
    ];

    const handleAddChain = () => {
        if (!formData.address.trim()) return;
        
        setFormData({
            ...formData,
            chains: {
                ...formData.chains,
                [selectedChain]: formData.address
            },
            address: ''
        });
    };

    const handleRemoveChain = (chain) => {
        const newChains = { ...formData.chains };
        delete newChains[chain];
        setFormData({ ...formData, chains: newChains });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const price = globalPrices?.[formData.symbol?.toUpperCase()];
        
        const tokenData = {
            symbol: formData.symbol.toUpperCase(),
            name: formData.name || formData.symbol,
            price: price?.price || 0,
            change24h: price?.change24h || 0,
            marketCap: price?.marketCap || 0,
            volume24h: price?.volume24h || 0,
            decimals: formData.decimals,
            type: formData.type,
            chains: formData.chains,
            addresses: {} // For future use
        };

        const result = await onCreateToken(tokenData);
        
        if (result.success) {
            onClose();
        } else {
            alert(`Failed to create token: ${result.error}`);
        }
        
        setIsSubmitting(false);
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
                <div className={styles.modalHeader}>
                    <h2>Add Custom Token</h2>
                    <button onClick={onClose} className={styles.closeBtn}>×</button>
                </div>

                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div className={styles.formGroup}>
                        <label>Symbol *</label>
                        <input
                            type="text"
                            value={formData.symbol}
                            onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                            placeholder="e.g., BTC"
                            required
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., Bitcoin"
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Decimals</label>
                        <input
                            type="number"
                            value={formData.decimals}
                            onChange={(e) => setFormData({ ...formData, decimals: parseInt(e.target.value) })}
                            min="0"
                            max="18"
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Type</label>
                        <select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        >
                            <option value="custom">Custom</option>
                            <option value="1inch">1inch</option>
                            <option value="binance">Binance</option>
                            <option value="coinbase">Coinbase</option>
                        </select>
                    </div>

                    <div className={styles.chainSection}>
                        <h3>Chain Addresses</h3>
                        
                        <div className={styles.chainInput}>
                            <select
                                value={selectedChain}
                                onChange={(e) => setSelectedChain(e.target.value)}
                                className={styles.chainSelect}
                            >
                                {chainOptions.map(chain => (
                                    <option key={chain.id} value={chain.id}>{chain.label}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                placeholder="Contract address"
                                className={styles.addressInput}
                            />
                            <button
                                type="button"
                                onClick={handleAddChain}
                                className={styles.addChainBtn}
                            >
                                Add
                            </button>
                        </div>

                        <div className={styles.chainList}>
                            {Object.entries(formData.chains).map(([chain, address]) => (
                                <div key={chain} className={styles.chainItem}>
                                    <span className={styles.chainName}>{chain}:</span>
                                    <span className={styles.chainAddress}>
                                        {address.substring(0, 6)}...{address.substring(address.length - 4)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveChain(chain)}
                                        className={styles.removeChainBtn}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            {Object.keys(formData.chains).length === 0 && (
                                <div className={styles.noChains}>No chain addresses added</div>
                            )}
                        </div>
                    </div>

                    {formData.symbol && globalPrices?.[formData.symbol.toUpperCase()] && (
                        <div className={styles.pricePreview}>
                            <h4>Price Preview</h4>
                            <div>Price: ${globalPrices[formData.symbol.toUpperCase()].price.toFixed(4)}</div>
                            <div>24h Change: {globalPrices[formData.symbol.toUpperCase()].change24h?.toFixed(2)}%</div>
                        </div>
                    )}

                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelBtn}>
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className={styles.submitBtn}
                            disabled={isSubmitting || !formData.symbol}
                        >
                            {isSubmitting ? 'Adding...' : 'Add Token'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}