"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { NAV_ITEMS } from "@dapp/ui/navigation";

import WalletModal from "./WalletModal";

// If you have a chain context, import it here:
import {useChainContext} from "../../src/contexts/ChainContext"; 
import { useTheme } from "../../src/contexts/ThemeContext";
// If not, I can generate one for you.
import styles from "./header.module.css";

export function Header() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  // Chain context (your custom hook)
  const {
    selectedChain,
    setSelectedChain,
    availableChains,
    getChainLabel,
  } = useChainContext();

  // UI state
  const { theme, toggleTheme } = useTheme();
  const [activeMenu, setActiveMenu] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [screenSize, setScreenSize] = useState<number | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainSwitched, setChainSwitched] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // wagmi chain switch
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
      {/* LEFT SIDE */}
      <div className={styles.leftSection}>
        {/* Mobile menu button */}
        {!activeMenu && (
          <button 
            className={styles.menuButton}
            onClick={() => setIsOpen(!isOpen)}
          >
            ☰
          </button>
        )}

        {/* Logo */}
        <Link href="/">
          <div className={styles.logo}>My DApp</div>
        </Link>

        {/* MOBILE NAV OVERLAY */}
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

        {/* DESKTOP NAV */}
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

      {/* RIGHT SIDE */}
      <div className={styles.rightSection}>
        <button
          onClick={toggleTheme}
          className={styles.themeToggle}
        >
          <span className={styles.themeIcon}>{theme === "light" ? "☀️" : "🌙"}</span>
          <span>{theme === "light" ? "Light" : "Dark"}</span>
        </button>

        {/* CHAIN SELECTOR */}
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
          {/* Chain switching status (only show loading inline) */}
          {chainLoading || isPending ? (
            <span className={styles.chainStatus}>Switching Chains...</span>
          ) : null}
              {/* Toast overlay for chain switch */}
              {showToast && toastMessage && (
                <div className="chain-toast">
                  {toastMessage}
                </div>
              )}
        </div>

        {/* CONNECT BUTTON */}
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

      {/* WALLET MODAL */}
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