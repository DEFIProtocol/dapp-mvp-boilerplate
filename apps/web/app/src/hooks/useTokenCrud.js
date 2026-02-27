// src/hooks/useTokenCrud.js
import { useState, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

export function useTokenCrud() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Get all tokens
  const getAllTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/db`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch tokens');
      }
      
      return { success: true, data: data.data || [], count: data.count || 0 };
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch tokens';
      setError(errorMessage);
      return { success: false, error: errorMessage, data: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  // Get token by symbol
  const getTokenBySymbol = useCallback(async (symbol) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/db/${symbol}`);
      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'Token not found', notFound: true };
        }
        throw new Error(data.error || 'Failed to fetch token');
      }
      
      return { success: true, data: data.data || data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch token';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new token
  const createToken = useCallback(async (tokenData) => {
    setLoading(true);
    setError(null);
    try {
      // Validate required fields
      if (!tokenData.symbol || !tokenData.name) {
        throw new Error('Symbol and name are required');
      }

      const response = await fetch(`${API_BASE}/tokens/db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tokenData),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Token with this symbol already exists');
        }
        throw new Error(data.error || 'Failed to create token');
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to create token';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Update token
  const updateToken = useCallback(async (symbol, updateData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/db/${symbol}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Token not found');
        }
        throw new Error(data.error || 'Failed to update token');
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to update token';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete token
  const deleteToken = useCallback(async (symbol) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/db/${symbol}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Token not found');
        }
        throw new Error(data.error || 'Failed to delete token');
      }

      return { success: true, data: data.deleted };
    } catch (err) {
      const errorMessage = err.message || 'Failed to delete token';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Token Address Operations
  const getTokenAddresses = useCallback(async (symbol) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/db/${symbol}/addresses`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch token addresses');
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch token addresses';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const addTokenAddress = useCallback(async (symbol, chain, address) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/db/${symbol}/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chain, address }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Token not found');
        }
        throw new Error(data.error || 'Failed to add token address');
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to add token address';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTokenAddress = useCallback(async (symbol, chain, address) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/db/${symbol}/addresses/${chain}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Token address not found');
        }
        throw new Error(data.error || 'Failed to update token address');
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to update token address';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteTokenAddress = useCallback(async (symbol, chain) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/db/${symbol}/addresses/${chain}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Token address not found');
        }
        throw new Error(data.error || 'Failed to delete token address');
      }

      return { success: true, data: data.deleted };
    } catch (err) {
      const errorMessage = err.message || 'Failed to delete token address';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // JSON endpoints
  const getAllJsonTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/json`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch JSON tokens');
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch JSON tokens';
      setError(errorMessage);
      return { success: false, error: errorMessage, data: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const getJsonTokenBySymbol = useCallback(async (symbol) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/json/${symbol}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'Token not found in JSON', notFound: true };
        }
        throw new Error(data.error || 'Failed to fetch JSON token');
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch JSON token';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const syncToJson = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tokens/sync-to-json`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync to JSON');
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err.message || 'Failed to sync to JSON';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getAllTokens,
    getTokenBySymbol,
    createToken,
    updateToken,
    deleteToken,
    getTokenAddresses,
    addTokenAddress,
    updateTokenAddress,
    deleteTokenAddress,
    getAllJsonTokens,
    getJsonTokenBySymbol,
    syncToJson
  };
}