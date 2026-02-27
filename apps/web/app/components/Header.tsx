"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useUser } from "../src/contexts/UserContext";
import { updateUserByWallet } from "../src/lib/api/users";
import { NAV_ITEMS } from "@dapp/ui/navigation";

import WalletModal from "./WalletModal";
import {useChainContext} from "../src/contexts/ChainContext"; 
import { useTheme } from "../src/contexts/ThemeContext";
import styles from "./header.module.css";

export function Header() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  // User context - let it handle user creation automatically
  const { user, refreshUser } = useUser(); // Remove createUser from here!

  // Chain context
  const {
    selectedChain,
    setSelectedChain,
    availableChains,
    getChainLabel,
  } = useChainContext();

  // ONLY handle chain switching updates, NOT user creation
  useEffect(() => {
    if (!user || !address) return;
    
    const chainLabel = getChainLabel?.(selectedChain) || "Ethereum";
    
    if (selectedChain === 1 || chainLabel === "Ethereum") {
      // Update wallet_address if needed
      if (user.wallet_address !== address) {
        updateUserByWallet(address, { wallet_address: address }).then(refreshUser);
      }
    } else {
      // Update chain_addresses if needed
      const prev = user.chain_addresses || {};
      if (prev[chainLabel] !== address) {
        const updated = { ...prev, [chainLabel]: address };
        updateUserByWallet(address, { chain_addresses: updated }).then(refreshUser);
      }
    }
  }, [selectedChain, address, user, getChainLabel, refreshUser]);

  // UI state and rendering (keep all the existing UI code below)
  const { theme, toggleTheme } = useTheme();
  const [activeMenu, setActiveMenu] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [screenSize, setScreenSize] = useState<number | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainSwitched, setChainSwitched] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { switchChain, isPending } = useSwitchChain();

  // Handle screen size
  useEffect(() => {
    const handleResize = () => setScreenSize(window.innerWidth);
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (screenSize && screenSize < 760) setActiveMenu(false);
    else setActiveMenu(true);
  }, [screenSize]);

  return (
    <header className={styles.header}>
      {/* ... keep all your existing JSX exactly the same ... */}
      <div className={styles.leftSection}>
        {!activeMenu && (
          <button 
            className={styles.menuButton}
            onClick={() => setIsOpen(!isOpen)}
          >
            ☰
          </button>
        )}

        <Link href="/">
          <div className={styles.logo}>My DApp</div>
        </Link>

        {!activeMenu && isOpen && (
          <div
            className={styles.mobileNavOverlay}
            onClick={() => setIsOpen(false)}
          >
            <div
              className={styles.mobileNavWindow}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.mobileNavHeader}>
                <div className={styles.mobileNavTitle}>Menu</div>
                <button 
                  className={styles.mobileNavClose}
                  onClick={() => setIsOpen(false)}
                >
                  ✕
                </button>
              </div>

              <nav className={styles.mobileNavLinks}>
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={styles.mobileNavLink}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        )}

        {activeMenu && (
          <nav className={styles.desktopNav}>
            {NAV_ITEMS.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className={styles.navLink}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className={styles.rightSection}>
        <button
          onClick={toggleTheme}
          className={styles.themeToggle}
        >
          <span className={styles.themeIcon}>{theme === "light" ? "☀️" : "🌙"}</span>
          <span>{theme === "light" ? "Light" : "Dark"}</span>
        </button>

        <div className={styles.chainSelector}>
          <span className={styles.chainIcon}>⛓</span>
          {activeMenu ? (
            <select
              className={styles.chainSelect}
              value={selectedChain}
              onChange={async (e) => {
                const newChainId = Number(e.target.value);
                setChainLoading(true);
                setChainSwitched(null);
                setSelectedChain(newChainId);
                setToastMessage("Changing Chains...");
                setShowToast(true);
                try {
                  await switchChain({ chainId: newChainId });
                  const label = getChainLabel?.(newChainId) || `Chain ${newChainId}`;
                  setChainSwitched(label);
                  setToastMessage(`Switched to ${label}`);
                  setTimeout(() => setShowToast(false), 5000);
                } catch (err) {
                  setChainSwitched("Failed to switch chain");
                  setToastMessage("Failed to switch chain");
                  setTimeout(() => setShowToast(false), 5000);
                } finally {
                  setChainLoading(false);
                }
              }}
              disabled={chainLoading || isPending}
            >
              {availableChains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.label}
                </option>
              ))}
            </select>
          ) : (
            <span className={styles.chainLabel}>
              {getChainLabel?.(selectedChain) || "Chain"}
            </span>
          )}
          {chainLoading || isPending ? (
            <span className={styles.chainStatus}>Switching Chains...</span>
          ) : null}
          {showToast && toastMessage && (
            <div className="chain-toast">
              {toastMessage}
            </div>
          )}
        </div>

        <button
          onClick={
            !isConnected
              ? () => setShowWalletModal(true)
              : () => disconnect()
          }
          className={styles.connectButton}
        >
          {address
            ? `${address.slice(0, 5)}...${address.slice(-4)}`
            : "Connect"}
        </button>
      </div>

      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        availableChains={availableChains}
        selectedChain={selectedChain}
        setSelectedChain={setSelectedChain}
      />
    </header>
  );
}