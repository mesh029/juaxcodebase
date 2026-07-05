import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ApiUser, UserProfile } from '../lib/api-types';
import {
  clearStoredToken,
  fetchMe,
  fetchProfile,
  getStoredToken,
  setStoredToken,
} from '../lib/api';

type AuthContextValue = {
  user: ApiUser | null;
  profile: UserProfile | null;
  token: string | null;
  loading: boolean;
  isAuthed: boolean;
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

  const refreshProfile = useCallback(async () => {
    try {
      const { user: p } = await fetchProfile();
      setProfile(p);
      setUser(p);
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
        // One auth call on boot — profile loads lazily via refreshProfile().
        const { user: me } = await fetchMe();
        if (cancelled) return;
        setToken(stored);
        setUser(me);
      } catch {
        await clearStoredToken();
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
    try {
      const { user: p } = await fetchProfile();
      setProfile(p);
    } catch {
      setProfile({ ...newUser });
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearStoredToken();
    setToken(null);
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      token,
      loading,
      isAuthed: !!token && !!user,
      signIn,
      signOut,
      refreshProfile,
    }),
    [user, profile, token, loading, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
