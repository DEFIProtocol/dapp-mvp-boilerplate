import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cancelSpotOrderIntent } from '@dapp/trading-api';
import { useSpotOrderBookPolling, useSpotOrderIntentsPolling } from '@dapp/trading-hooks';
import type { SpotDepthLevel, SpotOrderIntent } from '@dapp/trading-types/spot';
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

export default function SpotTabScreen() {
  const { traderAddress } = useTrader();
  const { isConnected } = useAccount();
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: bookSnapshot,
    loading,
    error,
    refresh: refreshOrderBook,
  } = useSpotOrderBookPolling(SYMBOL, 8, { intervalMs: 2500 });

  const {
    data: openIntents,
    error: intentsError,
    refresh: refreshIntents,
    setData: setOpenIntents,
  } = useSpotOrderIntentsPolling(traderAddress, SYMBOL, { intervalMs: 3000 });

  const bids: SpotDepthLevel[] = bookSnapshot?.bids ?? [];
  const asks: SpotDepthLevel[] = bookSnapshot?.asks ?? [];

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshOrderBook(), refreshIntents()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancelIntent = async (intent: SpotOrderIntent) => {
    if (!isConnected) {
      setActionError('Connect wallet to cancel spot intents.');
      return;
    }

    setActionError(null);
    setCancelingOrderId(intent.id);
    const previous = openIntents ?? [];
    setOpenIntents((current) => (current ?? []).filter((item) => item.id !== intent.id));

    try {
      await cancelSpotOrderIntent(intent.id, traderAddress);
      await refreshIntents();
      await refreshOrderBook();
    } catch (err) {
      setOpenIntents(previous);
      setActionError(err instanceof Error ? err.message : 'Failed to cancel spot intent');
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

      <Text style={styles.title}>Spot Orderbook</Text>
      <Text style={styles.subtitle}>{SYMBOL}-USD native depth via backend</Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Best bid: {bids[0] ? formatPrice(bids[0].price) : '--'}</Text>
        <Text style={styles.metaLabel}>Best ask: {asks[0] ? formatPrice(asks[0].price) : '--'}</Text>
      </View>
      <Text style={styles.metaLabel}>Spread: {spread === null ? '--' : formatPrice(spread)}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {intentsError ? <Text style={styles.error}>{intentsError}</Text> : null}
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
          <Text style={styles.headCellWide}>Open Spot Intents</Text>
        </View>
        {(openIntents ?? []).length === 0 ? (
          <View style={styles.row}>
            <Text style={styles.cellWide}>No open intents</Text>
          </View>
        ) : (
          (openIntents ?? []).slice(0, 6).map((intent) => {
            const isCanceling = cancelingOrderId === intent.id;
            return (
              <View key={intent.id} style={styles.intentRow}>
                <View style={styles.intentMeta}>
                  <Text style={styles.intentTitle}>
                    {intent.side.toUpperCase()} {intent.quantity.toFixed(4)} {intent.symbol} {intent.orderType}
                  </Text>
                  <Text style={styles.intentSubtle}>#{intent.id.slice(0, 10)} • {intent.status}</Text>
                </View>
                <Pressable
                  disabled={isCanceling || !isConnected}
                  style={[styles.cancelButton, (!isConnected || isCanceling) ? styles.cancelButtonDisabled : null]}
                  onPress={() => void handleCancelIntent(intent)}>
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
