import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import Phaser from "phaser";
import { LibraryScene, type TimerPhase } from "../game/LibraryScene";
import { getDisplayDpi } from "../game/displayDpi";
import { normalizeCapacity } from "../game/roomLayout";
import type { RoomMember, ChatMessage } from "../lib/backend";

export interface PhaserRoomHandle {
  /** Teleport local user to their last assigned seat and sit down to study. */
  beginFocusAtSeat: () => void;
}

interface PhaserRoomProps {
  members: RoomMember[];
  chatMessages: ChatMessage[];
  capacity: number;
  currentUserId: string;
  onSeatClick: (slot: number) => void;
  onAvatarClick?: (userId: string) => void;
  localUserTyping?: boolean;
  timerPhase?: TimerPhase;
  /** Returns the live per-member daily study seconds map; polled at ~10 Hz
   * while anyone is focusing so avatar timers stay in sync with the session. */
  getStudySeconds?: () => Record<string, number>;
}

function setupScene(
  scene: LibraryScene,
  members: RoomMember[],
  chat: ChatMessage[],
  onSeat: (slot: number) => void
) {
  scene.setOnSeatClick(onSeat);
  scene.syncMembers(members);
  scene.syncChat(chat);
}

/** HiDPI canvas sizing — RESIZE mode ignores zoom, so we manage the buffer directly. */
function applyHiDpi(game: Phaser.Game, host: HTMLElement) {
  const dpr = getDisplayDpi();
  const cssW = Math.max(1, Math.floor(host.clientWidth));
  const cssH = Math.max(1, Math.floor(host.clientHeight));
  const bufferW = cssW * dpr;
  const bufferH = cssH * dpr;

  const canvas = game.canvas;
  // Reassigning canvas.width/height resets the WebGL drawing buffer (a one-frame
  // blank that reads as a black flash) and forces a full room rebuild, so only
  // do that when the buffer size genuinely changed. A ResizeObserver can fire
  // without a real size change; skipping those keeps the room perfectly stable.
  const sizeChanged = canvas.width !== bufferW || canvas.height !== bufferH;

  const scale = game.scale;
  scale.setParentSize(cssW, cssH);
  scale.setZoom(1 / dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  if (!sizeChanged) return;

  scale.setGameSize(bufferW, bufferH);
  canvas.width = bufferW;
  canvas.height = bufferH;

  const scene = game.scene.getScene("LibraryScene") as LibraryScene | undefined;
  if (scene?.sys?.isActive()) {
    scene.handleResize();
  }
}

const PhaserRoom = forwardRef<PhaserRoomHandle, PhaserRoomProps>(function PhaserRoom(
  {
    members,
    chatMessages,
    capacity,
    currentUserId,
    onSeatClick,
    onAvatarClick,
    localUserTyping = false,
    timerPhase = "idle",
    getStudySeconds,
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<LibraryScene | null>(null);
  const membersRef = useRef(members);
  const chatRef = useRef(chatMessages);
  const onSeatRef = useRef(onSeatClick);
  const onAvatarClickRef = useRef(onAvatarClick);
  const capacityRef = useRef(capacity);
  const currentUserIdRef = useRef(currentUserId);
  const timerPhaseRef = useRef(timerPhase);
  const getStudySecondsRef = useRef(getStudySeconds);

  membersRef.current = members;
  chatRef.current = chatMessages;
  onSeatRef.current = onSeatClick;
  onAvatarClickRef.current = onAvatarClick;
  capacityRef.current = capacity;
  currentUserIdRef.current = currentUserId;
  timerPhaseRef.current = timerPhase;
  getStudySecondsRef.current = getStudySeconds;

  useImperativeHandle(ref, () => ({
    beginFocusAtSeat: () => {
      sceneRef.current?.beginFocusAtSeat();
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const cssW = Math.max(1, Math.floor(host.clientWidth || window.innerWidth));
    const cssH = Math.max(
      1,
      Math.floor(host.clientHeight || window.innerHeight - 100)
    );
    const dpr = getDisplayDpi();

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      backgroundColor: "#faf0e4",
      width: cssW * dpr,
      height: cssH * dpr,
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
        zoom: 1 / dpr,
      },
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false,
        powerPreference: "high-performance",
      },
      // NOTE: the scene is intentionally NOT declared here. Declaring it in the
      // config makes Phaser auto-start it immediately with no init data, so it
      // boots with capacity=4 (square table) and an empty currentUserId. We add
      // and start it exactly once below, with the real data, to avoid that race.
    });
    applyHiDpi(game, host);
    gameRef.current = game;

    const onResize = () => applyHiDpi(game, host);
    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    window.addEventListener("resize", onResize);

    const boot = () => {
      // Add the scene without auto-starting, then start it once with the real
      // capacity + user id read from refs (never a stale closure value).
      const scene = game.scene.add("LibraryScene", LibraryScene, false) as LibraryScene;
      sceneRef.current = scene;

      // Avatar clicks bubble up from the scene; read the handler from a ref so
      // it never goes stale (matches the seat-click pattern above).
      scene.events.on("avatarClicked", (userId: string) => {
        onAvatarClickRef.current?.(userId);
      });

      // Feed live per-character daily study seconds to the scene's timers.
      scene.setStudySecondsProvider(() => getStudySecondsRef.current?.() ?? {});

      scene.events.on("ready", () => {
        const ready = sceneRef.current;
        if (!ready) return;
        // Safety net: if the scene somehow initialised with a different
        // capacity than the current prop, correct it before anything renders.
        if (ready.getCapacity() !== normalizeCapacity(capacityRef.current)) {
          ready.resizeSeats(capacityRef.current);
        }
        ready.setTimerPhase(timerPhaseRef.current);
        setupScene(
          ready,
          membersRef.current,
          chatRef.current,
          (slot) => onSeatRef.current(slot)
        );
      });

      game.scene.start("LibraryScene", {
        capacity: capacityRef.current,
        currentUserId: currentUserIdRef.current,
      });
    };

    game.events.once("ready", boot);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene?.sys?.isActive()) return;
    setupScene(scene, members, chatMessages, (slot) => onSeatRef.current(slot));
  }, [members, chatMessages]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene?.sys?.isActive()) return;
    scene.resizeSeats(capacity);
    scene.syncMembers(membersRef.current);
  }, [capacity]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene?.sys?.isActive()) return;
    scene.setUserTyping(currentUserId, localUserTyping);
  }, [currentUserId, localUserTyping]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene?.sys?.isActive()) return;
    scene.setTimerPhase(timerPhase);
  }, [timerPhase]);

  return (
    <div ref={hostRef} className="phaser-room-host h-full w-full overflow-hidden" />
  );
});

export default memo(PhaserRoom);
