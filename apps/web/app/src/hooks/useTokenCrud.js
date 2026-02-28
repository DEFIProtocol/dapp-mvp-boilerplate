"use client";

import { useCallback } from 'react';
import { useTokens } from '@/contexts/TokenContext';

export function useTokenCrud() {
  const { refreshTokens } = useTokens();

  // Existing: Create single token
  const createToken = useCallback(async (tokenData) => {
    try {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        await refreshTokens();
        return { success: true, token: result.token };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [refreshTokens]);

  // NEW: Add multiple tokens at once (for bulk import)
  const createMultipleTokens = useCallback(async (tokensData) => {
    try {
      const response = await fetch('/api/tokens/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: tokensData })
      });
      
      const result = await response.json();
      
      if (result.success) {
        await refreshTokens();
        return { 
          success: true, 
          count: result.count,
          added: result.added,
          failed: result.failed 
        };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [refreshTokens]);

  // NEW: Update chain addresses for a token
  const updateTokenChains = useCallback(async (symbol, chains) => {
    try {
      const response = await fetch(`/api/tokens/${symbol}/chains`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chains })
      });
      
      const result = await response.json();
      
      if (result.success) {
        await refreshTokens();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [refreshTokens]);

  // NEW: Prune database (delete all tokens)
  const pruneDatabase = useCallback(async () => {
    try {
      const response = await fetch('/api/tokens/prune', {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        await refreshTokens();
        return { success: true, count: result.count };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [refreshTokens]);

  // NEW: Import all missing tokens from 1inch
  const importMissingTokens = useCallback(async (oneInchTokens, globalPrices) => {
    try {
      const response = await fetch('/api/tokens/import-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          oneInchTokens,
          globalPrices 
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        await refreshTokens();
        return { 
          success: true, 
          count: result.count,
          imported: result.imported,
          failed: result.failed 
        };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [refreshTokens]);

  // Existing: Update token
  const updateToken = useCallback(async (symbol, changes) => {
    try {
      const response = await fetch(`/api/tokens/${symbol}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      });
      
      const result = await response.json();
      
      if (result.success) {
        await refreshTokens();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [refreshTokens]);

  // Existing: Delete token
  const deleteToken = useCallback(async (symbol) => {
    try {
      const response = await fetch(`/api/tokens/${symbol}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        await refreshTokens();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [refreshTokens]);

  return {
    createToken,
    createMultipleTokens,
    updateTokenChains,
    pruneDatabase,
    importMissingTokens,
    updateToken,
    deleteToken
  };
}