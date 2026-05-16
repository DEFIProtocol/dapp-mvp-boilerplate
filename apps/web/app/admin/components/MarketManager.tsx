// app/admin/components/MarketManager.tsx
"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { usePerps } from "@/contexts/PerpsContext";
import { useOracleRound } from "@/hooks/useOracleRound";
import { usePythFundingRate } from "@/hooks/pyth/usePythFundingRate";
import PerpsTable from "./perps/PerpsTable";
import PriceCard from "./perps/PriceCard";
import AddMarketModal from "./markets/AddMarketModal";
import styles from "./styles/PerpsManager.module.css";
import type { PerpsToken } from "@/types/perps";

const SimulatorDashboard = dynamic(
  () => import("./simData/components/dashboard/DashboardLayout").then((m) => m.DashboardLayout),
  { ssr: false, loading: () => <div className={styles.simulatorLoading}><p>Loading simulator...</p></div> }
);

type Domain = "perps" | "spot" | "options";

const ORACLE_TOKENS = [
  { symbol: "BTC", chain: "ethereum", token: "btc", feedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" },
  { symbol: "ETH", chain: "ethereum", token: "eth", feedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" },
  { symbol: "SOL", chain: "ethereum", token: "sol", feedId: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d" },
  { symbol: "AVAX", chain: "avalanche", token: "avax", feedId: "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7" },
  { symbol: "BNB", chain: "bsc", token: "bnb", feedId: "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f" },
  { symbol: "LINK", chain: "ethereum", token: "link", feedId: "0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221" },
];

function SpotTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p style={{ color: "#64748b", padding: "1rem" }}>No spot markets registered yet.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0", fontSize: "0.875rem" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
          <th style={{ textAlign: "left", padding: "0.5rem" }}>Symbol</th>
          <th style={{ textAlign: "left", padding: "0.5rem" }}>Name</th>
          <th style={{ textAlign: "left", padding: "0.5rem" }}>Quote</th>
          <th style={{ textAlign: "center", padding: "0.5rem" }}>Active</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol} style={{ borderBottom: "1px solid #1e293b" }}>
            <td style={{ padding: "0.5rem", fontWeight: 600 }}>{r.symbol}</td>
            <td style={{ padding: "0.5rem" }}>{r.name}</td>
            <td style={{ padding: "0.5rem" }}>{r.quote_asset ?? "USDC"}</td>
            <td style={{ textAlign: "center", padding: "0.5rem" }}>{r.is_active ? "✅" : "❌"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OptionsTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p style={{ color: "#64748b", padding: "1rem" }}>No options underlyings registered yet.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0", fontSize: "0.875rem" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
          <th style={{ textAlign: "left", padding: "0.5rem" }}>Symbol</th>
          <th style={{ textAlign: "left", padding: "0.5rem" }}>Name</th>
          <th style={{ textAlign: "left", padding: "0.5rem" }}>Underlying</th>
          <th style={{ textAlign: "center", padding: "0.5rem" }}>Active</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol} style={{ borderBottom: "1px solid #1e293b" }}>
            <td style={{ padding: "0.5rem", fontWeight: 600 }}>{r.symbol}</td>
            <td style={{ padding: "0.5rem" }}>{r.name}</td>
            <td style={{ padding: "0.5rem" }}>{r.underlying_symbol}</td>
            <td style={{ textAlign: "center", padding: "0.5rem" }}>{r.is_active ? "✅" : "❌"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MarketManager() {
  const { tokens: perpsTokens, loading: perpsLoading, error: perpsError, refreshTokens } = usePerps();

  const [domain, setDomain] = useState<Domain>("perps");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [status, setStatus] = useState({ type: "" as "success" | "error" | "", message: "" });

  // Spot + options markets fetched from admin API
  const [spotTokens, setSpotTokens] = useState<any[]>([]);
  const [optionsTokens, setOptionsTokens] = useState<any[]>([]);
  const [otherLoading, setOtherLoading] = useState(false);

  const fetchAllMarkets = async () => {
    setOtherLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/admin/markets`);
      const data = await res.json();
      if (data.success) {
        setSpotTokens(data.markets.spot ?? []);
        setOptionsTokens(data.markets.options ?? []);
      }
    } catch {
      // ignore — perps table still works independently
    } finally {
      setOtherLoading(false);
    }
  };

  // Load spot/options once on mount
  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    setLoaded(true);
    fetchAllMarkets();
  }

  // Oracle hooks (for price cards)
  const btcOracle = useOracleRound("ethereum", "btc", 15000);
  const ethOracle = useOracleRound("ethereum", "eth", 15000);
  const solOracle = useOracleRound("ethereum", "sol", 15000);
  const avaxOracle = useOracleRound("avalanche", "avax", 15000);
  const bnbOracle = useOracleRound("bsc", "bnb", 15000);
  const linkOracle = useOracleRound("ethereum", "link", 15000);

  const btcFunding = usePythFundingRate("0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", 15000);
  const ethFunding = usePythFundingRate("0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", 15000);
  const solFunding = usePythFundingRate("0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", 15000);
  const avaxFunding = usePythFundingRate("0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7", 15000);
  const bnbFunding = usePythFundingRate("0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f", 15000);
  const linkFunding = usePythFundingRate("0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221", 15000);

  const oracleDataMap: Record<string, any> = {
    BTC: btcOracle.data, ETH: ethOracle.data, SOL: solOracle.data,
    AVAX: avaxOracle.data, BNB: bnbOracle.data, LINK: linkOracle.data,
  };
  const fundingDataMap: Record<string, any> = {
    BTC: btcFunding.data, ETH: ethFunding.data, SOL: solFunding.data,
    AVAX: avaxFunding.data, BNB: bnbFunding.data, LINK: linkFunding.data,
  };

  const filteredPerps = useMemo(() => {
    if (!perpsTokens) return [];
    const term = searchTerm.toLowerCase();
    return perpsTokens.filter((t: PerpsToken) =>
      t.symbol?.toLowerCase().includes(term) || t.name?.toLowerCase().includes(term)
    );
  }, [perpsTokens, searchTerm]);

  const handleSuccess = () => {
    setStatus({ type: "success", message: "✅ Market registered successfully!" });
    refreshTokens();
    fetchAllMarkets();
    setTimeout(() => setStatus({ type: "", message: "" }), 4000);
  };

  const domainTabs: { id: Domain; label: string }[] = [
    { id: "perps", label: "📈 Perpetuals" },
    { id: "spot", label: "💱 Spot" },
    { id: "options", label: "🎯 Options" },
  ];

  return (
    <div className={styles.perpsManager}>
      {/* Header */}
      <div className={styles.managerHeader}>
        <h2 className={styles.managerTitle}>Markets</h2>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className={styles.simulatorBtn}
          >
            {showSimulator ? "📋 Table View" : "📊 Simulator"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className={styles.addBtn}
          >
            + Add Market
          </button>
        </div>
      </div>

      {/* Status banner */}
      {status.message && (
        <div style={{
          padding: "0.6rem 1rem",
          borderRadius: 6,
          background: status.type === "success" ? "#14532d" : "#7f1d1d",
          color: "#e2e8f0",
          marginBottom: "1rem",
          fontSize: "0.875rem",
        }}>
          {status.message}
        </div>
      )}

      {/* Price cards row */}
      <div className={styles.priceCardsGrid}>
        {ORACLE_TOKENS.map(({ symbol }) => {
          const oracle = oracleDataMap[symbol];
          const funding = fundingDataMap[symbol];
          return (
            <PriceCard
              key={symbol}
              token={symbol}
              chainlinkPrice={oracle?.price}
              chainlinkTimestamp={oracle?.timestamp}
              chainlinkRoundId={oracle?.roundId}
              pythPrice={funding?.spot_price}
              pythEmaPrice={funding?.ema_price}
              fundingRate={funding?.funding_rate}
              fundingRatePercent={funding?.funding_rate_percent}
            />
          );
        })}
      </div>

      {showSimulator ? (
        <SimulatorDashboard />
      ) : (
        <>
          {/* Domain tabs */}
          <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem", borderBottom: "1px solid #334155", paddingBottom: "0.5rem" }}>
            {domainTabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setDomain(id)}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: "6px 6px 0 0",
                  border: "none",
                  background: domain === id ? "#1e40af" : "transparent",
                  color: domain === id ? "#fff" : "#94a3b8",
                  cursor: "pointer",
                  fontWeight: domain === id ? 600 : 400,
                  fontSize: "0.875rem",
                }}
              >
                {label}
              </button>
            ))}

            {domain === "perps" && (
              <div style={{ marginLeft: "auto" }}>
                <input
                  type="text"
                  placeholder="Search markets…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
            )}
          </div>

          {/* Domain content */}
          {domain === "perps" && (
            perpsLoading ? (
              <div className={styles.loading}>Loading perpetuals…</div>
            ) : perpsError ? (
              <div className={styles.error}>{perpsError}</div>
            ) : (
              <PerpsTable
                tokens={filteredPerps}
                onEdit={() => {}}
                onDelete={() => {}}
                onToggleActive={() => {}}
                crudLoading={false}
              />
            )
          )}

          {domain === "spot" && (
            otherLoading ? (
              <div className={styles.loading}>Loading spot markets…</div>
            ) : (
              <SpotTable rows={spotTokens} />
            )
          )}

          {domain === "options" && (
            otherLoading ? (
              <div className={styles.loading}>Loading options underlyings…</div>
            ) : (
              <OptionsTable rows={optionsTokens} />
            )
          )}
        </>
      )}

      {showAddModal && (
        <AddMarketModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
