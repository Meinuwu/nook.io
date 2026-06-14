import { useCallback, useEffect, useState } from "react";
import * as backend from "../lib/mockBackend";
import type { RoomLeaderboardEntry, RoomLeaderboardPeriod, RoomMember } from "../lib/mockBackend";
import type { PresenceStatus } from "../lib/avatarTypes";

interface RoomStudyLeaderboardProps {
  roomId: string;
  currentUserId: string;
  /** Current room members — changes trigger a leaderboard refresh. */
  members: RoomMember[];
}

const PERIODS: { id: RoomLeaderboardPeriod; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
];

const FROG_AVATAR_SRC = "/assets/avatar/frog.png";

/** In-room presence shown on the focus board, derived from each member's timer. */
const PRESENCE_DISPLAY: Record<PresenceStatus, { label: string; dot: string }> = {
  studying: { label: "Studying", dot: "bg-[#23a559]" },
  break: { label: "Resting", dot: "bg-[#f0b232]" },
  idle: { label: "Idle", dot: "bg-[#80848e]" },
};

/** Compact, collapsible focus-time leaderboard for the people in this nook. */
export default function RoomStudyLeaderboard({
  roomId,
  currentUserId,
  members,
}: RoomStudyLeaderboardProps) {
  const [period, setPeriod] = useState<RoomLeaderboardPeriod>("daily");
  const [entries, setEntries] = useState<RoomLeaderboardEntry[]>([]);
  const [expanded, setExpanded] = useState(true);

  const refresh = useCallback(() => {
    setEntries(backend.getRoomStudyLeaderboard(roomId, period, currentUserId));
  }, [roomId, period, currentUserId]);

  // Refresh on membership change (members prop) + a 1s interval so an active
  // session's elapsed focus time ticks up live, not only when it completes.
  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, [refresh, members]);

  return (
    <div className="panel pointer-events-auto flex w-60 max-w-[78vw] flex-col gap-2 !p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between text-left"
        aria-expanded={expanded}
      >
        <span className="text-sm font-extrabold text-brown">Focus board</span>
        <span className="text-xs font-bold text-peach">
          {expanded ? "Hide" : `${entries.length}`}
        </span>
      </button>

      {expanded && (
        <>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`flex-1 rounded-full py-1 text-xs font-extrabold transition-all ${
                  period === p.id
                    ? "bg-peach text-white shadow-cozy"
                    : "metric-pill-inactive"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="px-1 py-2 text-xs text-olive/70">
                No one's here yet — pull up a chair!
              </p>
            ) : (
              entries.map((entry) => (
                <Row key={entry.userId} entry={entry} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ entry }: { entry: RoomLeaderboardEntry }) {
  const presence = PRESENCE_DISPLAY[entry.presenceStatus] ?? PRESENCE_DISPLAY.idle;
  return (
    <div
      className={`flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2 ${
        entry.isSelf
          ? "border-l-[3px] border-peach bg-cream/70"
          : "border-l-[3px] border-transparent"
      }`}
    >
      <span className="w-4 shrink-0 text-center text-[11px] font-extrabold text-olive/70">
        {entry.rank}
      </span>
      <CharacterAvatar size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-brown">
          {entry.displayName}
          {entry.isSelf && <span className="font-semibold text-olive"> · you</span>}
        </p>
        <p className="flex items-center gap-1 text-[10px] font-semibold text-olive/80">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${presence.dot}`} />
          {presence.label}
        </p>
      </div>
      <span className="shrink-0 text-xs font-extrabold text-brown">
        {entry.statsHidden ? (
          <span className="font-semibold text-olive/60">Private</span>
        ) : (
          backend.formatStudyMinutes(entry.minutes)
        )}
      </span>
    </div>
  );
}

/** Circular portrait of the in-room frog character the focus time belongs to. */
function CharacterAvatar({ size = 30 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-cream shadow-cozy"
      style={{ width: size, height: size }}
    >
      <img
        src={FROG_AVATAR_SRC}
        alt=""
        draggable={false}
        className="avatar-crisp h-[135%] w-[135%] object-contain"
      />
    </span>
  );
}
