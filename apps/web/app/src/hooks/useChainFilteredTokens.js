import { useCallback, useMemo } from 'react';



const useChainFilteredTokens = (tokens, chainId) => {
    const normalizeChains = useCallback((rawChains) => {
        if (!rawChains) return {};
        if (typeof rawChains === 'string') {
            try {
                return JSON.parse(rawChains);
            } catch (e) {
                return {};
            }
        }
        return rawChains || {};
    }, []);

    const getChainKey = useCallback((id) => {
        const chainMap = {
            1: 'ethereum',
            56: 'bnb',
            137: 'polygon',
            42161: 'arbitrum',
            43114: 'avalanche',
            501: 'solana'
        };
        return chainMap[id] || 'ethereum';
    }, []);

    const chainKey = getChainKey(chainId);

    const filteredTokens = useMemo(() => {
        return (tokens || []).filter(token => {
            const chains = normalizeChains(token.chains);
            const address = chains?.[chainKey];
            return address && address.length > 0;
        });
    }, [tokens, chainKey, normalizeChains]);

    return {
        filteredTokens,
        chainKey,
        hasAddress: (token) => {
            const chains = normalizeChains(token?.chains);
            return !!(chains?.[chainKey]?.length > 0);
        }
    };
};

export default useChainFilteredTokens;