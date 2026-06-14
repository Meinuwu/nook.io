import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  saveAvatar: (config: AvatarConfig, markCreated?: boolean) => Promise<void>;
  updateProfile: (update: ProfileUpdate) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function profilesEqual(a: Profile | null, b: Profile | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.userId === b.userId &&
    a.displayName === b.displayName &&
    a.username === b.username &&
    a.avatarCreated === b.avatarCreated &&
    a.email === b.email
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const loadFromSession = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      await initBackend();
      const session = backend.getSession();
      if (session) {
        const p = await backend.getProfile(session.userId);
        if (seq !== loadSeq.current) return;
        if (p) {
          setProfile((prev) => (profilesEqual(prev, p) ? prev : p));
        }
      } else {
        if (seq !== loadSeq.current) return;
        setProfile(null);
      }
    } catch (err) {
      console.error("[nook] Failed to load auth session:", err);
      if (seq !== loadSeq.current) return;
      setProfile((prev) => prev);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFromSession();
    const unsub = backend.onAuthChange(() => {
      void loadFromSession();
    });
    return unsub;
  }, [loadFromSession]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void loadFromSession();
      }, 400);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
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

  const resetPasswordForEmail = useCallback(async (email: string) => {
    await backend.resetPasswordForEmail(email);
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    await backend.updatePassword(newPassword);
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
    if (!profile) return;
    try {
      const p = await backend.getProfile(profile.userId);
      if (p) {
        setProfile((prev) => (profilesEqual(prev, p) ? prev : p));
      }
    } catch (err) {
      console.warn("[nook] Profile refresh failed:", err);
    }
  }, [profile]);

  const value = useMemo<AuthState>(
    () => ({
      profile,
      loading,
      signUp,
      login,
      logout,
      resetPasswordForEmail,
      updatePassword,
      saveAvatar,
      updateProfile,
      refresh,
    }),
    [
      profile,
      loading,
      signUp,
      login,
      logout,
      resetPasswordForEmail,
      updatePassword,
      saveAvatar,
      updateProfile,
      refresh,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
