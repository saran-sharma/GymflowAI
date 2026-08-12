/**
 * One loading/error/refresh shape for every screen.
 *
 * Every fetch in the app goes through here so no screen invents its own
 * spinner semantics, and so an expired session is handled identically
 * everywhere (AuthContext.withToken refreshes, this hook just reports).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import { useAuth } from '../store/AuthContext';

export interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setData: (value: T) => void;
}

export function useApi<T>(
  call: (token: string) => Promise<T>,
  deps: unknown[] = [],
): ApiResult<T> {
  const { withToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Guards a setState after the screen has gone away, which React Native warns
  // about and which would otherwise show a stale error on the next screen.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);

      try {
        const result = await withToken(call);
        if (!alive.current) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (!alive.current) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, 'unknown', (caught as Error)?.message ?? 'Unexpected error'),
        );
      } finally {
        if (alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // `call` is recreated on every render by design; the caller declares the
    // real dependencies so this does not loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withToken, ...deps],
  );

  useEffect(() => {
    void run('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: useCallback(() => run('initial'), [run]),
    refresh: useCallback(() => run('refresh'), [run]),
    setData: useCallback((value: T) => setData(value), []),
  };
}
