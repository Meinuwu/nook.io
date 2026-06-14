import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as backend from "./backend";
import { initBackend } from "./backend";
import type { Profile, ProfileUpdate } from "./backend";
import type { AvatarConfig } from "./avatarTypes";

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    username?: string,
    inviter?: string
  ) => Promise<Profile>;
  login: (email: string, password: string) => Promise<Profile>;
  logout: () => Promise<void>;
  saveAvatar: (config: AvatarConfig, markCreated?: boolean) => Promise<void>;
  updateProfile: (update: ProfileUpdate) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromSession = useCallback(async () => {
    try {
      await initBackend();
      const session = backend.getSession();
      if (session) {
        const p = await backend.getProfile(session.userId);
        setProfile(p);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error("[nook] Failed to load auth session:", err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromSession();
    const unsub = backend.onAuthChange(() => loadFromSession());
    return unsub;
  }, [loadFromSession]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      username?: string,
      inviter?: string
    ) => {
      const p = await backend.signUp(email, password, username, inviter);
      setProfile(p);
      return p;
    },
    []
  );

  const login = useCallback(async (email: string, password: string) => {
    const p = await backend.login(email, password);
    setProfile(p);
    return p;
  }, []);

  const logout = useCallback(async () => {
    await backend.logout();
    setProfile(null);
  }, []);

  const saveAvatar = useCallback(
    async (config: AvatarConfig, markCreated = true) => {
      if (!profile) return;
      const updated = await backend.updateAvatarConfig(
        profile.userId,
        config,
        markCreated
      );
      setProfile({ ...updated });
    },
    [profile]
  );

  const updateProfile = useCallback(
    async (update: ProfileUpdate) => {
      if (!profile) return;
      const updated = await backend.updateProfile(profile.userId, update);
      setProfile({ ...updated });
    },
    [profile]
  );

  const refresh = useCallback(async () => {
    if (profile) {
      const p = await backend.getProfile(profile.userId);
      setProfile(p);
    }
  }, [profile]);

  const value = useMemo<AuthState>(
    () => ({
      profile,
      loading,
      signUp,
      login,
      logout,
      saveAvatar,
      updateProfile,
      refresh,
    }),
    [profile, loading, signUp, login, logout, saveAvatar, updateProfile, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
