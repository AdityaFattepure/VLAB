import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Poll an endpoint on an interval. `deps` are the values that should restart
 * polling (for example a selected class id).
 */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[]) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const value = await fnRef.current();
        if (!alive) return;
        setData(value);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void run();
    const timer = setInterval(() => void run(), intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, nonce, ...deps]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, refresh };
}
