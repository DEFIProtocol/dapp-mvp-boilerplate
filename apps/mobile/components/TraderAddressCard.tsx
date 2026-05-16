import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTrader } from '@/context/TraderContext';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

export function TraderAddressCard() {
  const { traderAddress, setTraderAddress } = useTrader();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [draft, setDraft] = useState(traderAddress);

  const walletConnectConnector = connectors.find((connector) => connector.id === 'walletConnect');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Trader Identity</Text>
      <Text style={styles.hint}>WalletConnect session auto-populates trader address when connected.</Text>

      <View style={styles.row}>
        {!isConnected ? (
          <Pressable
            disabled={!walletConnectConnector || isPending}
            style={[styles.button, (!walletConnectConnector || isPending) ? styles.buttonDisabled : null]}
            onPress={() => {
              if (walletConnectConnector) {
                connect({ connector: walletConnectConnector });
              }
            }}>
            <Text style={styles.buttonText}>{isPending ? 'Connecting...' : 'Connect WalletConnect'}</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.button, styles.disconnectButton]} onPress={() => disconnect()}>
            <Text style={styles.buttonText}>Disconnect</Text>
          </Pressable>
        )}
      </View>

      {error ? <Text style={styles.error}>Wallet connect error: {error.message}</Text> : null}
      {isConnected && address ? <Text style={styles.value}>Connected: {address}</Text> : null}

      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="0x..."
        style={styles.input}
      />
      <Pressable
        style={styles.button}
        onPress={() => setTraderAddress(draft)}>
        <Text style={styles.buttonText}>Manual Override</Text>
      </Pressable>
      <Text style={styles.value}>Active: {traderAddress}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe5f0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  hint: {
    fontSize: 12,
    color: '#64748b',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#64748b',
  },
  disconnectButton: {
    backgroundColor: '#7f1d1d',
  },
  error: {
    fontSize: 12,
    color: '#b91c1c',
  },
  value: {
    fontSize: 12,
    color: '#334155',
  },
});
