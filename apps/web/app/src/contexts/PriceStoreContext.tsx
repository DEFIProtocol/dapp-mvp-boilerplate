
import * as React from "react";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

// Types for price data
export interface PriceSource {
	symbol: string;
	price: number;
	source: string;
	timestamp: number;
	pair?: string;
	marketCap?: number;
	change24h?: number;
	uuid?: string;
}

interface PriceStoreContextType {
	prices: PriceSource[];
	priceMap: Record<string, PriceSource>;
	loading: boolean;
	error: string | null;
	refresh: () => void;
	formatPrice: (symbol: string, digits?: number) => string;
}

const PriceStoreContext = createContext<PriceStoreContextType | undefined>(undefined);

const arePricesEqual = (left: PriceSource[], right: PriceSource[]) => {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		const a = left[index];
		const b = right[index];
		if (
			a.symbol !== b.symbol ||
			a.price !== b.price ||
			a.source !== b.source ||
			a.timestamp !== b.timestamp ||
			a.pair !== b.pair ||
			a.marketCap !== b.marketCap ||
			a.change24h !== b.change24h ||
			a.uuid !== b.uuid
		) {
			return false;
		}
	}
	return true;
};

export function PriceStoreProvider({ children, pollInterval = 15000 }: { children: ReactNode; pollInterval?: number }) {
	const [prices, setPrices] = useState<PriceSource[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch prices from backend
	const fetchPrices = useCallback(async (options?: { silent?: boolean }) => {
		if (!options?.silent) {
			setLoading(true);
		}
		setError(null);
		try {
			const res = await fetch("/api/prices");
			const data = await res.json();
			if (data.success) {
					const nextPrices = ((data.data || []) as Array<Record<string, unknown>>).map((entry) => {
						const symbol = String(entry.symbol || "").toUpperCase();
						const rawPrice = typeof entry.price === "number" ? entry.price : Number(entry.price || 0);
						const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : Date.now();
						const source = String(entry.priceSource || entry.source || "unknown");

						const marketCapRaw = entry.marketCap;
						const changeRaw = entry.change24h;

						const marketCap = typeof marketCapRaw === "number"
							? marketCapRaw
							: typeof marketCapRaw === "string"
								? Number(marketCapRaw)
								: undefined;

						const change24h = typeof changeRaw === "number"
							? changeRaw
							: typeof changeRaw === "string"
								? Number(changeRaw)
								: undefined;

						return {
							symbol,
							price: Number.isFinite(rawPrice) ? rawPrice : 0,
							source,
							timestamp,
							pair: typeof entry.pair === "string" ? entry.pair : undefined,
							marketCap: Number.isFinite(marketCap ?? NaN) ? marketCap : undefined,
							change24h: Number.isFinite(change24h ?? NaN) ? change24h : undefined,
							uuid: typeof entry.uuid === "string" ? entry.uuid : undefined,
						} satisfies PriceSource;
					});
				setPrices((prev) => (arePricesEqual(prev, nextPrices) ? prev : nextPrices));
			} else {
				setError(data.error || "Failed to load prices");
			}
		} catch (err: any) {
			setError(err.message || "Failed to load prices");
		} finally {
			if (!options?.silent) {
				setLoading(false);
			}
		}
	}, []);

	// Polling
	useEffect(() => {
		fetchPrices();
		if (pollInterval > 0) {
			const interval = setInterval(() => {
				void fetchPrices({ silent: true });
			}, pollInterval);
			return () => clearInterval(interval);
		}
	}, [fetchPrices, pollInterval]);

	// Map for quick lookup
	const priceMap = React.useMemo(() => {
		const map: Record<string, PriceSource> = {};
		prices.forEach((p) => {
			map[p.symbol.toUpperCase()] = p;
		});
		return map;
	}, [prices]);

	// Format price helper
	const formatPrice = useCallback((symbol: string, digits = 4) => {
		const p = priceMap[symbol.toUpperCase()];
		if (!p) return "-";
		return Number(p.price).toLocaleString(undefined, { maximumFractionDigits: digits });
	}, [priceMap]);

	return (
		<PriceStoreContext.Provider value={{ prices, priceMap, loading, error, refresh: fetchPrices, formatPrice }}>
			{children}
		</PriceStoreContext.Provider>
	);
}

export function usePriceStore() {
	const ctx = useContext(PriceStoreContext);
	if (!ctx) throw new Error("usePriceStore must be used within a PriceStoreProvider");
	return ctx;
}
