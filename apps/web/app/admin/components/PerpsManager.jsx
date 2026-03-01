// app/admin/components/PerpsManager.tsx
"use client";

import { useState, useMemo } from "react";
import { usePerps } from "@/contexts/PerpsContext";
import { usePerpsCrud } from "@/hooks/usePerpsCrud";
import PerpsTable from "./perps/PerpsTable";
import AddPerpModal from "./perps/AddPerpModal";
import styles from "./styles/PerpsManager.module.css";

export default function PerpsManager() {
    const { tokens, loading, error, refreshTokens } = usePerps();
    const { createPerp, updatePerp, deletePerp, toggleActive, loading: crudLoading } = usePerpsCrud();
    
    const [searchTerm, setSearchTerm] = useState("");
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingToken, setEditingToken] = useState(null);
    const [status, setStatus] = useState({ type: '', message: '' });

    const filteredTokens = useMemo(() => {
        if (!tokens) return [];
        const term = searchTerm.toLowerCase();
        return tokens.filter(t => 
            t.symbol?.toLowerCase().includes(term) ||
            t.name?.toLowerCase().includes(term) ||
            t.uuid?.toLowerCase().includes(term)
        );
    }, [tokens, searchTerm]);

    const handleAddPerp = async (data) => {
        const result = await createPerp(data);
        if (result.success) {
            setStatus({ type: 'success', message: `✅ Added ${data.symbol} to perpetuals` });
            setShowAddModal(false);
        } else {
            setStatus({ type: 'error', message: `❌ Failed: ${result.error}` });
        }
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const handleUpdatePerp = async (symbol, data) => {
        const result = await updatePerp(symbol, data);
        if (result.success) {
            setStatus({ type: 'success', message: `✅ Updated ${symbol}` });
            setEditingToken(null);
        } else {
            setStatus({ type: 'error', message: `❌ Failed: ${result.error}` });
        }
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const handleDeletePerp = async (symbol) => {
        if (!confirm(`Are you sure you want to delete ${symbol}?`)) return;
        
        const result = await deletePerp(symbol);
        if (result.success) {
            setStatus({ type: 'success', message: `✅ Deleted ${symbol}` });
        } else {
            setStatus({ type: 'error', message: `❌ Failed: ${result.error}` });
        }
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    };

    const handleToggleActive = async (symbol, currentActive) => {
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
                    <div className={styles.statValue}>{tokens.filter(t => t.is_active).length}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Inactive</div>
                    <div className={styles.statValue}>{tokens.filter(t => !t.is_active).length}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Max Leverage Avg</div>
                    <div className={styles.statValue}>
                        {Math.round(tokens.reduce((acc, t) => acc + (t.max_leverage || 0), 0) / tokens.length)}x
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
                    onEdit={setEditingToken}
                    onDelete={handleDeletePerp}
                    onToggleActive={handleToggleActive}
                    crudLoading={crudLoading}
                />
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
                    onSubmit={(data) => handleUpdatePerp(editingToken.symbol, data)}
                    loading={crudLoading}
                />
            )}
        </div>
    );
}