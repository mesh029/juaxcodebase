import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ApiUser, UserProfile } from '../lib/api-types';
import {
  ApiError,
  clearStoredToken,
  fetchMe,
  fetchProfile,
  getStoredToken,
  setStoredToken,
} from '../lib/api';
import {
  cacheProfile,
  cacheUser,
  clearAuthCaches,
  loadCachedProfile,
  loadCachedUser,
} from '../lib/offline/cache';
import { checkApiHealth } from '../lib/offline/health';

type AuthContextValue = {
  user: ApiUser | null;
  profile: UserProfile | null;
  token: string | null;
  loading: boolean;
  isAuthed: boolean;
  /** True when using cached session because API is down */
  offlineSession: boolean;
  signIn: (token: string, user: ApiUser) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineSession, setOfflineSession] = useState(false);

  const refreshProfile = useCallback(async () => {
    try {
      const { user: p } = await fetchProfile();
      setProfile(p);
      setUser(p);
      await cacheProfile(p);
      await cacheUser(p);
      setOfflineSession(false);
    } catch {
      /* profile optional on boot */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getStoredToken();
        if (!stored) {
          if (!cancelled) setLoading(false);
          return;
        }

        const cachedUser = await loadCachedUser();
        const cachedProfile = await loadCachedProfile();
        if (!cancelled && cachedUser) {
          setToken(stored);
          setUser(cachedUser);
          if (cachedProfile) setProfile(cachedProfile);
        }

        const health = await checkApiHealth({ force: true });
        if (health !== 'up') {
          if (cachedUser) {
            if (!cancelled) {
              setToken(stored);
              setUser(cachedUser);
              if (cachedProfile) setProfile(cachedProfile);
              setOfflineSession(true);
            }
          }
          return;
        }

        try {
          const { user: me } = await fetchMe();
          if (cancelled) return;
          setToken(stored);
          setUser(me);
          await cacheUser(me);
          setOfflineSession(false);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            await clearStoredToken();
            await clearAuthCaches();
            if (!cancelled) {
              setToken(null);
              setUser(null);
              setProfile(null);
            }
            return;
          }
          // Network / 5xx — keep cached session
          if (cachedUser && !cancelled) {
            setToken(stored);
            setUser(cachedUser);
            if (cachedProfile) setProfile(cachedProfile);
            setOfflineSession(true);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (newToken: string, newUser: ApiUser) => {
    await setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
    await cacheUser(newUser);
    setOfflineSession(false);
    try {
      const { user: p } = await fetchProfile();
      setProfile(p);
      await cacheProfile(p);
    } catch {
      setProfile({ ...newUser });
      await cacheProfile({ ...newUser });
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearStoredToken();
    await clearAuthCaches();
    setToken(null);
    setUser(null);
    setProfile(null);
    setOfflineSession(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      token,
      loading,
      isAuthed: !!token && !!user,
      offlineSession,
      signIn,
      signOut,
      refreshProfile,
    }),
    [user, profile, token, loading, offlineSession, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
