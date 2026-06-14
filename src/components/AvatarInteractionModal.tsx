import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfileAvatar from "./ProfileAvatar";
import * as backend from "../lib/backend";
import { refreshPublicUserCard } from "../lib/backend";
import type { PublicUserCard } from "../lib/backend";

interface AvatarInteractionModalProps {
  /** The clicked avatar's user id. */
  userId: string;
  currentUserId: string;
  roomId: string;
  onClose: () => void;
}

const ONLINE_LABELS: Record<backend.OnlineStatus, string> = {
  online: "Online",
  dnd: "Do not disturb",
  offline: "Offline",
};

const PRESENCE_LABELS: Record<string, string> = {
  studying: "Studying",
  break: "On a break",
  idle: "Hanging out",
};

/**
 * Popup shown when the local user clicks any avatar in the room.
 * Surfaces a friend request (or its current state) for other people, and a
 * read-only profile view for friends and for the local user.
 */
export default function AvatarInteractionModal({
  userId,
  currentUserId,
  roomId,
  onClose,
}: AvatarInteractionModalProps) {
  const navigate = useNavigate();
  const [card, setCard] = useState<PublicUserCard | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void refreshPublicUserCard(currentUserId, userId, roomId).then((next) => {
      setCard(next);
      setLoaded(true);
    });
  }, [currentUserId, userId, roomId]);

  useEffect(() => {
    refresh();
    return backend.subscribeToFriends(currentUserId, refresh);
  }, [refresh, currentUserId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleAddFriend() {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      await backend.sendFriendRequestByUserId(currentUserId, card.userId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request.");
    } finally {
      setBusy(false);
    }
  }

  function goToProfile() {
    onClose();
    navigate("/profile");
  }

  function messageFriend() {
    if (!card) return;
    onClose();
    navigate("/friends", { state: { chatWith: card.userId } });
  }

  function openMailbox() {
    onClose();
    navigate("/friends");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-pop-in"
      role="dialog"
      aria-modal="true"
      aria-label="Avatar"
    >
      <button
        type="button"
        className="absolute inset-0 bg-brown/40 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="panel relative z-10 w-full max-w-sm !p-6 shadow-cozy-lg">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-cream/80 text-sm font-bold text-brown transition-colors hover:bg-cream"
        >
          ×
        </button>

        {!loaded ? (
          <p className="py-6 text-center text-sm text-olive/70">Loading…</p>
        ) : !card ? (
          <p className="py-6 text-center text-sm text-olive/70">
            Couldn't load this study buddy.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 pr-6">
              <ProfileAvatar
                displayName={card.displayName}
                profilePhotoUrl={card.profilePhotoUrl}
                size={64}
                showStatus
                status={card.onlineStatus}
              />
              <div className="min-w-0 flex-1">
                <h2 className="flex min-w-0 items-center gap-1 truncate text-lg font-extrabold text-brown">
                  <span className="truncate">{card.displayName}</span>
                  {card.isSelf && (
                    <span className="shrink-0 text-sm font-bold text-olive">· you</span>
                  )}
                </h2>
                <p className="truncate text-sm text-olive/70">@{card.username}</p>
                <p className="mt-0.5 text-xs font-semibold text-olive">
                  {card.presenceStatus && PRESENCE_LABELS[card.presenceStatus]
                    ? `${PRESENCE_LABELS[card.presenceStatus]} · ${ONLINE_LABELS[card.onlineStatus]}`
                    : ONLINE_LABELS[card.onlineStatus]}
                </p>
              </div>
            </div>

            {card.bio && (
              <p className="mt-3 text-sm leading-relaxed text-brown/90">{card.bio}</p>
            )}

            <div className="mt-4">
              {card.stats ? (
                <div className="flex gap-2">
                  <StatChip label="today" value={`${card.stats.todayMinutes}m`} />
                  <StatChip label="this week" value={`${card.stats.weekSessions}`} />
                  <StatChip label="total" value={`${card.stats.totalHours}h`} />
                </div>
              ) : (
                <p className="rounded-2xl bg-cream/60 px-3 py-2 text-center text-xs font-semibold text-olive/80">
                  This buddy keeps their stats private.
                </p>
              )}
            </div>

            {error && (
              <p className="mt-3 text-center text-sm font-semibold text-peach">{error}</p>
            )}

            <div className="mt-5">{renderActions()}</div>
          </>
        )}
      </div>
    </div>
  );

  function renderActions() {
    if (!card) return null;

    if (card.isSelf) {
      return (
        <button type="button" onClick={goToProfile} className="btn-primary w-full text-sm">
          View full profile
        </button>
      );
    }

    switch (card.friendshipStatus) {
      case "friends":
        return (
          <div className="flex items-center gap-2">
            <span className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-sage/30 px-4 py-2.5 text-sm font-extrabold text-brown">
              Friends ✓
            </span>
            <button
              type="button"
              onClick={messageFriend}
              className="btn-primary shrink-0 text-sm"
            >
              Message
            </button>
          </div>
        );
      case "pending_outgoing":
        return (
          <button type="button" disabled className="btn-ghost w-full text-sm opacity-70">
            Request sent
          </button>
        );
      case "pending_incoming":
        return (
          <div className="flex flex-col gap-2">
            <p className="text-center text-xs font-semibold text-olive/80">
              {card.displayName} sent you a friend request.
            </p>
            <button type="button" onClick={openMailbox} className="btn-primary w-full text-sm">
              Open mailbox
            </button>
          </div>
        );
      default:
        return (
          <button
            type="button"
            onClick={handleAddFriend}
            disabled={busy}
            className="btn-primary w-full text-sm"
          >
            {busy ? "Sending…" : "Add friend"}
          </button>
        );
    }
  }
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl bg-cream/60 px-2 py-2">
      <span className="text-base font-extrabold text-brown">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-olive/70">
        {label}
      </span>
    </div>
  );
}
