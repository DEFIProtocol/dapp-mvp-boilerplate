// components/Header/WalletModal.tsx
"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { X, ChevronRight, Zap, Globe, Wallet, Shield, Smartphone, ExternalLink } from "lucide-react";
import { safeStorage } from "@/lib/safeStorage";
import styles from "./WalletModal.module.css";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableChains?: { id: number; label: string }[];
  selectedChain?: number;
  setSelectedChain?: (id: number) => void;
}

const WALLETS = [
  { name: "metamask", displayName: "MetaMask", icon: "🦊", badge: "Popular", type: "evm" },
  { name: "coinbase", displayName: "Coinbase Wallet", icon: "🔵", badge: "Secure", type: "evm" },
  { name: "walletconnect", displayName: "WalletConnect", icon: "🔗", badge: "Mobile", type: "evm" },
  { name: "injected", displayName: "Browser Wallet", icon: "🌐", badge: "Injected", type: "evm" },
];

const NON_EVM_WALLETS = [
  { name: "phantom", displayName: "Phantom", icon: "◎", badge: "Solana", type: "solana" },
];

const CHAIN_ICONS: Record<string, string> = {
  Ethereum: "⟠",
  Base: "⛓️",
  BNB: "🟡",
  Polygon: "🔷",
  Arbitrum: "🔵",
  Avalanche: "❄️",
  Solana: "◎",
  Optimism: "🔴",
  Fantom: "🔺",
};

