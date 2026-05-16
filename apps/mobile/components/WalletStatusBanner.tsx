import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccount, useConnect } from 'wagmi';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletStatusBanner() {
  const { address, chain, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();

  const walletConnectConnector = connectors.find((connector) => connector.id === 'walletConnect');

  if (isConnected && address) {
    return (
      <View style={styles.connectedCard}>
        <Text style={styles.title}>Wallet Connected</Text>
        <Text style={styles.meta}>Address: {shortAddress(address)}</Text>
        <Text style={styles.meta}>Chain: {chain?.name ?? 'Unknown chain'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.disconnectedCard}>
      <Text style={styles.title}>Wallet Disconnected</Text>
      <Text style={styles.meta}>Connect to enable intent cancellation and wallet-synced trader identity.</Text>
      <Pressable
        disabled={!walletConnectConnector || isPending}
        style={[styles.button, (!walletConnectConnector || isPending) ? styles.buttonDisabled : null]}
        onPress={() => {
          if (walletConnectConnector) {
            connect({ connector: walletConnectConnector });
          }
        }}>
        <Text style={styles.buttonText}>{isPending ? 'Connecting...' : 'Reconnect Wallet'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  connectedCard: {
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  disconnectedCard: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  meta: {
    fontSize: 12,
    color: '#334155',
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  buttonDisabled: {
    backgroundColor: '#64748b',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
});
