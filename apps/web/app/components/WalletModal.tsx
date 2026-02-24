"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";

import {
  metaMask,
  injected,
  coinbaseWallet,
  walletConnect,
} from "wagmi/connectors";
import styles from "./WalletModal.module.css";

export default function WalletModal({
  isOpen,
  onClose,
  availableChains = [],
  selectedChain,
  setSelectedChain,
}: {
  isOpen: boolean;
  onClose: () => void;
  availableChains?: { id: number; label: string }[];
  selectedChain?: number;
  setSelectedChain?: (id: number) => void;
}) {
  const { connect, connectors, error, isPending } = useConnect();
  const { switchChain } = useSwitchChain();
  const { chain } = useAccount();

  const [selectedLocal, setSelectedLocal] = useState(selectedChain);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSolanaAddress(null);
    setSelectedLocal(selectedChain);
    setConnectingWallet(null);
  }, [isOpen, selectedChain]);

  if (!isOpen) return null;

  // -----------------------------
  // EVM CONNECT HANDLER
  // -----------------------------
  const connectEVM = async (connector: any, walletName: string) => {
    try {
      setConnectingWallet(walletName);
      const chainId = Number(selectedLocal) || 1;

      await connect({ connector, chainId });

      // Switch if needed
      if (switchChain && chain?.id !== chainId) {
        try {
          switchChain({ chainId });
        } catch {}
      }

      // Update global chain
      try {
        setSelectedChain?.(chainId);
      } catch {}

      setTimeout(() => {
        onClose();
        setConnectingWallet(null);
      }, 300);
    } catch (e) {
      console.error("connectEVM error", e);
      setConnectingWallet(null);
    }
  };

  // -----------------------------
  // SOLANA CONNECT
  // -----------------------------
  const handleSolana = async () => {
    try {
      setConnectingWallet("solana");
      const provider = (window as any).solana;
      if (provider?.isPhantom) {
        const resp = await provider.connect();
        const addr = resp.publicKey.toString();
        setSolanaAddress(addr);
        localStorage.setItem("solanaAddress", addr);
        setTimeout(() => {
          onClose();
          setConnectingWallet(null);
        }, 300);
      } else {
        alert("No Solana wallet detected. Install Phantom.");
        setConnectingWallet(null);
      }
    } catch (e) {
      console.error("Solana connect error", e);
      setConnectingWallet(null);
    }
  };

  const isWalletConnecting = (walletName: string) => {
    return connectingWallet === walletName;
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContainer}>
        <div className={styles.modalWindow}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Connect Wallet</h3>
              <button className={styles.closeButton} onClick={onClose}>
                ✕
              </button>
            </div>

            {/* CHAIN SELECTOR */}
            <div className={styles.chainSection}>
              <span className={styles.chainLabel}>Select chain</span>
              <div className={styles.chainGrid}>
                {availableChains.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => setSelectedLocal(chain.id)}
                    className={
                      styles.chainButton +
                      (selectedLocal === chain.id ? ' ' + styles.selectedChain : '')
                    }
                  >
                    <span>{chain.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* WALLET OPTIONS */}
            <div className={styles.divider}>
              <span className={styles.dividerLine}></span>
              <span className={styles.dividerText}>Select Wallet</span>
              <span className={styles.dividerLine}></span>
            </div>

            <div className={styles.walletGrid}>
              <button
                className={
                  styles.walletButton +
                  (isWalletConnecting('metamask') ? ' ' + styles.loadingWallet : '')
                }
                onClick={() => connectEVM(metaMask(), 'metamask')}
                disabled={!!connectingWallet}
              >
                <span className={styles.walletIcon}>🦊</span>
                <div className={styles.walletInfo}>
                  <div className={styles.walletName}>MetaMask</div>
                  <div className={styles.walletBadge}>Popular</div>
                </div>
              </button>

              <button
                className={
                  styles.walletButton +
                  (isWalletConnecting('coinbase') ? ' ' + styles.loadingWallet : '')
                }
                onClick={() =>
                  connectEVM(
                    coinbaseWallet({
                      appName: "DexStarter",
                    }),
                    'coinbase'
                  )
                }
                disabled={!!connectingWallet}
              >
                <span className={styles.walletIcon}>🔵</span>
                <div className={styles.walletInfo}>
                  <div className={styles.walletName}>Coinbase Wallet</div>
                  <div className={styles.walletBadge}>Secure</div>
                </div>
              </button>

              <button
                className={
                  styles.walletButton +
                  (isWalletConnecting('walletconnect') ? ' ' + styles.loadingWallet : '')
                }
                onClick={() =>
                  connectEVM(
                    walletConnect({
                      projectId: "example-project-id",
                    }),
                    'walletconnect'
                  )
                }
                disabled={!!connectingWallet}
              >
                <span className={styles.walletIcon}>🔗</span>
                <div className={styles.walletInfo}>
                  <div className={styles.walletName}>WalletConnect</div>
                  <div className={styles.walletBadge}>Mobile</div>
                </div>
              </button>

              <button
                className={
                  styles.walletButton +
                  (isWalletConnecting('injected') ? ' ' + styles.loadingWallet : '')
                }
                onClick={() => connectEVM(injected(), 'injected')}
                disabled={!!connectingWallet}
              >
                <span className={styles.walletIcon}>🌐</span>
                <div className={styles.walletInfo}>
                  <div className={styles.walletName}>Browser Wallet</div>
                  <div className={styles.walletBadge}>Injected</div>
                </div>
              </button>
            </div>

            {/* NON-EVM SECTION */}
            <div className={styles.nonEvmSection}>
              <div className={styles.divider}>
                <span className={styles.dividerLine}></span>
                <span className={styles.dividerText}>Non‑EVM</span>
                <span className={styles.dividerLine}></span>
              </div>

              <button
                className={
                  styles.walletButton +
                  (isWalletConnecting('solana') ? ' ' + styles.loadingWallet : '')
                }
                onClick={handleSolana}
                disabled={!!connectingWallet}
              >
                <span className={styles.walletIcon}>◎</span>
                <div className={styles.walletInfo}>
                  <div className={styles.walletName}>Phantom (Solana)</div>
                  <div className={styles.walletBadge}>Non‑EVM</div>
                </div>
              </button>
            </div>

            {error && (
              <div className={styles.errorMessage}>
                <span className={styles.errorIcon}>⚠️</span>
                <span>Error: {error.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}