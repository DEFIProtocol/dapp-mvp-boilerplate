"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import TokensTable from "../../tokens/components/TokensTable";
import styles from "../../tokens/TokensPage.module.css";
import { useChainContext } from "@/contexts/ChainContext";

export default function MarketsByChainPage() {
  const params = useParams();
  const router = useRouter();
  const initializedFromRouteRef = useRef(false);
  const chainParam = typeof params.chain === "string" ? params.chain.toLowerCase() : "base";

  const { selectedChain, setSelectedChain, getChainIdBySlug, getChainLabel, getChainSlug } = useChainContext();

  useEffect(() => {

    const routeChainId = chainParam === "base" ? 8453 : getChainIdBySlug(chainParam);

    if (!routeChainId) {
      router.replace("/market/base");
      return;
    }

    if (!initializedFromRouteRef.current) {
      initializedFromRouteRef.current = true;

      if (routeChainId === 8453) {
        setSelectedChain(1);
        router.replace("/market/ethereum");
        return;
      }

      if (selectedChain !== routeChainId) {
        setSelectedChain(routeChainId);
      }
      return;
    }

    if (selectedChain === 8453) {
      setSelectedChain(1);
      if (chainParam !== "ethereum") {
        router.replace("/market/ethereum");
      }
      return;
    }

    const selectedSlug = getChainSlug(selectedChain);
    if (selectedSlug !== chainParam) {
      router.replace(`/market/${selectedSlug}`);
    }
  }, [chainParam, getChainIdBySlug, getChainSlug, router, selectedChain, setSelectedChain]);

  return (
    <div className={styles.page}>
      <div className={styles.gradientBg} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.titleSection}>
              <div className={styles.titleGlow} />
              <h1 className={styles.title}>{getChainLabel(selectedChain)}</h1>
              <div className={styles.titleAccent} />
            </div>
            <p className={styles.subtitle}>
              Switch chain to see different markets!
            </p>
          </div>
        </header>
        <TokensTable />
      </main>
    </div>
  );
}
