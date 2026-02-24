"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { useAccount, useDisconnect } from "wagmi";
import { NAV_ITEMS } from "@dapp/ui/navigation";

import WalletModal from "./WalletModal";

// If you have a chain context, import it here:
import {useChainContext} from "../../src/contexts/ChainContext"; 
import { useTheme } from "../../src/contexts/ThemeContext";
// If not, I can generate one for you.
import "./header.css";  

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
    <header className="header">
      {/* LEFT SIDE */}
      <div className="leftSection">
        {/* Mobile menu button */}
        {!activeMenu && (
          <button 
            className="menuButton"
            onClick={() => setIsOpen(!isOpen)}
          >
            ☰
          </button>
        )}

        {/* Logo */}
        <Link href="/">
          <div className="logo">My DApp</div>
        </Link>

        {/* MOBILE NAV OVERLAY */}
        {!activeMenu && isOpen && (
          <div
            className="mobileNavOverlay"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="mobileNavWindow"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mobileNavHeader">
                <div className="mobileNavTitle">Menu</div>
                <button 
                  className="mobileNavClose"
                  onClick={() => setIsOpen(false)}
                >
                  ✕
                </button>
              </div>

              <nav className="mobileNavLinks">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="mobileNavLink"
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
          <nav className="desktopNav">
            {NAV_ITEMS.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className="navLink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* RIGHT SIDE */}
      <div className="rightSection">
        <button
          onClick={toggleTheme}
          className="themeToggle"
        >
          <span className="themeIcon">{theme === "light" ? "🌙" : "☀️"}</span>
          <span>{theme === "light" ? "Dark" : "Light"}</span>
        </button>

        {/* CHAIN SELECTOR */}
        <div className="chainSelector">
          <span className="chainIcon">⛓</span>
          {activeMenu ? (
            <select
              className="chainSelect"
              value={selectedChain}
              onChange={(e) => setSelectedChain(Number(e.target.value))}
            >
              {availableChains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="chainLabel">
              {getChainLabel?.(selectedChain) || "Chain"}
            </span>
          )}
        </div>

        {/* CONNECT BUTTON */}
        <button
          onClick={
            !isConnected
              ? () => setShowWalletModal(true)
              : () => disconnect()
          }
          className="connectButton"
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