"use client";
import React from "react";
// app/admin/components/perps/PerpsTable.tsx

import { useState } from "react";
import { PerpsToken } from "@/types/perps";
import styles from "./PerpsTable.module.css";

interface PerpsTableProps {
    tokens: PerpsToken[];
    onEdit: (token: PerpsToken) => void;
    onDelete: (symbol: string) => void;
    onToggleActive: (symbol: string, currentActive: boolean) => void;
    crudLoading: boolean;
}

export default function PerpsTable({ 
    tokens, 
    onEdit, 
    onDelete, 
    onToggleActive,
    crudLoading 
}: PerpsTableProps) {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    const toggleRowExpansion = (id: number) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const formatNumber = (num?: number) => {
        if (num === undefined || num === null) return '—';
        return num.toLocaleString();
    };

    return (
        <div className={styles.tableWrapper}>
            <table className={styles.perpsTable}>
                <thead>
                    <tr>
                        <th className={styles.expandCol}></th>
                        <th>Symbol</th>
                        <th>Name</th>
                        <th>UUID</th>
                        <th>Pair</th>
                        <th>Leverage</th>
                        <th>Position Size</th>
                        <th>Maintenance</th>
                        <th>Status</th>
                        <th className={styles.actionsCol}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {tokens.map((token) => {
                        const isExpanded = expandedRows.has(token.id!);
                        const isActive = token.is_active !== false;

                        return (
                            <React.Fragment key={token.id}>
                                <tr className={`${styles.tokenRow} ${!isActive ? styles.inactive : ''}`}>
                                    <td className={styles.expandCol}>
                                        <button
                                            onClick={() => toggleRowExpansion(token.id!)}
                                            className={styles.expandBtn}
                                        >
                                            {isExpanded ? '▼' : '▶'}
                                        </button>
                                    </td>
                                    <td className={styles.symbolCell}>
                                        <strong>{token.symbol}</strong>
                                    </td>
                                    <td>{token.name}</td>
                                    <td className={styles.uuidCell}>
                                        {token.uuid ? 
                                            `${token.uuid.substring(0, 8)}...` : 
                                            '—'
                                        }
                                    </td>
                                    <td>{token.pair_standard || '—'}</td>
                                    <td>
                                        {token.min_leverage}x - {token.max_leverage}x
                                    </td>
                                    <td>
                                        ${formatNumber(token.min_position_size)} - ${formatNumber(token.max_position_size)}
                                    </td>
                                    <td>
                                        {token.maintenance_margin ? 
                                            `${(token.maintenance_margin * 100).toFixed(2)}%` : 
                                            '—'
                                        }
                                    </td>
                                    <td>
                                        <span className={`${styles.statusBadge} ${isActive ? styles.active : styles.inactive}`}>
                                            {isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className={styles.actionsCell}>
                                        <button
                                            onClick={() => onEdit(token)}
                                            className={`${styles.actionBtn} ${styles.info} ${styles.small}`}
                                            disabled={crudLoading}
                                            title="Edit"
                                        >
                                            ✎
                                        </button>
                                        <button
                                            onClick={() => onToggleActive(token.symbol, isActive)}
                                            className={`${styles.actionBtn} ${isActive ? styles.warning : styles.success} ${styles.small}`}
                                            disabled={crudLoading}
                                            title={isActive ? 'Deactivate' : 'Activate'}
                                        >
                                            {isActive ? '🔴' : '🟢'}
                                        </button>
                                        <button
                                            onClick={() => onDelete(token.symbol)}
                                            className={`${styles.actionBtn} ${styles.danger} ${styles.small}`}
                                            disabled={crudLoading}
                                            title="Delete"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                                
                                {isExpanded && (
                                    <tr className={styles.detailsRow}>
                                        <td colSpan={10}>
                                            <div className={styles.tokenDetails}>
                                                <div className={styles.detailsGrid}>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>UUID:</span>
                                                        <span className={styles.detailValue}>{token.uuid || '—'}</span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Pair Inverse:</span>
                                                        <span className={styles.detailValue}>{token.pair_inverse || '—'}</span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Base Precision:</span>
                                                        <span className={styles.detailValue}>{token.base_precision || 8}</span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Quote Precision:</span>
                                                        <span className={styles.detailValue}>{token.quote_precision || 2}</span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Funding Rate Coef:</span>
                                                        <span className={styles.detailValue}>
                                                            {token.funding_rate_coefficient ? 
                                                                `${(token.funding_rate_coefficient * 100).toFixed(4)}%` : 
                                                                '0.01%'
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className={styles.detailItem}>
                                                        <span className={styles.detailLabel}>Created:</span>
                                                        <span className={styles.detailValue}>
                                                            {token.created_at ? new Date(token.created_at).toLocaleString() : '—'}
                                                        </span>
                                                    </div>
                                                    {token.icon_url && (
                                                        <div className={styles.detailItem}>
                                                            <span className={styles.detailLabel}>Icon:</span>
                                                            <img src={token.icon_url} alt={token.symbol} className={styles.tokenIcon} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                    {tokens.length === 0 && (
                        <tr>
                            <td colSpan={10} className={styles.noResults}>
                                No perpetual tokens found
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}