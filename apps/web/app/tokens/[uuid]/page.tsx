"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useTokens } from "@/contexts/TokenContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useChainContext } from "@/contexts/ChainContext";
import Link from "next/link";
import styles from "../TokensPage.module.css";

export default function TokenPage() {
  const params = useParams<{ uuid: string }>();
  const tokenUuid = params?.uuid || "";

  const { tokens, loading: tokenLoading } = useTokens();
  const { priceMap, loading: priceLoading } = usePriceStore();
  const { selectedChain, getChainLabel } = useChainContext();

  const token = useMemo(() => {
    return tokens.find((item) => item.uuid === tokenUuid) || null;
  }, [tokens, tokenUuid]);

  const price = token?.symbol ? priceMap[token.symbol.toUpperCase()]?.price : undefined;

  if (tokenLoading || priceLoading) {
    return (
      <main className={styles.page}>
        <section className={styles.tableCard}>Loading token page...</section>
      </main>
    );
  }

  if (!token) {
    return (
      <main className={styles.page}>
        <section className={styles.tableCard}>
          <h1 className={styles.title}>Token not found</h1>
          <p className={styles.subtitle}>No token found for UUID: {tokenUuid}</p>
          <Link href="/tokens" className={styles.tokenLink}>Back to tokens</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.tableCard}>
        <h1 className={styles.title}>{token.symbol}</h1>
        <p className={styles.subtitle}>{token.name}</p>
        <p className={styles.subtitle}>UUID: {token.uuid}</p>
        <p className={styles.subtitle}>Chain: {getChainLabel(selectedChain)} ({selectedChain})</p>
        <p className={styles.subtitle}>Current Price: {price ? `$${Number(price).toLocaleString()}` : "—"}</p>
        <div style={{ marginTop: "0.75rem" }}>
          <Link href="/tokens" className={styles.tokenLink}>Back to tokens</Link>
        </div>
      </section>
    </main>
  );
}
