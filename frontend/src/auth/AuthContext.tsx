import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Role, User } from '../api/types';

const STORAGE_KEY = 'vlab.auth';

interface StoredAuth {
  token: string;
  user: User;
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

interface AuthValue {
  token: string | null;
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string, role: Role) => Promise<User>;
  logout: () => void;
  api: <T>(path: string, options?: ApiOptions) => Promise<T>;
  download: (path: string) => Promise<Blob>;
}

const AuthContext = createContext<AuthValue | null>(null);

function readStored(): StoredAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStored());
  const [ready, setReady] = useState(false);

  // Validate a restored token once so a restarted backend or expired JWT
  // sends the user back to the login screen instead of a broken dashboard.
  useEffect(() => {
    const stored = readStored();
    if (!stored) {
      setReady(true);
      return;
    }

    let alive = true;
    fetch('/api/auth/me', { headers: { authorization: `Bearer ${stored.token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error('Session expired');
        const user = (await res.json()) as User;
        if (!alive) return;
        const next = { token: stored.token, user };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setAuth(next);
      })
      .catch(() => {
        if (!alive) return;
        sessionStorage.removeItem(STORAGE_KEY);
        setAuth(null);
      })
      .finally(() => {
        if (alive) setReady(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  const api = useCallback(
    async <T,>(path: string, options: ApiOptions = {}): Promise<T> => {
      const res = await fetch(`/api${path}`, {
        method: options.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          ...(auth?.token ? { authorization: `Bearer ${auth.token}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        if (res.status === 401 && auth) {
          sessionStorage.removeItem(STORAGE_KEY);
          setAuth(null);
        }
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      return data as T;
    },
    [auth],
  );

  const download = useCallback(
    async (path: string): Promise<Blob> => {
      const res = await fetch(path, {
        headers: auth?.token ? { authorization: `Bearer ${auth.token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text();
        let message = `Request failed (${res.status})`;
        try {
          message = JSON.parse(text)?.error ?? message;
        } catch {
          /* not JSON */
        }
        throw new Error(message);
      }
      return res.blob();
    },
    [auth],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      const next = { token: result.token, user: result.user };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setAuth(next);
      return result.user;
    },
    [api],
  );

  const register = useCallback(
    async (name: string, email: string, password: string, role: Role) => {
      const result = await api<{ token: string; user: User }>('/auth/register', {
        method: 'POST',
        body: { name, email, password, role },
      });
      const next = { token: result.token, user: result.user };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setAuth(next);
      return result.user;
    },
    [api],
  );

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token: auth?.token ?? null,
        user: auth?.user ?? null,
        ready,
        login,
        register,
        logout,
        api,
        download,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
