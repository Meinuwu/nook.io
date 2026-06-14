import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PhaserRoom, { type PhaserRoomHandle } from "../components/PhaserRoom";
import FocusTimer, { type TimerPhase } from "../components/FocusTimer";
import RoomChat from "../components/RoomChat";
import RoomStudyLeaderboard from "../components/RoomStudyLeaderboard";
import AvatarInteractionModal from "../components/AvatarInteractionModal";
import { useAuth } from "../lib/useAuth";
import * as backend from "../lib/backend";
import { buildRoomShareUrl, initBackend, refreshRoomMembers, refreshChat } from "../lib/backend";
import type { Room, RoomMember, ChatMessage } from "../lib/backend";
import type { PresenceStatus } from "../lib/avatarTypes";

export default function StudyRoomPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [localUserTyping, setLocalUserTyping] = useState(false);
  const handleTypingChange = useCallback((isTyping: boolean) => {
    setLocalUserTyping(isTyping);
  }, []);
  const [timerPhase, setTimerPhase] = useState<TimerPhase>("idle");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const phaserRoomRef = useRef<PhaserRoomHandle>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const myMember = useMemo(
    () => members.find((m) => m.userId === profile?.userId),
    [members, profile]
  );
  const isSeated = (myMember?.deskSlot ?? -1) >= 0;

  const refreshMembers = useCallback(() => {
    void refreshRoomMembers(roomId)
      .then(setMembers)
      .catch((err) => console.warn("[nook] refresh members failed:", err));
  }, [roomId]);

  const refreshChatMessages = useCallback(() => {
    void refreshChat(roomId)
      .then(setChatMessages)
      .catch((err) => console.warn("[nook] refresh chat failed:", err));
  }, [roomId]);

  useEffect(() => {
    if (!profile?.userId) return;
    const userId = profile.userId;
    let active = true;
    (async () => {
      await initBackend();
      const currentProfile = profileRef.current;
      if (!currentProfile) return;
      const r = await backend.getRoom(roomId);
      if (!active) return;
      if (!r) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setRoom(r);
      await backend.joinRoom(roomId, currentProfile);
      refreshMembers();
      refreshChatMessages();
      backend.checkStudyBuddyAchievement(roomId, userId);
      setLoading(false);
    })();

    const unsubMembers = backend.subscribeToRoom(roomId, refreshMembers);
    const unsubChat = backend.subscribeToChat(roomId, refreshChatMessages);
    return () => {
      active = false;
      unsubMembers();
      unsubChat();
      backend.commitFocusProgress(roomId, userId, true);
      void backend.leaveRoom(roomId, userId).catch((err) => {
        console.warn("[nook] leaveRoom failed:", err);
      });
    };
  }, [roomId, profile?.userId, refreshMembers, refreshChatMessages]);

  const handleSeatClick = useCallback(
    async (slot: number) => {
      if (!profile) return;
      setSeatError(null);
      try {
        await backend.changeSeat(roomId, profile.userId, slot);
        refreshMembers();
      } catch (err) {
        setSeatError(err instanceof Error ? err.message : "Could not sit there.");
      }
    },
    [roomId, profile, refreshMembers]
  );

  const handleAvatarClick = useCallback((userId: string) => {
    setSelectedUserId(userId);
  }, []);

  const handleSendChat = useCallback(
    async (text: string) => {
      if (!profile) return;
      try {
        await backend.sendChatMessage(roomId, profile.userId, profile.displayName, text);
        refreshChatMessages();
      } catch (err) {
        console.warn("[nook] send chat failed:", err);
      }
    },
    [roomId, profile, refreshChatMessages]
  );

  const setStatus = useCallback(
    (status: PresenceStatus, timerEndsAt: number | null) => {
      if (!profile) return;
      backend.updateMemberStatus(roomId, profile.userId, status, timerEndsAt);
    },
    [roomId, profile]
  );

  const onFocusProgress = useCallback(
    (finalize: boolean) => {
      if (!profile) return;
      backend.commitFocusProgress(roomId, profile.userId, finalize);
      refreshMembers();
    },
    [roomId, profile, refreshMembers]
  );

  const handleFocusStart = useCallback(() => {
    phaserRoomRef.current?.beginFocusAtSeat();
  }, []);

  // Live per-character daily study seconds (saved today + in-progress), polled
  // at ~10 Hz by the scene while a focus session is running.
  const getStudySeconds = useCallback(
    () => backend.getRoomDailyStudySeconds(roomId),
    [roomId]
  );

  const studyingCount = useMemo(
    () => members.filter((m) => m.status === "studying").length,
    [members]
  );

  const streak = profile ? backend.getStreak(profile.userId) : null;

  function copyCode() {
    if (!room) return;
    const shareUrl = buildRoomShareUrl(room.code);
    navigator.clipboard?.writeText(shareUrl).catch(() => {
      navigator.clipboard?.writeText(room.code).catch(() => {});
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (notFound) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-cream">
        <p className="text-xl font-bold text-brown">This nook doesn't exist anymore.</p>
        <button onClick={() => navigate("/home")} className="btn-primary">
          Back home
        </button>
      </div>
    );
  }

  if (loading || !room) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-b from-cream to-peach/20">
        <div className="animate-bob text-center">
          <p className="text-2xl font-extrabold text-brown">Opening your nook…</p>
          <p className="mt-2 text-brown/70">📚 ✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* The room is a full-viewport layer sized only by the window. Timer phase
          changes (pause / resume / end) resize the bottom bar, but the bar is an
          absolute overlay (below) rather than a flex sibling, so the room host
          never changes size. That means the WebGL canvas is never reset and the
          room never rebuilds or redraws its backdrop on a phase change — no more
          black flash. Phase changes only update avatar state. */}
      <div className="absolute inset-0">
        <PhaserRoom
          ref={phaserRoomRef}
          key={roomId}
          members={members}
          chatMessages={chatMessages}
          capacity={room.capacity}
          currentUserId={profile!.userId}
          onSeatClick={handleSeatClick}
          onAvatarClick={handleAvatarClick}
          localUserTyping={localUserTyping}
          timerPhase={timerPhase}
          getStudySeconds={getStudySeconds}
        />
      </div>

      {/* top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => navigate("/home")}
              className="btn-ghost text-sm shadow-cozy"
            >
              ← Leave
            </button>
            {streak && (
              <div
                className={`panel flex items-center gap-2 px-3 py-2 ${
                  streak.atRisk ? "border-amber/60 bg-amber/10" : ""
                }`}
                title={
                  streak.studiedToday
                    ? "Streak safe for today!"
                    : streak.atRisk
                      ? "Study today to keep your streak!"
                      : "Start studying to build your streak"
                }
              >
                <span className="text-lg">🔥</span>
                <span className="text-sm font-extrabold text-brown">{streak.currentStreak}</span>
                {streak.atRisk && (
                  <span className="text-[10px] font-bold text-amber-700">!</span>
                )}
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <button
              onClick={copyCode}
              className="panel flex items-center gap-3 px-5 py-2.5"
            >
              <span className="text-xs font-semibold text-brown/70">{room.name}</span>
              <span className="text-lg font-extrabold tracking-widest text-brown">
                {room.code}
              </span>
              <span className="text-xs font-bold text-peach">
                {copied ? "Link copied!" : "Copy link"}
              </span>
            </button>
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-brown/70 shadow-cozy">
              {members.length}/{room.capacity} seats · cozy nook
            </span>
          </div>
        </div>

        {/* pick a seat hint — below top bar, above table/seats */}
        {!isSeated && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center">
            <div className="panel animate-bob px-8 py-3 text-center shadow-cozy-lg">
              <p className="text-lg font-extrabold text-brown">Pick your seat! 🪑</p>
              <p className="text-sm text-brown/70">
                Click an empty chair to sit down.
              </p>
              {seatError && (
                <p className="mt-2 text-sm font-bold text-peach">{seatError}</p>
              )}
            </div>
          </div>
        )}

      {/* Bottom overlay: focus leaderboard (bottom-right) above the timer/chat
          bar. Positioned absolutely so its height — which changes with the timer
          phase and chat expansion — never reflows the room canvas. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col">
        <div className="flex justify-end px-4 pb-2">
          <RoomStudyLeaderboard
            roomId={roomId}
            currentUserId={profile!.userId}
            members={members}
          />
        </div>

        {/* bottom bar: timer left, chat right */}
        <div className="room-bottom-bar pointer-events-auto">
          <FocusTimer
            studyingCount={studyingCount}
            onStatusChange={setStatus}
            onFocusProgress={onFocusProgress}
            onPhaseChange={setTimerPhase}
            onFocusStart={handleFocusStart}
          />
          <RoomChat
            messages={chatMessages}
            onSend={handleSendChat}
            currentUserId={profile!.userId}
            onTypingChange={handleTypingChange}
          />
        </div>
      </div>

      {selectedUserId && (
        <AvatarInteractionModal
          userId={selectedUserId}
          currentUserId={profile!.userId}
          roomId={roomId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
}
