import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import Toggle from "../components/Toggle";
import { useAuth } from "../lib/useAuth";
import { STREAK_MIN_MINUTES, syncOnlineStatus, type OnlineStatusMode } from "../lib/backend";
import { usePreferences } from "../lib/preferences";
import { APP_VERSION_LABEL } from "../lib/appInfo";

const STATUS_OPTIONS: { value: OnlineStatusMode; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Online when you're active in Nook, offline otherwise",
  },
  {
    value: "dnd",
    label: "Do not disturb",
    description: "Show as busy — friends won't see you as available",
  },
  {
    value: "offline",
    label: "Appear offline",
    description: "Always show as offline to friends",
  },
];

export default function SettingsPage() {
  const { profile, logout, refresh } = useAuth();
  const { preferences, updatePreferences } = usePreferences();
  const [statusMode, setStatusMode] = useState<OnlineStatusMode>("auto");

  useEffect(() => {
    if (profile?.onlineStatus) {
      setStatusMode(profile.onlineStatus);
    }
  }, [profile?.onlineStatus]);

  if (!profile) return null;

  const username = profile.username ?? profile.email.split("@")[0];

  function handleStatusChange(mode: OnlineStatusMode) {
    setStatusMode(mode);
    syncOnlineStatus(profile!.userId, mode);
    refresh();
  }

  return (
    <>
      <PageHeader />
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-6 sm:px-6">
        <section className="panel animate-pop-in">
          <h2 className="mb-4 text-lg font-extrabold text-brown">Status</h2>
          <div className="flex flex-col gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStatusChange(opt.value)}
                className={`selectable-option ${
                  statusMode === opt.value ? "selectable-option--selected" : ""
                }`}
              >
                <p className="selectable-option__title">{opt.label}</p>
                <p className="selectable-option__description">{opt.description}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="panel animate-pop-in">
          <h2 className="mb-4 text-lg font-extrabold text-brown">Audio</h2>
          <div className="flex flex-col gap-2">
            <SettingRow
              label="Sound effects"
              description="Timer chimes and UI feedback sounds"
              checked={preferences.soundEffects}
              onChange={(v) => updatePreferences({ soundEffects: v })}
            />
          </div>
        </section>

        <section className="panel animate-pop-in">
          <h2 className="mb-4 text-lg font-extrabold text-brown">Privacy</h2>
          <div className="flex flex-col gap-2">
            <SettingRow
              label="Show stats"
              description="Let others see your streak, focus time, and sessions"
              checked={preferences.showStats}
              onChange={(v) => updatePreferences({ showStats: v })}
            />
            <SettingRow
              label="Show achievements"
              description="Let others see your badges and achievements"
              checked={preferences.showAchievements}
              onChange={(v) => updatePreferences({ showAchievements: v })}
            />
            <SettingRow
              label="Show friends"
              description="Let others see your friends list"
              checked={preferences.showFriends}
              onChange={(v) => updatePreferences({ showFriends: v })}
            />
            <SettingRow
              label="Auto-accept friends"
              description="Let others add you instantly without a friend request"
              checked={preferences.autoAcceptFriends}
              onChange={(v) => updatePreferences({ autoAcceptFriends: v })}
            />
          </div>
        </section>

        <section className="panel animate-pop-in">
          <h2 className="mb-4 text-lg font-extrabold text-brown">Notifications</h2>
          <div className="flex flex-col gap-2">
            <SettingRow
              label="Study reminders"
              description="Daily nudges to keep your streak going (coming soon)"
              checked={preferences.notifications}
              onChange={(v) => updatePreferences({ notifications: v })}
            />
          </div>
        </section>

        <section className="panel animate-pop-in">
          <h2 className="mb-4 text-lg font-extrabold text-brown">Appearance</h2>
          <div className="flex flex-col gap-2">
            <SettingRow
              label="Dark cozy theme"
              description="Warmer evening palette for late-night study"
              checked={preferences.theme === "dark"}
              onChange={(v) => updatePreferences({ theme: v ? "dark" : "cozy" })}
            />
          </div>
          <p className="settings-note">
            Streaks count focus sessions of {STREAK_MIN_MINUTES}+ minutes only.
          </p>
        </section>

        <section className="panel animate-pop-in">
          <h2 className="mb-4 text-lg font-extrabold text-brown">Account</h2>
          <div className="flex flex-col gap-3">
            <ReadOnlyField label="Nickname" value={profile.displayName} />
            <ReadOnlyField label="Username" value={`@${username}`} />
            <ReadOnlyField label="Email" value={profile.email} />
            <ReadOnlyField label="Nook ID" value={profile.userId} mono />
          </div>
        </section>

        <section className="panel animate-pop-in">
          <button onClick={logout} className="btn-primary w-full">
            Log out
          </button>
        </section>

        <p className="text-center text-xs font-semibold text-olive/50">{APP_VERSION_LABEL}</p>
      </main>
    </>
  );
}

function SettingRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-bold">{label}</p>
        <p className="setting-row__description">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="info-field">
      <p className="info-field__label">{label}</p>
      <p className={`truncate text-sm font-bold ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </p>
    </div>
  );
}
