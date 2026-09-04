'use client';

import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Global AI Credits state — balance, plan, entitlements, and the operation
 * catalog (so the UI can show "This costs 5 ✦" without hardcoding costs).
 * The badge/modal consume this; billable surfaces call refresh() afterwards.
 */
const CreditsContext = createContext({
  plan: null,
  ai_credits: 0,
  reserved_credits: 0,
  entitlements: {},
  operations: {},
  loading: false,
  refresh: async () => {},
});

export function CreditsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({
    plan: null,
    ai_credits: 0,
    reserved_credits: 0,
    entitlements: {},
    operations: {},
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ plan: null, ai_credits: 0, reserved_credits: 0, entitlements: {}, operations: {} });
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiFetch('/api/entitlements');
      setState({
        plan: data.plan,
        ai_credits: data.ai_credits,
        reserved_credits: data.reserved_credits,
        entitlements: data.entitlements,
        operations: data.operations,
      });
    } catch (err) {
      // Credits UI must never break the app — fail silent.
      console.error('CreditsContext refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <CreditsContext.Provider value={{ ...state, loading, refresh }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  return useContext(CreditsContext);
}
