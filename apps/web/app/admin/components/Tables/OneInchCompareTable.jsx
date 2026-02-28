// components/Admin/Tables/OneInchCompareTable.jsx
import React, { useState, useMemo, useRef } from 'react';
import TokenDetails from './TokenDetails';
import styles from './OneInchCompare.module.css';

export default function OneInchCompareTable({
    dbTokens,
    oneInchTokens,
    globalPrices,
    dbTokenMap,
    onClose,
    onAddFromOneInch,
    onUpdateToken,
    onDeleteToken,
    chainId,
    setChainId,
    currentChainKey
}) {
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [dbSearch, setDbSearch] = useState('');
    const [oneInchSearch, setOneInchSearch] = useState('');
    const [status, setStatus] = useState({ type: '', message: '' });
    const [adding, setAdding] = useState(false);
    
    // Refs for synchronized scrolling
    const leftTableRef = useRef(null);
    const rightTableRef = useRef(null);

    const handleScroll = (e, source) => {
        if (source === 'left' && rightTableRef.current) {
            rightTableRef.current.scrollTop = e.target.scrollTop;
        } else if (source === 'right' && leftTableRef.current) {
            leftTableRef.current.scrollTop = e.target.scrollTop;
        }
    };

    const chainOptions = [
        { key: 'ethereum', label: 'Ethereum', id: 1 },
        { key: 'bnb', label: 'BSC', id: 56 },
        { key: 'polygon', label: 'Polygon', id: 137 },
        { key: 'arbitrum', label: 'Arbitrum', id: 42161 },
        { key: 'avalanche', label: 'Avalanche', id: 43114 }
    ];

    // Filter 1inch tokens NOT in DB
    const oneInchTokensNotInDb = useMemo(() => {
        const dbSymbols = new Set(dbTokens.map(t => t.symbol?.toUpperCase()));
        return (oneInchTokens || []).filter(token => {
            const symbol = token.symbol?.toUpperCase();
            return symbol && !dbSymbols.has(symbol);
        });
    }, [oneInchTokens, dbTokens]);

    // Search filtering
    const filteredDb = useMemo(() => {
        const term = dbSearch.toLowerCase();
        return dbTokens.filter(t => 
            !term || t.symbol?.toLowerCase().includes(term) || t.name?.toLowerCase().includes(term)
        );
    }, [dbTokens, dbSearch]);

    const filteredOneInch = useMemo(() => {
        const term = oneInchSearch.toLowerCase();
        return oneInchTokensNotInDb.filter(t => 
            !term || t.symbol?.toLowerCase().includes(term) || t.name?.toLowerCase().includes(term)
        );
    }, [oneInchTokensNotInDb, oneInchSearch]);

    const handleAddFromOneInch = async (symbol) => {
        setAdding(true);
        setStatus({ type: '', message: '' });

        const oneInchToken = oneInchTokens.find(t => t.symbol?.toUpperCase() === symbol);
        const rapidCoin = globalPrices?.[symbol];
        
        if (!rapidCoin?.uuid) {
            setStatus({ type: 'error', message: `Token ${symbol} missing UUID in RapidAPI` });
            setAdding(false);
            setTimeout(() => setStatus({ type: '', message: '' }), 3000);
            return;
        }

        if (!oneInchToken?.address) {
            setStatus({ type: 'error', message: `Token ${symbol} missing address in 1inch` });
            setAdding(false);
            setTimeout(() => setStatus({ type: '', message: '' }), 3000);
            return;
        }

        const existingToken = dbTokenMap.get(symbol.toLowerCase());
        
        const result = existingToken
            ? await onUpdateToken(symbol, {
                  chains: { ...(existingToken.chains || {}), [currentChainKey]: oneInchToken.address }
              })
            : await onAddFromOneInch({
                  symbol,
                  name: oneInchToken.name || rapidCoin.name || symbol,
                  price: rapidCoin.price || 0,
                  change24h: rapidCoin.change24h || 0,
                  marketCap: rapidCoin.marketCap || 0,
                  volume24h: rapidCoin.volume24h || 0,
                  decimals: oneInchToken.decimals || 18,
                  type: '1inch',
                  uuid: rapidCoin.uuid,
                  image: rapidCoin.image || oneInchToken.logoURI,
                  chains: { [currentChainKey]: oneInchToken.address }
              });

        setStatus({
            type: result.success ? 'success' : 'error',
            message: result.success 
                ? (existingToken ? `Updated ${symbol}` : `Added ${symbol}`)
                : result.error || 'Failed to add token'
        });
        
        setAdding(false);
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    return (
        <div className={styles.oneinchCompare}>
            {/* Header */}
            <div className={styles.compareHeader}>
                <h2>DB vs 1inch - {currentChainKey.toUpperCase()}</h2>
                <button onClick={onClose} className={styles.closeBtn}>← Back</button>
            </div>

            {/* Status Messages */}
            {status.message && (
                <div className={`${styles.statusMessage} ${styles[status.type]}`}>
                    {status.message}
                </div>
            )}

            {/* Chain Selector */}
            <div className={styles.chainSelector}>
                <label>Chain:</label>
                <select 
                    value={chainId} 
                    onChange={(e) => setChainId(Number(e.target.value))}
                    className={styles.chainSelect}
                >
                    {chainOptions.map(chain => (
                        <option key={chain.id} value={chain.id}>
                            {chain.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Search Controls */}
            <div className={styles.compareControls}>
                <div className={styles.searchBox}>
                    <label>🔍 Database Tokens ({filteredDb.length})</label>
                    <input
                        type="text"
                        value={dbSearch}
                        onChange={(e) => setDbSearch(e.target.value)}
                        placeholder="Search..."
                        className={styles.searchInput}
                    />
                </div>
                
                <div className={styles.searchBox}>
                    <label>🔍 1inch Tokens to Add ({filteredOneInch.length})</label>
                    <input
                        type="text"
                        value={oneInchSearch}
                        onChange={(e) => setOneInchSearch(e.target.value)}
                        placeholder="Search..."
                        className={styles.searchInput}
                    />
                </div>
            </div>

            <div className={styles.compareGrid}>
                {/* DB Tokens Column */}
                <div className={styles.compareColumn}>
                    <h3>Database Tokens on {currentChainKey}</h3>
                    <div 
                        className={styles.tableWrapper}
                        ref={leftTableRef}
                        onScroll={(e) => handleScroll(e, 'left')}
                    >
                        <table className={styles.compareTable}>
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Name</th>
                                    <th>Address</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDb.map(token => {
                                    const chains = typeof token.chains === 'string' 
                                        ? JSON.parse(token.chains || '{}') 
                                        : (token.chains || {});
                                    const address = chains[currentChainKey];
                                    
                                    return (
                                        <tr key={token.id}>
                                            <td className={styles.symbolCell}>
                                                <strong>{token.symbol}</strong>
                                            </td>
                                            <td>{token.name}</td>
                                            <td className={styles.addressCell} title={address}>
                                                {address ? 
                                                    `${address.substring(0, 6)}...${address.substring(address.length - 4)}` 
                                                    : '—'}
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => setSelectedSymbol(token.symbol)}
                                                    className={`${styles.actionBtn} ${styles.info} ${styles.small}`}
                                                >
                                                    Details
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredDb.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className={styles.noResults}>
                                            No database tokens on {currentChainKey}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 1inch Tokens Column */}
                <div className={styles.compareColumn}>
                    <h3>1inch Tokens to Add</h3>
                    <div 
                        className={styles.tableWrapper}
                        ref={rightTableRef}
                        onScroll={(e) => handleScroll(e, 'right')}
                    >
                        <table className={styles.compareTable}>
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Name</th>
                                    <th>Price</th>
                                    <th>Address</th>
                                    <th>UUID</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredOneInch.map(token => {
                                    const symbol = token.symbol?.toUpperCase();
                                    const rapidCoin = globalPrices?.[symbol];
                                    const hasUuid = !!rapidCoin?.uuid;
                                    const hasAddress = !!token?.address;
                                    
                                    return (
                                        <tr key={token.address}>
                                            <td className={styles.symbolCell}>
                                                <strong>{symbol}</strong>
                                            </td>
                                            <td>{token.name}</td>
                                            <td className={styles.priceCell}>
                                                {rapidCoin?.price ? `$${rapidCoin.price.toFixed(4)}` : '—'}
                                            </td>
                                            <td className={styles.addressCell} title={token.address}>
                                                {token.address ? 
                                                    `${token.address.substring(0, 6)}...${token.address.substring(token.address.length - 4)}` 
                                                    : '—'}
                                            </td>
                                            <td>
                                                {rapidCoin?.uuid ? '✅' : '❌'}
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => handleAddFromOneInch(symbol)}
                                                    disabled={adding || !hasUuid || !hasAddress}
                                                    className={`${styles.actionBtn} ${styles.success} ${styles.small}`}
                                                    title={
                                                        !hasUuid ? 'Missing UUID' :
                                                        !hasAddress ? 'Missing address' :
                                                        'Add to database'
                                                    }
                                                >
                                                    Add
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredOneInch.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className={styles.noResults}>
                                            No 1inch tokens to import
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Details Panel */}
            {selectedSymbol && (
                <div className={styles.detailsPanel}>
                    <h3>Details: {selectedSymbol}</h3>
                    <TokenDetails
                        token={dbTokenMap.get(selectedSymbol.toLowerCase()) || { symbol: selectedSymbol }}
                        onUpdate={onUpdateToken}
                        globalPrice={globalPrices?.[selectedSymbol]}
                    />
                </div>
            )}
        </div>
    );
}