export default function WalletModal({
  isOpen,
  onClose,
  availableChains = [],
  selectedChain,
  setSelectedChain,
}: WalletModalProps) {
  const { connect, connectors, error, isPending } = useConnect();
  const { switchChain } = useSwitchChain();
  const { chain } = useAccount();

  const [selectedLocal, setSelectedLocal] = useState(selectedChain);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSolanaAddress(null);
    setSelectedLocal(selectedChain);
    setConnectingWallet(null);
    setShowSuccess(null);
  }, [isOpen, selectedChain]);

  if (!isOpen) return null;

  const connectEVM = async (walletName: string) => {
    try {
      setConnectingWallet(walletName);
      setShowSuccess(null);

      const chainId = Number(selectedLocal) || 1;
      const connector = connectors.find((c) =>
        c.name.toLowerCase().includes(walletName.toLowerCase())
      );

      if (!connector) {
        console.error("Connector not found:", walletName);
        setConnectingWallet(null);
        return;
      }

      await connect({ connector });

      if (switchChain && chain?.id !== chainId) {
        try {
          await switchChain({ chainId });
        } catch (err) {
          console.error("switchChain error", err);
        }
      }

      setSelectedChain?.(chainId);
      setShowSuccess(walletName);
      
      setTimeout(() => {
        onClose();
        setConnectingWallet(null);
      }, 500);
    } catch (e) {
      console.error("connectEVM error", e);
      setConnectingWallet(null);
    }
  };

  const handleSolana = async () => {
    try {
      setConnectingWallet("phantom");
      setShowSuccess(null);
      
      const provider = (window as any).solana;

      if (provider?.isPhantom) {
        const resp = await provider.connect();
        const addr = resp.publicKey.toString();
        setSolanaAddress(addr);
        safeStorage.setItem("solanaAddress", addr);
        setShowSuccess("phantom");
        
        setTimeout(() => {
          onClose();
          setConnectingWallet(null);
        }, 500);
      } else {
        window.open("https://phantom.app/", "_blank");
        setConnectingWallet(null);
      }
    } catch (e) {
      console.error("Solana connect error", e);
      setConnectingWallet(null);
    }
  };

  const isWalletConnecting = (walletName: string) => connectingWallet === walletName;
  const isWalletSuccess = (walletName: string) => showSuccess === walletName;

  const getChainIcon = (chainLabel: string) => CHAIN_ICONS[chainLabel] || "⛓️";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalWindow}>
          {/* Gradient Border Effect */}
          <div className={styles.gradientBorder} />
          
          <div className={styles.modalContent}>
            {/* Header */}
            <div className={styles.modalHeader}>
              <div className={styles.headerLeft}>
                <Zap size={20} className={styles.headerIcon} />
                <h3>Connect Wallet</h3>
              </div>
              <button className={styles.closeButton} onClick={onClose}>
                <X size={18} />
              </button>
            </div>

            {/* Chain Selector */}
            <div className={styles.chainSection}>
              <div className={styles.sectionHeader}>
                <Globe size={14} className={styles.sectionIcon} />
                <span className={styles.sectionTitle}>Select Network</span>
              </div>
              <div className={styles.chainGrid}>
                {availableChains.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => setSelectedLocal(chain.id)}
                    className={`${styles.chainButton} ${
                      selectedLocal === chain.id ? styles.selected : ""
                    }`}
                  >
                    <span className={styles.chainIcon}>{getChainIcon(chain.label)}</span>
                    <span className={styles.chainName}>{chain.label}</span>
                    {selectedLocal === chain.id && (
                      <span className={styles.chainCheck}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* EVM Wallets */}
            <div className={styles.walletsSection}>
              <div className={styles.sectionHeader}>
                <Wallet size={14} className={styles.sectionIcon} />
                <span className={styles.sectionTitle}>EVM Wallets</span>
                <span className={styles.sectionBadge}>Ethereum Compatible</span>
              </div>
              <div className={styles.walletGrid}>
                {WALLETS.map((wallet) => (
                  <button
                    key={wallet.name}
                    className={`${styles.walletButton} ${
                      isWalletConnecting(wallet.name) ? styles.loading : ""
                    } ${isWalletSuccess(wallet.name) ? styles.success : ""}`}
                    onClick={() => connectEVM(wallet.name)}
                    disabled={!!connectingWallet}
                  >
                    <div className={styles.walletIconWrapper}>
                      <span className={styles.walletIcon}>{wallet.icon}</span>
                      {isWalletConnecting(wallet.name) && (
                        <div className={styles.loadingSpinner} />
                      )}
                      {isWalletSuccess(wallet.name) && (
                        <div className={styles.successCheck}>✓</div>
                      )}
                    </div>
                    <div className={styles.walletInfo}>
                      <div className={styles.walletName}>{wallet.displayName}</div>
                      <div className={styles.walletBadge}>{wallet.badge}</div>
                    </div>
                    <ChevronRight size={14} className={styles.walletArrow} />
                  </button>
                ))}
              </div>
            </div>

            {/* Non-EVM Wallets */}
            <div className={styles.walletsSection}>
              <div className={styles.sectionHeader}>
                <Shield size={14} className={styles.sectionIcon} />
                <span className={styles.sectionTitle}>Non-EVM Wallets</span>
                <span className={styles.sectionBadge}>Solana & More</span>
              </div>
              <div className={styles.walletGrid}>
                {NON_EVM_WALLETS.map((wallet) => (
                  <button
                    key={wallet.name}
                    className={`${styles.walletButton} ${
                      isWalletConnecting(wallet.name) ? styles.loading : ""
                    } ${isWalletSuccess(wallet.name) ? styles.success : ""}`}
                    onClick={handleSolana}
                    disabled={!!connectingWallet}
                  >
                    <div className={styles.walletIconWrapper}>
                      <span className={styles.walletIcon}>{wallet.icon}</span>
                      {isWalletConnecting(wallet.name) && (
                        <div className={styles.loadingSpinner} />
                      )}
                      {isWalletSuccess(wallet.name) && (
                        <div className={styles.successCheck}>✓</div>
                      )}
                    </div>
                    <div className={styles.walletInfo}>
                      <div className={styles.walletName}>{wallet.displayName}</div>
                      <div className={styles.walletBadge}>{wallet.badge}</div>
                    </div>
                    <ChevronRight size={14} className={styles.walletArrow} />
                  </button>
                ))}
              </div>
            </div>

            {/* Info Message */}
            <div className={styles.infoMessage}>
              <ExternalLink size={12} className={styles.infoIcon} />
              <span>New to crypto? <a href="#" className={styles.infoLink}>Learn about wallets</a></span>
            </div>

            {/* Connection Status */}
            {isPending && (
              <div className={styles.statusMessage}>
                <div className={styles.statusSpinner} />
                <span>Connecting...</span>
              </div>
            )}
            
            {error && (
              <div className={styles.errorMessage}>
                <span className={styles.errorIcon}>⚠️</span>
                <span>{error.message}</span>
              </div>
            )}

            {/* Solana Address Display */}
            {solanaAddress && (
              <div className={styles.solanaAddress}>
                <span className={styles.addressLabel}>Connected:</span>
                <code className={styles.addressValue}>
                  {solanaAddress.slice(0, 8)}...{solanaAddress.slice(-6)}
                </code>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}