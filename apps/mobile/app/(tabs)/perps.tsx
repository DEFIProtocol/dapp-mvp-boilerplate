import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cancelPerpOrder } from '@dapp/trading-api';
import { usePerpsOrderBookPolling, usePerpsPendingOrdersPolling } from '@dapp/trading-hooks';
import type { OrderBookLevel, PendingPerpOrder } from '@dapp/trading-types/perps';
import { TraderAddressCard } from '@/components/TraderAddressCard';
import { WalletStatusBanner } from '@/components/WalletStatusBanner';
import { useTrader } from '@/context/TraderContext';
import { useAccount } from 'wagmi';
import '@/lib/tradingApi';

const SYMBOL = 'ETH';

function formatPrice(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatSize(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function PerpsTabScreen() {
  const { traderAddress } = useTrader();
  const { isConnected } = useAccount();
  const perpAddress = process.env.EXPO_PUBLIC_PERP_ADDRESS || '';
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: bookSnapshot,
    loading,
    error,
    refresh: refreshOrderBook,
  } = usePerpsOrderBookPolling(SYMBOL, 8, { intervalMs: 2500 });

  const {
    data: pendingOrders,
    error: ordersError,
    refresh: refreshPendingOrders,
    setData: setPendingOrders,
  } = usePerpsPendingOrdersPolling(traderAddress, SYMBOL, perpAddress, { intervalMs: 3000 });

  const bids: OrderBookLevel[] = bookSnapshot?.bids ?? [];
  const asks: OrderBookLevel[] = bookSnapshot?.asks ?? [];

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshOrderBook(), refreshPendingOrders()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancelOrder = async (order: PendingPerpOrder) => {
    if (!isConnected) {
      setActionError('Connect wallet to cancel perp intents.');
      return;
    }

    setActionError(null);
    setCancelingOrderId(order.id);
    const previous = pendingOrders ?? [];
    setPendingOrders((current) => (current ?? []).filter((item) => item.id !== order.id));

    try {
      await cancelPerpOrder(order.id, traderAddress);
      await refreshPendingOrders();
      await refreshOrderBook();
    } catch (err) {
      setPendingOrders(previous);
      setActionError(err instanceof Error ? err.message : 'Failed to cancel perp intent');
    } finally {
      setCancelingOrderId(null);
    }
  };

  const spread = useMemo(() => {
    if (!bids[0] || !asks[0]) return null;
    return Math.max(asks[0].price - bids[0].price, 0);
  }, [bids, asks]);

  const maxRows = Math.max(bids.length, asks.length, 8);

  useEffect(() => {
    if (isConnected && actionError?.toLowerCase().includes('connect wallet')) {
      setActionError(null);
    }
  }, [isConnected, actionError]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <TraderAddressCard />
      <WalletStatusBanner />

      <Text style={styles.title}>Perps Orderbook</Text>
      <Text style={styles.subtitle}>{SYMBOL}-USD native depth via backend</Text>
      {!perpAddress ? <Text style={styles.warn}>Set EXPO_PUBLIC_PERP_ADDRESS to load pending perp intents.</Text> : null}

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Best bid: {bids[0] ? formatPrice(bids[0].price) : '--'}</Text>
        <Text style={styles.metaLabel}>Best ask: {asks[0] ? formatPrice(asks[0].price) : '--'}</Text>
      </View>
      <Text style={styles.metaLabel}>Spread: {spread === null ? '--' : formatPrice(spread)}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {ordersError ? <Text style={styles.error}>{ordersError}</Text> : null}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <View style={styles.table}>
        <View style={styles.rowHeader}>
          <Text style={styles.headCell}>Bid size</Text>
          <Text style={styles.headCell}>Bid</Text>
          <Text style={styles.headCell}>Ask</Text>
          <Text style={styles.headCell}>Ask size</Text>
        </View>
        {Array.from({ length: maxRows }, (_, i) => {
          const bid = bids[i];
          const ask = asks[i];
          return (
            <View key={`depth-${i}`} style={styles.row}>
              <Text style={styles.cell}>{bid ? formatSize(bid.size) : '--'}</Text>
              <Text style={[styles.cell, styles.bid]}>{bid ? formatPrice(bid.price) : '--'}</Text>
              <Text style={[styles.cell, styles.ask]}>{ask ? formatPrice(ask.price) : '--'}</Text>
              <Text style={styles.cell}>{ask ? formatSize(ask.size) : '--'}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.table}>
        <View style={styles.rowHeader}>
          <Text style={styles.headCellWide}>Open Perp Intents</Text>
        </View>
        {(pendingOrders ?? []).length === 0 ? (
          <View style={styles.row}>
            <Text style={styles.cellWide}>No open intents</Text>
          </View>
        ) : (
          (pendingOrders ?? []).slice(0, 6).map((order) => {
            const isCanceling = cancelingOrderId === order.id;
            return (
              <View key={order.id} style={styles.intentRow}>
                <View style={styles.intentMeta}>
                  <Text style={styles.intentTitle}>
                    {order.side} {order.exposureUsd.toFixed(2)} USD {order.orderType}
                  </Text>
                  <Text style={styles.intentSubtle}>#{order.id.slice(0, 10)} • {order.status}</Text>
                </View>
                <Pressable
                  disabled={isCanceling || !isConnected}
                  style={[styles.cancelButton, (!isConnected || isCanceling) ? styles.cancelButtonDisabled : null]}
                  onPress={() => void handleCancelOrder(order)}>
                  <Text style={styles.cancelText}>{isCanceling ? 'Canceling' : 'Cancel'}</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.footer}>
        {loading ? 'Loading...' : `Updated: ${bookSnapshot?.timestamp ?? 'unknown'}`}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaLabel: {
    fontSize: 13,
    color: '#334155',
  },
  table: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  headCell: {
    width: '24%',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    color: '#334155',
  },
  cell: {
    width: '24%',
    fontSize: 12,
    textAlign: 'right',
    color: '#0f172a',
  },
  bid: {
    color: '#15803d',
  },
  ask: {
    color: '#dc2626',
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
  },
  warn: {
    color: '#92400e',
    fontSize: 12,
  },
  headCellWide: {
    width: '100%',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'left',
    color: '#334155',
  },
  cellWide: {
    width: '100%',
    fontSize: 12,
    textAlign: 'left',
    color: '#334155',
  },
  intentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  intentMeta: {
    flex: 1,
    gap: 2,
  },
  intentTitle: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  intentSubtle: {
    fontSize: 11,
    color: '#64748b',
  },
  cancelButton: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelButtonDisabled: {
    opacity: 0.55,
  },
  cancelText: {
    color: '#b91c1c',
    fontWeight: '600',
    fontSize: 11,
  },
  footer: {
    marginTop: 6,
    color: '#64748b',
    fontSize: 12,
  },
});
