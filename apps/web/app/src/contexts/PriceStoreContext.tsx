
import * as React from "react";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

// Types for price data
export interface PriceSource {
	symbol: string;
	price: number;
	source: string;
	timestamp: number;
	pair?: string;
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

export function PriceStoreProvider({ children, pollInterval = 15000 }: { children: ReactNode; pollInterval?: number }) {
	const [prices, setPrices] = useState<PriceSource[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch prices from backend
	const fetchPrices = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/prices");
			const data = await res.json();
			if (data.success) {
				setPrices(data.data || []);
			} else {
				setError(data.error || "Failed to load prices");
			}
		} catch (err: any) {
			setError(err.message || "Failed to load prices");
		} finally {
			setLoading(false);
		}
	}, []);

	// Polling
	useEffect(() => {
		fetchPrices();
		if (pollInterval > 0) {
			const interval = setInterval(fetchPrices, pollInterval);
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
