// components/Admin/Tables/OneInchCompareTable.jsx
import React, { useState, useMemo } from 'react';
import TokenDetails from './TokenDetails';
import './OneInchCompare.module.css';

export default function OneInchCompareTable({
    dbTokens,
    oneInchTokens,
    oneInchMap,
    globalPrices,
    dbTokenMap,
    onClose,
    onAddFromOneInch,
    onUpdateToken,
    onDeleteToken,
    chainId,
    setChainId,
    formatPrice
}) {
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [dbSearch, setDbSearch] = useState('');
    const [oneInchSearch, setOneInchSearch] = useState('');
    const [status, setStatus] = useState({ type: '', message: '' });
    const [adding, setAdding] = useState(false);

    const chainOptions = [
        { key: 'ethereum', label: 'Ethereum', id: '1' },
        { key: 'bnb', label: 'BNB', id: '56' },
        { key: 'polygon', label: 'Polygon', id: '137' },
        { key: 'arbitrum', label: 'Arbitrum', id: '42161' }
    ];

    const filteredDb = useMemo(() => {
        const term = dbSearch.toLowerCase();
        return (dbTokens || []).filter(t => 
            t.symbol?.toLowerCase().includes(term) ||
            t.name?.toLowerCase().includes(term)
        );
    }, [dbTokens, dbSearch]);

    const filteredOneInch = useMemo(() => {
        const term = oneInchSearch.toLowerCase();
        return (oneInchTokens || []).filter(t => 
            t.symbol?.toLowerCase().includes(term) ||
            t.name?.toLowerCase().includes(term)
        );
    }, [oneInchTokens, oneInchSearch]);

    const handleAddFromOneInch = async (symbol) => {
        setAdding(true);
        const token = oneInchMap[symbol];
        const globalPrice = globalPrices?.[symbol];
        
        const result = await onAddFromOneInch({
            symbol,
            name: token.name || symbol,
            price: globalPrice?.price || 0,
            decimals: token.decimals || 18,
            type: token.type || '1inch',
            oneinch_data: token,
            chains: { [chainId]: token.address }
        });

        setStatus({
            type: result.success ? 'success' : 'error',
            message: result.success ? `Added ${symbol}` : result.error
        });
        setAdding(false);
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const selectedDb = selectedSymbol ? dbTokenMap.get(selectedSymbol.toLowerCase()) : null;
    const selectedOneInch = selectedSymbol ? oneInchMap[selectedSymbol] : null;
    const selectedPrice = selectedSymbol ? globalPrices?.[selectedSymbol] : null;

    return (
        <div className="oneinch-compare">
            <div className="compare-header">
                <h2>DB vs 1inch</h2>
                <button onClick={onClose} className="close-btn">← Back</button>
            </div>

            {status.message && (
                <div className={`status-message ${status.type}`}>
                    {status.message}
                </div>
            )}

            <div className="compare-controls">
                <div className="search-box">
                    <label>Search DB:</label>
                    <input
                        type="text"
                        value={dbSearch}
                        onChange={(e) => setDbSearch(e.target.value)}
                        placeholder="Symbol or name..."
                    />
                </div>
                
                <div className="chain-selector">
                    <label>Chain:</label>
                    <select value={chainId} onChange={(e) => setChainId(e.target.value)}>
                        {chainOptions.map(c => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                    </select>
                </div>

                <div className="search-box">
                    <label>Search 1inch:</label>
                    <input
                        type="text"
                        value={oneInchSearch}
                        onChange={(e) => setOneInchSearch(e.target.value)}
                        placeholder="Symbol or name..."
                    />
                </div>
            </div>

            <div className="compare-grid">
                {/* DB Tokens Column */}
                <div className="compare-column">
                    <h3>Database Tokens ({filteredDb.length})</h3>
                    <table className="compare-table">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Name</th>
                                <th>In 1inch</th>
                                <th>Price</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDb.map(token => (
                                <tr
                                    key={token.id}
                                    onClick={() => setSelectedSymbol(token.symbol)}
                                    className={selectedSymbol === token.symbol ? 'selected' : ''}
                                >
                                    <td><strong>{token.symbol}</strong></td>
                                    <td>{token.name}</td>
                                    <td>{oneInchMap[token.symbol] ? '✅' : '—'}</td>
                                    <td>{globalPrices?.[token.symbol]?.price ? '$' + globalPrices[token.symbol].price.toFixed(4) : '—'}</td>
                                    <td>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteToken(token.symbol);
                                            }}
                                            className="action-btn danger small"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 1inch Tokens Column */}
                <div className="compare-column">
                    <h3>1inch Tokens ({filteredOneInch.length})</h3>
                    <table className="compare-table">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Name</th>
                                <th>In DB</th>
                                <th>Price</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOneInch.map(token => (
                                <tr
                                    key={token.address}
                                    onClick={() => setSelectedSymbol(token.symbol)}
                                    className={selectedSymbol === token.symbol ? 'selected' : ''}
                                >
                                    <td><strong>{token.symbol}</strong></td>
                                    <td>{token.name}</td>
                                    <td>{dbTokenMap.has(token.symbol.toLowerCase()) ? '✅' : '—'}</td>
                                    <td>{globalPrices?.[token.symbol]?.price ? '$' + globalPrices[token.symbol].price.toFixed(4) : '—'}</td>
                                    <td>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddFromOneInch(token.symbol);
                                            }}
                                            disabled={adding || dbTokenMap.has(token.symbol.toLowerCase())}
                                            className="action-btn primary small"
                                        >
                                            {dbTokenMap.has(token.symbol.toLowerCase()) ? 'Added' : 'Add'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Details Panel */}
            {(selectedDb || selectedOneInch || selectedPrice) && (
                <div className="details-panel">
                    <h3>Details: {selectedSymbol}</h3>
                    <div className="details-grid">
                        {selectedDb && (
                            <div className="detail-section">
                                <h4>Database</h4>
                                <TokenDetails
                                    token={selectedDb}
                                    onUpdate={onUpdateToken}
                                    globalPrice={selectedPrice}
                                />
                            </div>
                        )}
                        {selectedOneInch && (
                            <div className="detail-section">
                                <h4>1inch Data</h4>
                                <pre className="json-view">
                                    {JSON.stringify(selectedOneInch, null, 2)}
                                </pre>
                            </div>
                        )}
                        {selectedPrice && !selectedDb && (
                            <div className="detail-section">
                                <h4>Price Data</h4>
                                <div className="price-details">
                                    <div>Price: ${selectedPrice.price.toFixed(4)}</div>
                                    <div>Source: {selectedPrice.source}</div>
                                    <div>Updated: {new Date(selectedPrice.timestamp).toLocaleString()}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}