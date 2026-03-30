// components/Header/Header.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useUser } from "@/contexts/UserContext";
import { updateUserByWallet } from "@/lib/api/users";
import { NAV_ITEMS } from "@dapp/ui/navigation";
import WalletModal from "./WalletModal";
import WalletAction from "@/components/fundsManager/WalletAction";
import { useChainContext } from "@/contexts/ChainContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Menu, X, ChevronDown, Zap, Sun, Moon, Globe } from "lucide-react";
import styles from "./header.module.css";

const NATIVE_SYMBOL_BY_CHAIN: Record<number, string> = {
  1: "ETH",
  8453: "ETH",
  56: "BNB",
  137: "MATIC",
  42161: "ETH",
  43114: "AVAX",
  501: "SOL",
};

export function Header() {
  const { address, isConnected, chain } = useAccount();
  const pathname = usePathname();
  const { disconnect } = useDisconnect();
  const { user, refreshUser } = useUser();
  const {
    selectedChain,
    setSelectedChain,
    availableChains,
    getChainLabel,
  } = useChainContext();
  const { mode, toggleMode } = useTheme();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [chainLoading, setChainLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isChainDropdownOpen, setIsChainDropdownOpen] = useState(false);
  const chainDropdownRef = useRef<HTMLDivElement>(null);
  const previousChainRef = useRef<number | null>(null);

  const { switchChainAsync, isPending } = useSwitchChain();
  const chainSymbol = NATIVE_SYMBOL_BY_CHAIN[selectedChain] || "ETH";

  // Handle chain switching updates
  useEffect(() => {
    if (!user || !address) return;
    
    const chainLabel = getChainLabel?.(selectedChain) || "Base";
    
    if (selectedChain === 1 || chainLabel === "Ethereum") {
      if (user.wallet_address !== address) {
        updateUserByWallet(address, { wallet_address: address }).then(refreshUser);
      }
    } else {
      const prev = user.chain_addresses || {};
      if (prev[chainLabel] !== address) {
        const updated = { ...prev, [chainLabel]: address };
        updateUserByWallet(address, { chain_addresses: updated }).then(refreshUser);
      }
    }
  }, [selectedChain, address, user, getChainLabel, refreshUser]);

  // Close chain dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chainDropdownRef.current && !chainDropdownRef.current.contains(event.target as Node)) {
        setIsChainDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Chain switch toast
  useEffect(() => {
    if (previousChainRef.current === null) {
      previousChainRef.current = selectedChain;
      return;
    }

    if (previousChainRef.current !== selectedChain) {
      const label = getChainLabel?.(selectedChain) || `Chain ${selectedChain}`;
      setToastMessage(`Switched to ${label}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      previousChainRef.current = selectedChain;
    }
  }, [selectedChain, getChainLabel]);

  // Sync app state when the user switches chains directly in MetaMask
  useEffect(() => {
    const isRouteManagedChain = pathname?.startsWith("/futures") || pathname?.startsWith("/market");
    if (isRouteManagedChain) return;
    if (!chain?.id) return;
    if (chain.id === selectedChain) return;
    const supported = availableChains.find((c) => c.id === chain.id);
    if (supported) {
      setSelectedChain(chain.id);
    }
  }, [chain?.id, selectedChain, availableChains, pathname, setSelectedChain]);

  const handleChainSwitch = async (chainId: number) => {
    setChainLoading(true);
    setIsChainDropdownOpen(false);

    // If no wallet connected, just update app context (no MetaMask prompt)
    if (!isConnected) {
      setSelectedChain(chainId);
      setChainLoading(false);
      return;
    }

    setToastMessage("Changing chain...");
    setShowToast(true);

    try {
      await switchChainAsync({ chainId });
      setSelectedChain(chainId); // only update AFTER MetaMask confirms
      const label = getChainLabel?.(chainId) || `Chain ${chainId}`;
      setToastMessage(`Switched to ${label}`);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      // User rejected or switch failed — do NOT update selectedChain
      setToastMessage("Chain switch cancelled");
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setChainLoading(false);
    }
  };

  const getChainIcon = (chainLabel: string) => {
    const icons: Record<string, string> = {
      Ethereum: "⟠",
      Base: "⛓️",
      BNB: "🟡",
      Polygon: "🔷",
      Arbitrum: "🔵",
      Avalanche: "❄️",
      Solana: "◎",
    };
    return icons[chainLabel] || "⛓️";
  };

  const currentChainLabel = getChainLabel?.(selectedChain) || "Ethereum";
  const currentChainIcon = getChainIcon(currentChainLabel);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.container}>
          {/* Left Section */}
          <div className={styles.leftSection}>
            {/* Mobile Menu Button */}
            <button
              className={styles.mobileMenuButton}
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            {/* Logo */}
            <Link href="/" className={styles.logoLink}>
              <div className={styles.logo}>
                <Zap size={24} className={styles.logoIcon} />
                <span className={styles.logoText}>DApp</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className={styles.desktopNav}>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navLink} ${isActive ? styles.active : ""}`}
                  >
                    <span>{item.label}</span>
                    {isActive && <span className={styles.navIndicator} />}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Section */}
          <div className={styles.rightSection}>
            {/* Wallet Action Button */}
            {isConnected && (
              <WalletAction
                symbol={chainSymbol}
                address={address || ""}
              />
            )}

            {/* Theme Toggle */}
            <button
              onClick={toggleMode}
              className={styles.themeToggle}
              aria-label="Toggle theme"
            >
              {mode === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            {/* Chain Selector Dropdown */}
            <div className={styles.chainSelector} ref={chainDropdownRef}>
              <button
                className={styles.chainButton}
                onClick={() => setIsChainDropdownOpen(!isChainDropdownOpen)}
                disabled={chainLoading || isPending}
              >
                <span className={styles.chainIcon}>{currentChainIcon}</span>
                <span className={styles.chainLabel}>{currentChainLabel}</span>
                <ChevronDown
                  size={14}
                  className={`${styles.chainChevron} ${isChainDropdownOpen ? styles.rotated : ""}`}
                />
                {chainLoading && <span className={styles.chainSpinner} />}
              </button>

              {isChainDropdownOpen && (
                <div className={styles.chainDropdown}>
                  <div className={styles.chainDropdownHeader}>
                    <Globe size={14} />
                    <span>Switch Network</span>
                  </div>
                  {availableChains.map((chain) => (
                    <button
                      key={chain.id}
                      className={`${styles.chainOption} ${selectedChain === chain.id ? styles.active : ""}`}
                      onClick={() => handleChainSwitch(chain.id)}
                    >
                      <span className={styles.chainOptionIcon}>{getChainIcon(chain.label)}</span>
                      <span className={styles.chainOptionLabel}>{chain.label}</span>
                      {selectedChain === chain.id && (
                        <span className={styles.chainOptionCheck}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Connect / Account Button */}
            {!isConnected ? (
              <button
                onClick={() => setShowWalletModal(true)}
                className={styles.connectButton}
              >
                <span className={styles.connectButtonText}>Connect Wallet</span>
              </button>
            ) : (
              <div className={styles.accountMenu}>
                <button
                  onClick={() => disconnect()}
                  className={styles.accountButton}
                  aria-label="Disconnect"
                >
                  <span className={styles.accountAddress}>
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Modal */}
      {isMobileMenuOpen && (
        <div className={styles.mobileMenuOverlay} onClick={() => setIsMobileMenuOpen(false)}>
          <div className={styles.mobileMenu} onClick={(e) => e.stopPropagation()}>
            <div className={styles.mobileMenuHeader}>
              <div className={styles.mobileLogo}>
                <Zap size={24} className={styles.logoIcon} />
                <span>DApp</span>
              </div>
              <button
                className={styles.mobileMenuClose}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <nav className={styles.mobileNav}>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.mobileNavLink} ${isActive ? styles.active : ""}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span>{item.label}</span>
                    {isActive && <span className={styles.mobileNavIndicator} />}
                  </Link>
                );
              })}
            </nav>

            <div className={styles.mobileFooter}>
              <button onClick={toggleMode} className={styles.mobileThemeToggle}>
                {mode === "light" ? <Moon size={16} /> : <Sun size={16} />}
                <span>{mode === "light" ? "Dark Mode" : "Light Mode"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && toastMessage && (
        <div className={styles.toast}>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Wallet Modal */}
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        availableChains={availableChains}
        selectedChain={selectedChain}
        setSelectedChain={setSelectedChain}
      />
    </>
  );
}