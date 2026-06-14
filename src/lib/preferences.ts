import { useCallback, useEffect, useState } from "react";
import { getMyUserId, syncPrivacySettings, type PrivacySettings } from "./mockBackend";

export interface Preferences extends PrivacySettings {
  soundEffects: boolean;
  notifications: boolean;
  theme?: "cozy" | "dark";
}

const PREF_KEY = "nook.preferences.v1";

const DEFAULT_PREFERENCES: Preferences = {
  soundEffects: true,
  notifications: true,
  showStats: true,
  showAchievements: true,
  showFriends: true,
  autoAcceptFriends: false,
  theme: "cozy",
};

const PRIVACY_KEYS: (keyof PrivacySettings)[] = [
  "showStats",
  "showAchievements",
  "showFriends",
  "autoAcceptFriends",
];

function hasPrivacyChanges(partial: Partial<Preferences>): boolean {
  return PRIVACY_KEYS.some((key) => partial[key] !== undefined);
}

function privacyFromPreferences(prefs: Preferences): PrivacySettings {
  return {
    showStats: prefs.showStats,
    showAchievements: prefs.showAchievements,
    showFriends: prefs.showFriends,
    autoAcceptFriends: prefs.autoAcceptFriends,
  };
}

const listeners = new Set<() => void>();

function applyTheme(theme: Preferences["theme"]) {
  document.documentElement.dataset.theme = theme ?? "cozy";
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences> & {
      showOnlineStatus?: boolean;
      ambientSound?: boolean;
    };
    const { showOnlineStatus: _legacy, ambientSound: _ambient, ...rest } = parsed;
    const prefs = { ...DEFAULT_PREFERENCES, ...rest };
    if ("ambientSound" in parsed) {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    }
    return prefs;
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

export function savePreferences(partial: Partial<Preferences>): Preferences {
  const next = { ...loadPreferences(), ...partial };
  localStorage.setItem(PREF_KEY, JSON.stringify(next));

  if (partial.theme !== undefined) {
    applyTheme(next.theme);
  }

  if (hasPrivacyChanges(partial)) {
    const userId = getMyUserId();
    if (userId) syncPrivacySettings(userId, privacyFromPreferences(next));
  }

  notifyListeners();
  return next;
}

export function subscribeToPreferences(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Apply persisted preferences on app boot (theme, privacy sync). */
export function initPreferencesOnBoot(): void {
  const prefs = loadPreferences();
  applyTheme(prefs.theme);
  const userId = getMyUserId();
  if (userId) syncPrivacySettings(userId, privacyFromPreferences(prefs));
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    const prefs = loadPreferences();
    applyTheme(prefs.theme);
    return prefs;
  });

  useEffect(() => {
    const refresh = () => setPreferences(loadPreferences());
    const unsub = subscribeToPreferences(refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREF_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const updatePreferences = useCallback((partial: Partial<Preferences>) => {
    const next = savePreferences(partial);
    setPreferences(next);
  }, []);

  return { preferences, updatePreferences };
}
