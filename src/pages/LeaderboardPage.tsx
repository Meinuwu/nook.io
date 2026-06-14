import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import ProfileAvatar from "../components/ProfileAvatar";
import { useAuth } from "../lib/useAuth";
import * as backend from "../lib/backend";

const METRICS: backend.LeaderboardMetric[] = [
  "streak",
  "week_minutes",
  "total_hours",
  "week_sessions",
];

const PODIUM_ORDER = [1, 0, 2] as const;

function formatMetricValue(entry: backend.LeaderboardEntry, metric: backend.LeaderboardMetric): string {
  if (entry.statsHidden) return "Private";
  switch (metric) {
    case "streak":
      return `${entry.currentStreak} ${entry.currentStreak === 1 ? "day" : "days"}`;
    case "week_minutes":
      return `${entry.weekFocusMinutes} min`;
    case "total_hours":
      return `${entry.totalHours} hrs`;
    case "week_sessions":
      return `${entry.weekSessions}`;
  }
}

function encouragementCopy(rank: number, metric: backend.LeaderboardMetric): string {
  const metricLabel = backend.LEADERBOARD_METRIC_LABELS[metric].toLowerCase();
  if (rank === 1) return `You're #1 on ${metricLabel} — amazing!`;
  if (rank === 2) return `You're #2 on ${metricLabel} — keep going!`;
  if (rank === 3) return `You're #3 — so close to the top!`;
  return `You're #${rank} — every session counts!`;
}

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const [metric, setMetric] = useState<backend.LeaderboardMetric>("streak");
  const [friendCount, setFriendCount] = useState(0);
  const [entries, setEntries] = useState<backend.LeaderboardEntry[]>([]);

  const userId = profile?.userId;

  useEffect(() => {
    if (!userId) return;
    const uid = userId;
    function refresh() {
      setFriendCount(backend.getFriends(uid).length);
      setEntries(backend.getFriendLeaderboard(uid, metric));
    }
    refresh();
    return backend.subscribeToFriends(uid, refresh);
  }, [userId, metric]);

  const selfEntry = useMemo(
    () => entries.find((e) => e.userId === userId),
    [entries, userId]
  );

  if (!profile) return null;

  const hasFriends = friendCount > 0;
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <>
      <PageHeader variant="back" title="Leaderboard" backTo="/profile" />

      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-6 sm:px-6">
        {!hasFriends ? (
          <section className="panel animate-pop-in flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-lg font-extrabold text-brown">Add friends to see the leaderboard</p>
            <p className="max-w-xs text-sm text-olive/70">
              Invite pals to your nook and compare study stats together.
            </p>
            <Link to="/friends" className="btn-primary mt-2 text-sm">
              Go to mailbox
            </Link>
          </section>
        ) : (
          <section className="panel animate-pop-in flex flex-col gap-5">
            <div className="flex flex-wrap justify-center gap-1.5">
              {METRICS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all ${
                    metric === m
                      ? "bg-peach text-white shadow-cozy"
                      : "metric-pill-inactive"
                  }`}
                >
                  {backend.LEADERBOARD_METRIC_LABELS[m]}
                </button>
              ))}
            </div>

            {selfEntry && (
              <p className="text-center text-sm font-semibold text-olive/80">
                {encouragementCopy(selfEntry.rank, metric)}
              </p>
            )}

            {podium.length > 0 && (
              <div aria-label="Top three" className="flex items-end justify-center gap-2 sm:gap-5">
                {PODIUM_ORDER.map((slot) => {
                  const entry = podium[slot];
                  if (!entry) {
                    return <div key={slot} className="w-[4.5rem] sm:w-24" />;
                  }
                  const isSelf = entry.userId === profile.userId;
                  const avatarSize = slot === 0 ? "lg" : "md";
                  const pedestalHeights = ["h-16", "h-20", "h-12"];
                  return (
                    <div
                      key={entry.userId}
                      className="flex w-[4.5rem] flex-col items-center sm:w-24"
                    >
                      <LeaderboardAvatar
                        entry={entry}
                        size={avatarSize}
                      />
                      <p className="mt-1.5 max-w-full truncate text-center text-xs font-extrabold text-brown">
                        {entry.displayName}
                        {isSelf ? " (you)" : ""}
                      </p>
                      <p className="text-[11px] font-bold text-olive sm:text-xs">
                        {formatMetricValue(entry, metric)}
                      </p>
                      <div
                        className={`mt-2 w-full rounded-t-xl bg-elevated-pedestal ${pedestalHeights[slot]} ${
                          isSelf ? "ring-1 ring-peach/50" : ""
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {rest.length > 0 && (
              <ul className="flex flex-col gap-2">
                {rest.map((entry) => (
                  <LeaderboardRow
                    key={entry.userId}
                    entry={entry}
                    metric={metric}
                    isSelf={entry.userId === profile.userId}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}

function LeaderboardAvatar({
  entry,
  size = "md",
}: {
  entry: backend.LeaderboardEntry;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? 32 : size === "lg" ? 56 : 44;
  return (
    <ProfileAvatar
      displayName={entry.displayName}
      profilePhotoUrl={entry.profilePhotoUrl}
      size={dim}
      showStatus
      status={entry.onlineStatus}
    />
  );
}

function LeaderboardRow({
  entry,
  metric,
  isSelf,
}: {
  entry: backend.LeaderboardEntry;
  metric: backend.LeaderboardMetric;
  isSelf: boolean;
}) {
  return (
    <li
      className={`leaderboard-row ${
        isSelf ? "leaderboard-row-self" : "leaderboard-row-other"
      }`}
    >
      <span className="w-6 shrink-0 text-center text-xs font-extrabold text-olive/70">
        #{entry.rank}
      </span>
      <LeaderboardAvatar entry={entry} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-brown">
          {entry.displayName}
          {isSelf && <span className="font-bold text-olive"> · you</span>}
        </p>
        <p className="truncate text-xs text-olive/70">@{entry.username}</p>
      </div>
      <span className="shrink-0 text-sm font-extrabold text-brown">
        {formatMetricValue(entry, metric)}
      </span>
    </li>
  );
}
