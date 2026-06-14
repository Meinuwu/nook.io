import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import ProfileAvatar from "../components/ProfileAvatar";
import StatusIndicator from "../components/StatusIndicator";
import VinylAvatar from "../components/VinylAvatar";
import { useAuth } from "../lib/useAuth";
import * as backend from "../lib/backend";
import { shareProfile } from "../lib/shareProfile";
import { APP_VERSION_LABEL } from "../lib/appInfo";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [friendCount, setFriendCount] = useState(0);
  const [onlineStatus, setOnlineStatus] = useState<backend.OnlineStatus>("offline");
  const [toast, setToast] = useState<string | null>(null);
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);

  const userId = profile?.userId;

  useEffect(() => {
    if (!userId) return;
    const uid = userId;
    function refreshFriends() {
      const all = backend.getFriends(uid);
      setFriendCount(all.length);
      setOnlineStatus(backend.getUserOnlineStatus(uid));
    }
    refreshFriends();
    return backend.subscribeToFriends(uid, refreshFriends);
  }, [userId, profile?.onlineStatus]);

  if (!profile) return null;

  const { userId: profileUserId, displayName, email, bio, profilePhotoUrl } = profile;
  const stats = backend.getStats(profileUserId);
  const streak = backend.getStreak(profileUserId);
  const streakRank = backend.getFriendLeaderboardRank(profileUserId, "streak");
  const earnedCount = backend.getUserAchievements(profileUserId).length;
  const username = profile.username ?? email.split("@")[0];

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }

  async function handleShareProfile() {
    try {
      const result = await shareProfile(username, displayName);
      if (result.method === "clipboard") {
        showToast("Link copied!");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }

  return (
    <>
      <PageHeader />
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-6 sm:px-6">
        <section className="panel animate-pop-in">
          <div className="flex items-start gap-4">
            <ProfileAvatar
              displayName={displayName}
              profilePhotoUrl={profilePhotoUrl}
              size={88}
              onClick={() => setShowPhotoLightbox(true)}
            />

            <div className="min-w-0 flex-1 pt-1">
              <h1 className="flex min-w-0 items-center gap-1.5 text-base font-extrabold text-brown">
                <span className="truncate">{displayName}</span>
                <StatusIndicator status={onlineStatus} variant="inline" />
              </h1>
              <p className="truncate text-sm text-olive/70">@{username}</p>
            </div>
          </div>

          {bio ? (
            <p className="mt-3 text-sm leading-relaxed text-brown/90">{bio}</p>
          ) : (
            <p className="mt-3 text-sm italic text-olive/50">
              Add a bio in Edit profile
            </p>
          )}

          <div className="mt-4 flex justify-around border-t border-olive/10 pt-3">
            <ProfileStat value={streak.currentStreak} label="streak" />
            <ProfileStat
              value={friendCount}
              label="friends"
              onClick={() => navigate("/friends")}
            />
            <ProfileStat
              value={earnedCount}
              label="badges"
              onClick={() => navigate("/achievements")}
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => navigate("/edit-profile")}
              className="profile-action-btn flex-1"
            >
              Edit profile
            </button>
            <button
              type="button"
              onClick={handleShareProfile}
              className="profile-action-btn flex-1"
            >
              Share profile
            </button>
            <button
              type="button"
              onClick={() => navigate("/friends")}
              className="profile-action-btn px-3"
              aria-label="Find friends"
            >
              <span className="text-sm font-extrabold">+</span>
            </button>
          </div>
        </section>

        <section className="panel animate-pop-in">
          <h2 className="mb-3 text-lg font-extrabold text-brown">Study avatar</h2>
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-4xl bg-cream/70 p-6 shadow-cozy">
              <VinylAvatar size={120} bob />
            </div>
            <p className="text-center text-sm text-olive/70">
              Your frog appears in study rooms and sessions.
            </p>
            <button
              type="button"
              onClick={() => navigate("/character")}
              className="profile-action-btn w-full"
            >
              Customize frog →
            </button>
          </div>
        </section>

        <section className="panel animate-pop-in">
          <h2 className="mb-3 text-lg font-extrabold text-brown">Your stats</h2>
          <div className="flex flex-col gap-3">
            <StatRow label="Focus time today" value={`${stats.todayMinutes} min`} />
            <StatRow label="Sessions this week" value={`${stats.weekSessions}`} />
            <StatRow label="Total focus" value={`${stats.totalHours} hrs`} />
            <StatRow
              label="Longest streak"
              value={`${streak.longestStreak} ${streak.longestStreak === 1 ? "day" : "days"}`}
            />
          </div>
          <p className="mt-3 rounded-2xl bg-cream/60 px-3 py-2 text-sm font-semibold text-brown">
            {streak.studiedToday
              ? "Keep it going — you studied today!"
              : streak.atRisk
                ? "Study today to keep your streak alive!"
                : streak.currentStreak > 0
                  ? "Start a session to grow your streak!"
                  : "Complete a 15+ min session to start a streak!"}
          </p>
        </section>

        <section className="panel animate-pop-in">
          <button
            type="button"
            onClick={() => navigate("/leaderboard")}
            className="flex w-full items-center justify-between text-left transition-opacity hover:opacity-80 active:opacity-70"
          >
            <span className="text-sm font-extrabold text-brown">Leaderboard</span>
            <span className="flex items-center gap-2 text-sm font-semibold text-olive/80">
              {streakRank && `#${streakRank.rank} streak`}
              <span className="text-peach" aria-hidden>→</span>
            </span>
          </button>
        </section>

        <p className="text-center text-xs font-semibold text-olive/50">{APP_VERSION_LABEL}</p>
      </main>

      {showPhotoLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-pop-in"
          role="dialog"
          aria-modal="true"
          aria-label="Profile photo"
        >
          <button
            type="button"
            className="absolute inset-0 bg-brown/40 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setShowPhotoLightbox(false)}
          />
          <div className="panel relative z-10 flex max-w-sm flex-col items-center gap-4 p-8 shadow-cozy-lg">
            <button
              type="button"
              onClick={() => setShowPhotoLightbox(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-cream/80 text-sm font-bold text-brown transition-colors hover:bg-cream"
              aria-label="Close"
            >
              ×
            </button>
            <ProfileAvatar
              displayName={displayName}
              profilePhotoUrl={profilePhotoUrl}
              size={200}
            />
            <p className="text-center text-sm font-bold text-brown">{displayName}</p>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-bold text-brown shadow-cozy-lg animate-pop-in"
          style={{ backgroundColor: "var(--bg-panel)" }}
          role="status"
        >
          {toast}
        </div>
      )}
    </>
  );
}

function ProfileStat({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="text-lg font-extrabold text-brown">{value}</span>
      <span className="text-xs font-semibold text-olive/70">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-[3.5rem] flex-col items-center transition-opacity hover:opacity-75 active:opacity-60"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex min-w-[3.5rem] flex-col items-center">
      {content}
    </div>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="stat-row">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-olive">
        {label}
      </span>
      <span className="text-lg font-extrabold text-brown">{value}</span>
    </div>
  );
}
