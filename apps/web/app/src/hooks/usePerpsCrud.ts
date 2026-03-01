// hooks/usePerpsCrud.ts
"use client";

import { useState, useCallback } from 'react';
import { PerpsToken, PerpsTokenFormData } from '@/types/perps';
import { usePerps } from '@/contexts/PerpsContext';

interface UsePerpsCrudReturn {
  createPerp: (data: PerpsTokenFormData) => Promise<{ success: boolean; error?: string }>;
  updatePerp: (symbol: string, data: Partial<PerpsTokenFormData>) => Promise<{ success: boolean; error?: string }>;
  deletePerp: (symbol: string) => Promise<{ success: boolean; error?: string }>;
  toggleActive: (symbol: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
  loading: boolean;
  error: string | null;
}

export function usePerpsCrud(): UsePerpsCrudReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshTokens } = usePerps();

  const createPerp = useCallback(async (data: PerpsTokenFormData) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/perps/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || 'Failed to create perp token');
      }
      
      await refreshTokens();
      return { success: true };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [refreshTokens]);

  const updatePerp = useCallback(async (symbol: string, data: Partial<PerpsTokenFormData>) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/perps/db/${symbol}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || 'Failed to update perp token');
      }
      
      await refreshTokens();
      return { success: true };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [refreshTokens]);

  const deletePerp = useCallback(async (symbol: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/perps/db/${symbol}`, {
        method: 'DELETE'
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || 'Failed to delete perp token');
      }
      
      await refreshTokens();
      return { success: true };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [refreshTokens]);

  const toggleActive = useCallback(async (symbol: string, isActive: boolean) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/perps/db/${symbol}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || 'Failed to toggle perp token');
      }
      
      await refreshTokens();
      return { success: true };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [refreshTokens]);

  return {
    createPerp,
    updatePerp,
    deletePerp,
    toggleActive,
    loading,
    error
  };
}