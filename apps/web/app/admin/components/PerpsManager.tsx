// app/admin/components/PerpsManager.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { usePerps } from "@/contexts/PerpsContext";
import { usePerpsCrud } from "@/hooks/usePerpsCrud";
import { useOracleRound } from "@/hooks/useOracleRound";
import { usePythFundingRate } from "@/hooks/pyth/usePythFundingRate";
import { usePythPrice } from "@/hooks/pyth/usePythPrice"; // Add this line
import PerpsTable from "./perps/PerpsTable";
import AddPerpModal from "./perps/AddPerpModal";
import PriceCard from "./perps/PriceCard";
import styles from "./styles/PerpsManager.module.css";
import type { PerpsToken, PerpsTokenFormData } from "@/types/perps";

interface StatusMessage {
    type: 'success' | 'error' | '';
    message: string;
}

// Token configurations for oracle data
const ORACLE_TOKENS = [
  { symbol: 'BTC', chain: 'ethereum', token: 'btc', feedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
  { symbol: 'ETH', chain: 'ethereum', token: 'eth', feedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
  { symbol: 'SOL', chain: 'ethereum', token: 'sol', feedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' },
  { symbol: 'AVAX', chain: 'avalanche', token: 'avax', feedId: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7' },
  { symbol: 'BNB', chain: 'bsc', token: 'bnb', feedId: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f' },
  { symbol: 'LINK', chain: 'ethereum', token: 'link', feedId: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221' },
];

export default function PerpsManager() {
    const { tokens, loading, error, refreshTokens } = usePerps();
    const { createPerp, updatePerp, deletePerp, toggleActive, loading: crudLoading } = usePerpsCrud();
    
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [showAddModal, setShowAddModal] = useState<boolean>(false);
    const [editingToken, setEditingToken] = useState<PerpsToken | null>(null);
    const [status, setStatus] = useState<StatusMessage>({ type: '', message: '' });
    const [selectedPriceCard, setSelectedPriceCard] = useState<string | null>(null);

    // Use your hooks for each token
    const btcOracle = useOracleRound('ethereum', 'btc', 15000);
    const ethOracle = useOracleRound('ethereum', 'eth', 15000);
    const solOracle = useOracleRound('ethereum', 'sol', 15000);
    const avaxOracle = useOracleRound('avalanche', 'avax', 15000);
    const bnbOracle = useOracleRound('bsc', 'bnb', 15000);
    const linkOracle = useOracleRound('ethereum', 'link', 15000);
    // Keep funding rate hooks at slower interval
const btcFunding = usePythFundingRate('0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', 15000);
const ethFunding = usePythFundingRate('0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', 15000);
const solFunding = usePythFundingRate('0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', 15000);
const avaxFunding = usePythFundingRate('0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7', 15000);
const bnbFunding = usePythFundingRate('0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f', 15000);
const linkFunding = usePythFundingRate('0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221', 15000);
    // Use your funding rate hooks
    const btcPrice = usePythPrice('ethereum', 'btc/usd', 1000); // 1 second updates
const ethPrice = usePythPrice('ethereum', 'eth/usd', 1000);
const solPrice = usePythPrice('ethereum', 'sol/usd', 1000);
const avaxPrice = usePythPrice('avalanche', 'avax/usd', 1000);
const bnbPrice = usePythPrice('bsc', 'bnb/usd', 1000);
const linkPrice = usePythPrice('ethereum', 'link/usd', 1000);
    // Map hook data to tokens
    const oracleDataMap = {
        BTC: btcOracle.data,
        ETH: ethOracle.data,
        SOL: solOracle.data,
        AVAX: avaxOracle.data,
        BNB: bnbOracle.data,
        LINK: linkOracle.data,
    };

    const fundingDataMap = {
        BTC: btcFunding.data,
        ETH: ethFunding.data,
        SOL: solFunding.data,
        AVAX: avaxFunding.data,
        BNB: bnbFunding.data,
        LINK: linkFunding.data,
    };

    const filteredTokens = useMemo(() => {
        if (!tokens) return [];
        const term = searchTerm.toLowerCase();
        return tokens.filter((t: PerpsToken) => {
            const symbolMatch = t.symbol?.toLowerCase().includes(term);
            const nameMatch = t.name?.toLowerCase().includes(term);
            const uuidMatch = typeof t.uuid === 'string' && t.uuid.toLowerCase().includes(term);
            return symbolMatch || nameMatch || uuidMatch;
        });
    }, [tokens, searchTerm]);

    const handleAddPerp = async (data: PerpsTokenFormData) => {
        const result = await createPerp(data);
        if (result.success) {
            setStatus({ type: 'success', message: `✅ Added ${data.symbol} to perpetuals` });
            setShowAddModal(false);
        } else {
            setStatus({ type: 'error', message: `❌ Failed: ${result.error}` });
        }
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const handleUpdatePerp = async (symbol: string, data: PerpsTokenFormData) => {
        const result = await updatePerp(symbol, data);
        if (result.success) {
            setStatus({ type: 'success', message: `✅ Updated ${symbol}` });
            setEditingToken(null);
        } else {
            setStatus({ type: 'error', message: `❌ Failed: ${result.error}` });
        }
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const handleDeletePerp = async (symbol: string) => {
        if (!confirm(`Are you sure you want to delete ${symbol}?`)) return;
        
        const result = await deletePerp(symbol);
        if (result.success) {
            setStatus({ type: 'success', message: `✅ Deleted ${symbol}` });
        } else {
            setStatus({ type: 'error', message: `❌ Failed: ${result.error}` });
        }
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const handleToggleActive = async (symbol: string, currentActive: boolean) => {
        const result = await toggleActive(symbol, !currentActive);
        if (result.success) {
            setStatus({ type: 'success', message: `✅ ${symbol} ${!currentActive ? 'activated' : 'deactivated'}` });
        } else {
            setStatus({ type: 'error', message: `❌ Failed: ${result.error}` });
        }
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner}></div>
                <div className={styles.loadingText}>Loading perpetual tokens...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorState}>
                <h3>⚠️ Error Loading Perpetuals</h3>
                <p>{error}</p>
                <button onClick={refreshTokens} className={styles.retryButton}>
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className={styles.perpsManager}>
            {/* Header Stats */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Perpetuals</div>
                    <div className={styles.statValue}>{tokens.length}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Active</div>
                    <div className={styles.statValue}>{tokens.filter((t: PerpsToken) => t.is_active).length}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Inactive</div>
                    <div className={styles.statValue}>{tokens.filter((t: PerpsToken) => !t.is_active).length}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Max Leverage Avg</div>
                    <div className={styles.statValue}>
                        {tokens.length > 0 
                            ? Math.round(tokens.reduce((acc: number, t: PerpsToken) => acc + (t.max_leverage || 0), 0) / tokens.length) 
                            : 0}x
                    </div>
                </div>
            </div>

            {/* Status Messages */}
            {status.message && (
                <div className={`${styles.statusMessage} ${styles[status.type]}`}>
                    {status.message}
                </div>
            )}

            {/* Action Bar */}
            <div className={styles.actionBar}>
                <div className={styles.searchWrapper}>
                    <input
                        type="text"
                        placeholder="Search by symbol, name, or UUID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
                
                <div className={styles.actionButtons}>
                    <button 
                        onClick={() => setShowAddModal(true)}
                        className={`${styles.actionBtn} ${styles.primary}`}
                    >
                        <span className={styles.btnIcon}>➕</span>
                        Add Perpetual
                    </button>
                </div>
            </div>

            {/* Perps Table */}
            <div className={styles.tableSection}>
                <PerpsTable
                    tokens={filteredTokens}
                    onEdit={(token: PerpsToken) => setEditingToken(token)}
                    onDelete={handleDeletePerp}
                    onToggleActive={handleToggleActive}
                    crudLoading={crudLoading}
                />
            </div>

            {/* Oracle Price Cards Section - AT THE BOTTOM */}
            <div className={styles.oracleSection}>
                <div className={styles.sectionHeader}>
                    <h3>
                        <span className={styles.headerIcon}>🔮</span>
                        Live Oracle Prices & Funding Rates
                    </h3>
                    <div className={styles.updateBadge}>
                        Updates every 15s
                    </div>
                </div>
                <div className={styles.priceCardsGrid}>
                    {ORACLE_TOKENS.map((token) => {
                        const oracle = oracleDataMap[token.symbol as keyof typeof oracleDataMap];
                        const funding = fundingDataMap[token.symbol as keyof typeof fundingDataMap];
                        
                        return (
                            <div key={token.symbol} className={styles.priceCardWrapper}>

<PriceCard
    token={token.symbol}
    // Chainlink data
    chainlinkPrice={oracle?.price}
    chainlinkTimestamp={oracle?.timestamp}
    chainlinkRoundId={oracle?.roundId}
    // Pyth data
    pythPrice={funding?.spot_price}
    pythEmaPrice={funding?.ema_price}
    // Funding rate
    fundingRate={funding?.funding_rate}
    fundingRatePercent={funding?.funding_rate_percent}
    // State
    onClick={() => setSelectedPriceCard(token.symbol)}
    isSelected={selectedPriceCard === token.symbol}
/>
                                
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <AddPerpModal
                    onClose={() => setShowAddModal(false)}
                    onSubmit={handleAddPerp}
                    loading={crudLoading}
                />
            )}

            {/* Edit Modal */}
            {editingToken && (
                <AddPerpModal
                    token={editingToken}
                    onClose={() => setEditingToken(null)}
                    onSubmit={(data: PerpsTokenFormData) => handleUpdatePerp(editingToken.symbol, data)}
                    loading={crudLoading}
                />
            )}
        </div>
    );
}