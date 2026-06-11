import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';

type TraderContextValue = {
  traderAddress: string;
  setTraderAddress: (address: string) => void;
};

const FALLBACK_TRADER = '0x0000000000000000000000000000000000000000';

const TraderContext = createContext<TraderContextValue>({
  traderAddress: FALLBACK_TRADER,
  setTraderAddress: () => {},
});

export function TraderProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const [manualAddress, setManualAddress] = useState<string>(FALLBACK_TRADER);

  useEffect(() => {
    if (isConnected && address) {
      setManualAddress(address);
    }
  }, [address, isConnected]);

  const setTraderAddress = (address: string) => {
    const normalized = (address || '').trim();
    setManualAddress(normalized || FALLBACK_TRADER);
  };

  const traderAddress = isConnected && address ? address : manualAddress;
  const value = useMemo(() => ({ traderAddress, setTraderAddress }), [traderAddress]);
  return <TraderContext.Provider value={value}>{children}</TraderContext.Provider>;
}

export function useTrader() {
  return useContext(TraderContext);
}
