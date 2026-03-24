// components/WalletAction/WalletAction.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { Plus, ArrowUpRight, ArrowLeftRight, X, ChevronDown, Wallet, Copy, Check } from "lucide-react";
import { useChainContext } from "@/contexts/ChainContext";
import styles from "./WalletAction.module.css";

interface WalletActionProps {
  balance?: string;
  symbol?: string;
  address?: string;
  onTransfer?: (amount: string, address: string) => void;
  onConvert?: (fromToken: string, toToken: string, amount: string) => void;
}

export default function WalletAction({ 
  balance = "0.00", 
  symbol = "ETH",
  address = "",
  onTransfer,
  onConvert 
}: WalletActionProps) {
  const { address: accountAddress, isConnected } = useAccount();
  const { selectedChain, getChainLabel } = useChainContext();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"add" | "transfer" | "convert">("add");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferAddress, setTransferAddress] = useState("");
  const [convertFrom, setConvertFrom] = useState("ETH");
  const [convertTo, setConvertTo] = useState("USDC");
  const [convertAmount, setConvertAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    137: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    56: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    43114: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  };

  const NATIVE_SYMBOL_BY_CHAIN: Record<number, string> = {
    1: "ETH",
    8453: "ETH",
    137: "MATIC",
    42161: "ETH",
    56: "BNB",
    43114: "AVAX",
  };

  const walletAddress = (accountAddress || address) as `0x${string}` | undefined;
  const nativeSymbol = NATIVE_SYMBOL_BY_CHAIN[selectedChain] || symbol;
  const usdcToken = USDC_BY_CHAIN[selectedChain];
  const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

  const { data: nativeBalanceData } = useBalance({
    address: walletAddress,
    chainId: selectedChain,
    query: {
      enabled: Boolean(isConnected && walletAddress),
    },
  });

  const { data: usdcRawBalance } = useReadContract({
    address: usdcToken,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ] as const,
    functionName: "balanceOf",
    args: [walletAddress ?? zeroAddress],
    chainId: selectedChain,
    query: {
      enabled: Boolean(isConnected && walletAddress && usdcToken),
    },
  });

  const formatDisplayAmount = (raw: string | null, maxFractionDigits: number) => {
    if (!raw) return "0.00";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return "0.00";
    return parsed.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFractionDigits,
    });
  };

  const nativeBalance = nativeBalanceData
    ? formatUnits(nativeBalanceData.value, nativeBalanceData.decimals)
    : balance;
  const usdcBalance = typeof usdcRawBalance === "bigint"
    ? formatUnits(usdcRawBalance, 6)
    : "0.00";
  const nativeDisplay = formatDisplayAmount(nativeBalance, 4);
  const usdcDisplay = formatDisplayAmount(usdcBalance, 2);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTransfer = () => {
    if (onTransfer && transferAmount && transferAddress) {
      onTransfer(transferAmount, transferAddress);
      setTransferAmount("");
      setTransferAddress("");
      setIsOpen(false);
    } else {
      // Simulate transfer for now
      alert(`Transferring ${transferAmount} ${symbol} to ${transferAddress}`);
      setIsOpen(false);
    }
  };

  const handleConvert = () => {
    if (onConvert && convertAmount) {
      onConvert(convertFrom, convertTo, convertAmount);
      setConvertAmount("");
      setIsOpen(false);
    } else {
      // Simulate conversion for now
      alert(`Converting ${convertAmount} ${convertFrom} to ${convertTo}`);
      setIsOpen(false);
    }
  };

  const handleAddFunds = () => {
    // Open Coinbase Pay modal/link
    window.open("https://pay.coinbase.com", "_blank");
  };

  // Calculate estimated receive amount (simplified)
  const getEstimatedReceive = () => {
    if (!convertAmount) return "0";
    const rates: Record<string, number> = {
      "ETH-USDC": 3200,
      "USDC-ETH": 0.00031,
      "ETH-USDT": 3200,
      "USDT-ETH": 0.00031,
      "USDC-USDT": 1,
      "USDT-USDC": 1,
    };
    const key = `${convertFrom}-${convertTo}`;
    const rate = rates[key] || 1;
    return (parseFloat(convertAmount) * rate).toFixed(convertFrom === "ETH" ? 2 : 8);
  };

  return (
    <div className={styles.walletAction} ref={dropdownRef}>
      {/* Main Button - Shows Balance */}
      <button 
        className={`${styles.mainButton} ${isOpen ? styles.active : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={styles.balanceInfo}>
          <Wallet size={16} className={styles.walletIcon} />
          <span className={styles.balanceAmount}>
            {isConnected ? `${nativeDisplay} ${nativeSymbol} • ${usdcDisplay} USDC` : "Connect Wallet"}
          </span>
          <ChevronDown size={14} className={`${styles.chevron} ${isOpen ? styles.rotated : ""}`} />
        </div>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className={styles.dropdownPanel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Manage Funds</h3>
            <button 
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
            >
              <X size={16} />
            </button>
          </div>

          {/* Balance Display */}
          <div className={styles.balanceDisplay}>
            <span className={styles.balanceLabel}>Available Balance</span>
            <div className={styles.balanceValueWrapper}>
              <span className={styles.balanceValue}>
                {isConnected ? `${nativeDisplay} ${nativeSymbol}` : "—"}
              </span>
              {isConnected && walletAddress && (
                <button className={styles.copyButton} onClick={handleCopyAddress}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              )}
            </div>
            <div className={styles.balanceBreakdown}>
              <span className={styles.balanceSubValue}>{isConnected ? `${usdcDisplay} USDC` : "—"}</span>
            </div>
            {isConnected && walletAddress && (
              <span className={styles.addressHint}>
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
            )}
          </div>

          {/* Tab Navigation */}
          <div className={styles.tabBar}>
            <button
              className={`${styles.tabButton} ${activeTab === "add" ? styles.active : ""}`}
              onClick={() => setActiveTab("add")}
            >
              <Plus size={14} />
              <span>Add Funds</span>
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === "transfer" ? styles.active : ""}`}
              onClick={() => setActiveTab("transfer")}
            >
              <ArrowUpRight size={14} />
              <span>Transfer</span>
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === "convert" ? styles.active : ""}`}
              onClick={() => setActiveTab("convert")}
            >
              <ArrowLeftRight size={14} />
              <span>Convert</span>
            </button>
          </div>

          {/* Add Funds Tab */}
          {activeTab === "add" && (
            <div className={styles.tabContent}>
              <p className={styles.contentDescription}>
                Add funds instantly using your debit card via Coinbase Pay
              </p>
              <button 
                className={styles.addFundsButton}
                onClick={handleAddFunds}
              >
                <Plus size={18} />
                <span>Add Funds with Coinbase Pay</span>
              </button>
              <div className={styles.paymentInfo}>
                <span className={styles.paymentMethod}>💳 Debit Card</span>
                <span className={styles.paymentNetwork}>⛓️ {getChainLabel(selectedChain)}</span>
              </div>
              <p className={styles.infoText}>
                Funds will be available immediately on {getChainLabel(selectedChain)}
              </p>
            </div>
          )}

          {/* Transfer Tab */}
          {activeTab === "transfer" && (
            <div className={styles.tabContent}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Amount ({nativeSymbol})</label>
                <div className={styles.inputWrapper}>
                  <input
                    type="text"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className={styles.input}
                  />
                  <button 
                    className={styles.maxButton}
                    onClick={() => setTransferAmount(nativeBalance)}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Recipient Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={transferAddress}
                  onChange={(e) => setTransferAddress(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.transferInfo}>
                <div className={styles.infoRow}>
                  <span>You'll send</span>
                  <span className={styles.infoValue}>{transferAmount || "0"} {nativeSymbol}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>Network Fee</span>
                  <span className={styles.infoValue}>~0.0005 {nativeSymbol}</span>
                </div>
                <div className={styles.infoRow}>
                  <span>Total</span>
                  <span className={styles.infoValue}>
                    {transferAmount && Number.isFinite(Number(transferAmount)) ? (Number(transferAmount) + 0.0005).toFixed(4) : "0"} {nativeSymbol}
                  </span>
                </div>
              </div>

              <button 
                className={styles.actionButton}
                onClick={handleTransfer}
                disabled={!transferAmount || !transferAddress}
              >
                <ArrowUpRight size={16} />
                <span>Transfer Funds</span>
              </button>
            </div>
          )}

          {/* Convert Tab */}
          {activeTab === "convert" && (
            <div className={styles.tabContent}>
              <div className={styles.convertInputs}>
                <div className={styles.convertInput}>
                  <label className={styles.inputLabel}>From</label>
                  <div className={styles.tokenSelectWrapper}>
                    <input
                      type="text"
                      placeholder="0.00"
                      value={convertAmount}
                      onChange={(e) => setConvertAmount(e.target.value)}
                      className={styles.input}
                    />
                    <select 
                      value={convertFrom} 
                      onChange={(e) => setConvertFrom(e.target.value)}
                      className={styles.tokenSelect}
                    >
                      <option value="ETH">ETH</option>
                      <option value="USDC">USDC</option>
                      <option value="USDT">USDT</option>
                    </select>
                  </div>
                </div>

                <div className={styles.swapIcon}>
                  <ArrowLeftRight size={18} />
                </div>

                <div className={styles.convertInput}>
                  <label className={styles.inputLabel}>To</label>
                  <div className={styles.tokenSelectWrapper}>
                    <input
                      type="text"
                      placeholder="0.00"
                      value={getEstimatedReceive()}
                      readOnly
                      className={styles.inputReadonly}
                    />
                    <select 
                      value={convertTo} 
                      onChange={(e) => setConvertTo(e.target.value)}
                      className={styles.tokenSelect}
                    >
                      <option value="USDC">USDC</option>
                      <option value="ETH">ETH</option>
                      <option value="USDT">USDT</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={styles.rateInfo}>
                <div className={styles.infoRow}>
                  <span>Exchange Rate</span>
                  <span className={styles.infoValue}>
                    1 {convertFrom} ≈ {convertFrom === "ETH" ? "3,200" : "0.00031"} {convertTo}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span>You'll receive</span>
                  <span className={styles.infoValueHighlight}>
                    {getEstimatedReceive()} {convertTo}
                  </span>
                </div>
              </div>

              <button 
                className={styles.actionButton}
                onClick={handleConvert}
                disabled={!convertAmount}
              >
                <ArrowLeftRight size={16} />
                <span>Convert Now</span>
              </button>
            </div>
          )}

          {/* Footer Info */}
          <div className={styles.panelFooter}>
            <span className={styles.footerText}>Powered by {getChainLabel(selectedChain)}</span>
          </div>
        </div>
      )}
    </div>
  );
}