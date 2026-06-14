import Phaser from "phaser";
import type { RoomMember, ChatMessage } from "../lib/mockBackend";
import { getDisplayDpi } from "./displayDpi";
import {
  C,
  drawCozyAtmosphere,
  drawCozyBookshelf,
  drawCozyLamp,
  drawCozyMug,
  drawCozyPlant,
  drawCozyRug,
  drawCreamWalls,
  drawOutlinedCircle,
  drawOutlinedEllipse,
  drawOutlinedRect,
  drawRoomBackdrop,
  drawRoomFrame,
  drawWarmGlow,
  drawWoodFloor,
  r,
} from "./drawCozyRoom";
import {
  createFrogAvatar,
  drawReadingBook,
  drawSpeechBubble,
  drawTypingBubble,
  FROG_TEXTURE_KEY,
  FROG_TEXTURE_PATH,
  READING_BOOK_Y,
} from "./drawFrogAvatar";
import { NavGrid, buildRoomObstacles } from "./pathfinding";
import {
  ellipseRadiusAtAngle,
  FURNITURE_SCALE,
  getCampfireLayout,
  getFurniturePlan,
  getRoomSize,
  isCampfireSeatSlot,
  pondFishCount,
  getStudyPlacement,
  getTableLayout,
  L,
  maxRoomScale,
  normalizeCapacity,
  PLANT_SPOTS,
  RIGHT_SHELVES,
  studyCenter,
  TOP_SHELVES,
  type TableLayout,
} from "./roomLayout";

export type TimerPhase = "idle" | "work" | "break" | "paused" | "stopped";

/**
 * Base stroll pace for WASD and ambient wander (px/sec).
 * Click-to-move pathfinding uses NAV_WALK_SPEED (~20% faster).
 */
const WALK_SPEED = 92;
const NAV_WALK_SPEED = 110;

/** How often to refresh avatar study timers while a focus session is active. */
const STUDY_TIMER_TICK_MS = 100;

/** Avatars sit above all furniture; per-avatar depth grows with y so lower
 * (nearer) characters draw in front and none vanish behind decor. */
const AVATAR_BASE_DEPTH = 10;

/** Up-scale for the frog avatar (frog + held book + name label) so the
 * character reads clearly at the room's fit-zoom; matches FURNITURE_SCALE. */
const AVATAR_SCALE = 1.7;

/** How far the frog settles down onto a chair when seated. */
const SIT_SINK = 7;

/** Walkable floor stops at this fraction of room height, keeping avatars above
 * the screen region the camera reserves for the bottom timer/chat bar. */
const FLOOR_WALK_BOTTOM = 0.9;

/** True when the focused element is a text field that should own keystrokes. */
function isEditableTarget(el: EventTarget | Element | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
}

/** Full sunrise→day→sunset→night loop duration: one cycle every 30 minutes.
 * Everything keyed off `todT` (sky gradient, sun/moon position, star fade,
 * interior tint) advances proportionally, so it all just runs slower. */
const DAY_CYCLE_MS = 1800000;

type WeatherKind = "clear" | "rain" | "snow" | "fog";

interface WindowGlass {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LightSpot {
  x: number;
  y: number;
  radius: number;
  color: number;
  /** Always-on glow plus the extra that fades in as it gets dark. */
  base: number;
  night: number;
}

interface SkyState {
  top: number;
  bottom: number;
  tintColor: number;
  tintAlpha: number;
  /** 0 (bright day) → 1 (full night): drives interior lamplight + tint. */
  night: number;
  /** Star visibility — only non-zero while the moon is up (night). */
  star: number;
  body: { nx: number; ny: number; color: number; moon: boolean };
}

/** Time-of-day keyframes in cycle order; the sky lerps between neighbours. */
const SKY_KEYS: Omit<SkyState, "body" | "star">[] = [
  { top: 0xf6c79c, bottom: 0xf3a6a0, tintColor: 0xffdcab, tintAlpha: 0.16, night: 0.12 }, // sunrise
  { top: 0x7fb8ee, bottom: 0xd2ecff, tintColor: 0xffffff, tintAlpha: 0.0, night: 0.0 }, // day
  { top: 0xf2965a, bottom: 0x9a5a93, tintColor: 0xffb070, tintAlpha: 0.22, night: 0.18 }, // sunset
  { top: 0x0e1430, bottom: 0x232a4d, tintColor: 0x141b3c, tintAlpha: 0.5, night: 1.0 }, // night
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  return (
    (Math.round(lerp(r1, r2, t)) << 16) |
    (Math.round(lerp(g1, g2, t)) << 8) |
    Math.round(lerp(b1, b2, t))
  );
}

/** Stable pseudo-random in [0,1) for procedural stars/precipitation. */
function pseudo(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Stopwatch format for the daily study timer: `0:05`, `12:34`, `1:02:03`. */
function formatStudyStopwatch(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const ss = String(secs).padStart(2, "0");
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, "0")}:${ss}`;
  return `${mins}:${ss}`;
}

interface AvatarView {
  container: Phaser.GameObjects.Container;
  frog: Phaser.GameObjects.Image;
  book: Phaser.GameObjects.Graphics;
  status: string;
  deskSlot: number;
  bubble: Phaser.GameObjects.Container | null;
  bubbleType: "typing" | "message" | null;
  breakIcon: Phaser.GameObjects.Text | null;
  /** Live daily study-time stopwatch floating above the character. */
  timerLabel: Phaser.GameObjects.Text;
  /** Vertical sit offset that biases the frog up (facing away/up) or down
   * (facing toward the viewer) per the seat's direction to the table. */
  seatFaceDY: number;
  /** Looping body animation (idle breath, walk hop, or reading bob). */
  animTween: Phaser.Tweens.Tween | null;
  animKind: "none" | "idle" | "walk" | "study";
  /** Rest-pose scale/position captured at build time so loops never drift. */
  baseScale: number;
  frogBaseY: number;
  walkTween: Phaser.Tweens.Tween | null;
  isLocal: boolean;
  isSeated: boolean;
}

interface BubbleView {
  container: Phaser.GameObjects.Container;
  expiresAt: number;
  userId: string;
}

interface PondFish {
  gfx: Phaser.GameObjects.Graphics;
  originX: number;
  originY: number;
  pathRx: number;
  pathRy: number;
  angle: number;
  speed: number;
  hue: number;
  lastFlip: boolean;
}

interface PondSeaweed {
  gfx: Phaser.GameObjects.Graphics;
  bx: number;
  by: number;
  height: number;
  lean: number;
  phase: number;
  swaySpeed: number;
}

function inPondEllipse(px: number, py: number, rx: number, ry: number, inset = 0.9): boolean {
  const nx = px / (rx * inset);
  const ny = py / (ry * inset);
  return nx * nx + ny * ny <= 1;
}

type TableMetrics = TableLayout;

export class LibraryScene extends Phaser.Scene {
  private avatars = new Map<string, AvatarView>();
  private seatZones: Phaser.GameObjects.Zone[] = [];
  private seatPositions: { x: number; y: number; angle: number }[] = [];
  private seatGraphics: Phaser.GameObjects.Graphics[] = [];
  private bubbles = new Map<string, BubbleView>();
  private capacity = 4;
  private myUserId = "";
  private membersCache: RoomMember[] = [];
  private onSeatClick: ((slot: number) => void) | null = null;
  private tableGfx: Phaser.GameObjects.Graphics | null = null;
  private studyRugGfx: Phaser.GameObjects.Graphics | null = null;
  private centerX = 0;
  private centerY = 0;
  private roomW = 0;
  private roomH = 0;
  private timerPhase: TimerPhase = "idle";
  private floorZone: Phaser.GameObjects.Zone | null = null;
  private navGrid: NavGrid | null = null;
  private wanderTimer: Phaser.Time.TimerEvent | null = null;
  private keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  } | null = null;
  private localFreePosition = false;
  private localWasdMoving = false;
  private movementEnabled = true;
  private onDomFocusIn: ((e: FocusEvent) => void) | null = null;
  private onDomFocusOut: (() => void) | null = null;

  // Ambiance: time-of-day, weather, dynamic windows and interior lighting.
  private ambientClock = 0;
  private todT = 0.12;
  private weather: WeatherKind = "clear";
  private weatherStrength = 0;
  private nextWeatherChangeAt = 0;
  private windows: WindowGlass[] = [];
  private lightSpots: LightSpot[] = [];
  private windowLayer: Phaser.GameObjects.Graphics | null = null;
  private frameLayer: Phaser.GameObjects.Graphics | null = null;
  private bodyLayer: Phaser.GameObjects.Graphics | null = null;
  private bodyMaskGfx: Phaser.GameObjects.Graphics | null = null;
  private tintLayer: Phaser.GameObjects.Graphics | null = null;
  private lightLayer: Phaser.GameObjects.Graphics | null = null;
  private studySecondsProvider: (() => Record<string, number>) | null = null;
  private studyTimerAccum = 0;
  private ambianceRedrawAccum = 0;
  private lastAmbianceKey = "";
  private pondAnimAccum = 0;

  private campfireCenter = { x: 0, y: 0 };
  private pondFish: PondFish[] = [];
  private pondSeaweed: PondSeaweed[] = [];

  constructor() {
    super("LibraryScene");
  }

  preload() {
    this.load.image(FROG_TEXTURE_KEY, FROG_TEXTURE_PATH);
  }

  init(data: { capacity?: number; currentUserId?: string }) {
    this.capacity = normalizeCapacity(data.capacity ?? 4);
    this.myUserId = data.currentUserId ?? "";
    this.onSeatClick = null;
    this.avatars.clear();
    this.seatZones = [];
    this.seatPositions = [];
    this.seatGraphics = [];
    this.bubbles.clear();
    this.tableGfx = null;
    this.studyRugGfx = null;
    this.roomW = 0;
    this.roomH = 0;
    this.timerPhase = "idle";
    this.floorZone = null;
    this.navGrid = null;
    this.wanderTimer = null;
    this.keys = null;
    this.localFreePosition = false;
    this.localWasdMoving = false;
    this.movementEnabled = true;
    this.onDomFocusIn = null;
    this.onDomFocusOut = null;
    this.ambientClock = 0;
    this.todT = 0.12;
    this.weather = "clear";
    this.weatherStrength = 0;
    this.nextWeatherChangeAt = 0;
    this.windows = [];
    this.lightSpots = [];
    this.windowLayer = null;
    this.frameLayer = null;
    this.bodyLayer = null;
    this.bodyMaskGfx = null;
    this.tintLayer = null;
    this.lightLayer = null;
    // NOTE: studySecondsProvider is wired in by the host (PhaserRoom) BEFORE the
    // scene starts, so init() must NOT clear it. Avatar timers refresh from it
    // at ~10 Hz while anyone is studying (see update()).
  }

  create() {
    this.cameras.main.setRoundPixels(true);
    this.buildRoom();
    this.setupKeyboard();
    this.events.emit("ready");
  }

  /** Receive the live per-member daily study-seconds provider from the host. */
  setStudySecondsProvider(provider: () => Record<string, number>) {
    this.studySecondsProvider = provider;
    this.updateStudyTimers();
  }

  /** Refresh every avatar's floating stopwatch: white while studying, grey
   * otherwise; text is today's saved + in-progress study time. */
  private updateStudyTimers() {
    const seconds = this.studySecondsProvider?.() ?? {};
    for (const [userId, view] of this.avatars) {
      const member = this.membersCache.find((m) => m.userId === userId);
      const studying = member?.status === "studying";
      view.timerLabel.setText(formatStudyStopwatch(seconds[userId] ?? 0));
      view.timerLabel.setColor(studying ? "#ffffff" : "#9a8f80");
    }
  }

  /** Capacity-scaled room rect, centered in the canvas. */
  private layoutRoom() {
    const { width, height } = this.scale;
    const size = getRoomSize(this.capacity, width, height);
    this.roomW = size.w;
    this.roomH = size.h;
    const center = studyCenter(this.capacity, this.roomW, this.roomH);
    this.centerX = r(center.x);
    this.centerY = r(center.y);
  }

  /** Draw the whole room: backdrop, decor, table, seats, nav grid, framing. */
  private buildRoom() {
    this.layoutRoom();
    this.windows = [];
    this.lightSpots = [];
    this.drawLibrary(this.roomW, this.roomH);
    this.buildTableAndSeats(this.roomW, this.roomH);
    this.buildCampfireSeats(this.roomW, this.roomH);
    this.buildNavGrid(this.roomW, this.roomH);
    this.setupMovement(this.roomW, this.roomH);
    this.setupAmbiance();
    this.applyRoomFraming();
  }

  /** Tear down room visuals/zones so the room can be rebuilt at a new size. */
  private destroyRoomObjects() {
    const staticDecor = this.children.list.filter(
      (child) => "depth" in child && (child as { depth: number }).depth < 10
    );
    staticDecor.forEach((child) => child.destroy());

    this.seatZones.forEach((z) => z.destroy());
    this.seatGraphics.forEach((g) => g.destroy());
    this.tableGfx = null;
    this.studyRugGfx = null;
    this.seatZones = [];
    this.seatGraphics = [];
    this.seatPositions = [];
    this.pondFish.forEach((f) => f.gfx.destroy());
    this.pondFish = [];
    this.pondSeaweed.forEach((s) => s.gfx.destroy());
    this.pondSeaweed = [];
    this.floorZone?.destroy();
    this.floorZone = null;
    // These ambiance layers are depth < 10 and were destroyed above; drop the
    // dangling refs so setupAmbiance recreates them on the rebuild. The mask
    // graphics lives off the display list, so destroy it explicitly.
    this.windowLayer = null;
    this.frameLayer = null;
    this.bodyLayer = null;
    this.bodyMaskGfx?.destroy();
    this.bodyMaskGfx = null;
    this.tintLayer = null;
    this.lightLayer = null;
  }

  setOnSeatClick(cb: (slot: number) => void) {
    this.onSeatClick = cb;
  }

  /** Current capacity — lets the host verify the scene initialised correctly. */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Walk the local user to their assigned seat (study chair or campfire stool)
   * and enter the seated studying pose. Idempotent — safe to call from both the
   * focus-start callback and the timer-phase transition.
   */
  beginFocusAtSeat(): void {
    const local = this.avatars.get(this.myUserId);
    const member = this.membersCache.find((m) => m.userId === this.myUserId);
    const slot = member?.deskSlot ?? -1;
    if (!local || slot < 0) return;

    const pos = this.seatPositions[slot];
    if (!pos) return;

    this.localFreePosition = false;
    this.stopLocalWandering();
    local.deskSlot = slot;

    if (local.walkTween) return;

    if (local.isSeated && local.deskSlot === slot) {
      this.applyStatus(local, "studying");
      return;
    }

    const dist = Math.hypot(local.container.x - pos.x, local.container.y - pos.y);
    if (dist < 14) {
      this.seatAvatar(local);
      this.applyStatus(local, "studying");
      return;
    }

    local.isSeated = false;
    this.walkAvatarTo(local, pos.x, pos.y, () => {
      this.localFreePosition = false;
      this.seatAvatar(local);
      this.applyStatus(local, "studying");
    });
  }

  /**
   * Frame the room with a zoom derived from the LARGEST possible room, not the
   * current one. This is the key to capacity-based sizing actually showing on
   * screen: a fixed zoom means a small (1-person) room genuinely renders small
   * and cozy while an 8-person room fills the frame. The biggest room just fits
   * the available band (margins reserved for the top HUD and bottom timer/chat
   * bar), so every room — and the whole walkable floor — stays fully visible.
   *
   * NOTE: Phaser scales the camera around its CENTRE, not its top-left, so we
   * centre horizontally with centerOn (which is zoom-aware) and then nudge the
   * view vertically into the band between the HUD bars. A hand-rolled setScroll
   * that assumes a top-left pivot pushes the room off to one side at zoom != 1.
   */
  private applyRoomFraming() {
    const cam = this.cameras.main;
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const topReserve = viewH * 0.05;
    const bottomReserve = viewH * 0.22;
    const availH = viewH - topReserve - bottomReserve;
    const availW = viewW * 0.94;
    const maxScale = maxRoomScale();
    const zoom = Math.min(availW / (viewW * maxScale), availH / (viewH * maxScale));
    cam.setZoom(zoom);
    cam.centerOn(this.roomW / 2, this.roomH / 2);
    // Shift the framed room up so it sits centred within the reserved band
    // rather than the full viewport (bottom bar is taller than the top HUD).
    const centerScreenY = topReserve + availH / 2;
    cam.scrollY += (viewH / 2 - centerScreenY) / zoom;
  }

  setTimerPhase(phase: TimerPhase) {
    const prev = this.timerPhase;
    this.timerPhase = phase;
    const local = this.avatars.get(this.myUserId);
    const member = this.membersCache.find((m) => m.userId === this.myUserId);
    const hasSeat = (member?.deskSlot ?? -1) >= 0;

    if (phase === "work") {
      this.localFreePosition = false;
      this.stopLocalWandering();
      if (prev !== "work") {
        this.beginFocusAtSeat();
      } else if (local && hasSeat) {
        this.applyStatus(local, "studying");
      }
    } else if (phase === "idle" && hasSeat) {
      // Pre-focus with a seat — stay seated, do not roam
      this.localFreePosition = false;
      this.stopLocalWandering();
      if (local) {
        if (!local.isSeated && !local.walkTween) {
          this.beginFocusAtSeat();
        } else {
          this.applyStatus(local, member?.status ?? "idle");
        }
      }
    } else {
      // break, paused, stopped, or pre-focus without a seat — roam freely
      this.localFreePosition = true;
      if (local) {
        local.isSeated = false;
        local.walkTween?.stop();
        local.walkTween = null;
        const status =
          phase === "break" ? "break" : member?.status ?? "idle";
        this.applyStatus(local, status);
      }
      if (prev === "work" || !this.wanderTimer) {
        this.startLocalWandering();
      }
    }

    this.membersCache.forEach((m) => {
      const view = this.avatars.get(m.userId);
      if (view && m.userId !== this.myUserId) {
        this.applyStatus(view, m.status);
      }
    });
  }

  handleResize() {
    this.destroyRoomObjects();
    this.buildRoom();
    this.syncMembers(this.membersCache);
    if (this.localFreePosition) {
      this.startLocalWandering();
    }
  }

  private buildNavGrid(w: number, h: number) {
    const metrics = this.getTableMetrics(w);
    const tableObstacle =
      metrics.shape === "round"
        ? { shape: "round" as const, outerW: metrics.outerW, outerH: metrics.outerH }
        : { shape: "rect" as const, tw: metrics.tw, th: metrics.th };

    this.navGrid = new NavGrid({
      width: w,
      height: h,
      cellSize: 18,
      floorTop: h * L.floorTop,
      // Keep the walkable floor above the screen band reserved for the bottom
      // HUD bar so a character can never path to a spot that isn't on screen.
      floorBottom: h * FLOOR_WALK_BOTTOM,
      obstacles: buildRoomObstacles(
        w,
        h,
        this.centerX,
        this.centerY,
        tableObstacle,
        getFurniturePlan(this.capacity)
      ),
    });
  }

  private startLocalWandering() {
    if (!this.localFreePosition) return;
    this.stopLocalWandering();
    this.scheduleNextWander(800);
  }

  private stopLocalWandering() {
    this.wanderTimer?.remove();
    this.wanderTimer = null;
  }

  private scheduleNextWander(delayMs: number) {
    this.wanderTimer?.remove();
    this.wanderTimer = this.time.delayedCall(delayMs, () => {
      if (!this.localFreePosition) return;
      const local = this.avatars.get(this.myUserId);
      if (!local || local.walkTween) {
        this.scheduleNextWander(1500);
        return;
      }
      const dest = this.navGrid?.findRandomWalkable(
        local.container.x,
        local.container.y,
        50
      );
      if (dest) {
        this.walkAvatarTo(local, dest.x, dest.y, () => {
          this.scheduleNextWander(2000 + Math.random() * 3000);
        }, WALK_SPEED);
      } else {
        this.scheduleNextWander(2000);
      }
    });
  }

  private walkAvatarTo(
    view: AvatarView,
    tx: number,
    ty: number,
    onComplete?: () => void,
    speed = NAV_WALK_SPEED
  ) {
    view.walkTween?.stop();
    view.walkTween = null;
    view.isSeated = false;
    if (view.isLocal) this.localWasdMoving = false;
    // Leaving the seat: drop the seated lean/offset so the frog walks upright.
    view.frog.setRotation(0);
    view.seatFaceDY = 0;

    const sx = view.container.x;
    const sy = view.container.y;
    const path = this.navGrid?.findPath(sx, sy, tx, ty) ?? [];

    if (path.length === 0) {
      const near = this.navGrid?.findNearestWalkable(tx, ty);
      if (near) {
        view.container.setPosition(near.x, near.y);
      }
      this.updateAvatarDepth(view);
      onComplete?.();
      this.refreshFrogMotion(view);
      return;
    }

    // Build one smooth Catmull-Rom curve through the start + path nodes and
    // follow it with a single eased tween, so motion flows continuously with
    // gentle acceleration/deceleration instead of stuttering corner-to-corner.
    const points = [new Phaser.Math.Vector2(sx, sy)];
    for (const p of path) {
      const last = points[points.length - 1];
      if (Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) {
        points.push(new Phaser.Math.Vector2(p.x, p.y));
      }
    }
    if (points.length < 2) {
      view.container.setPosition(tx, ty);
      this.updateAvatarDepth(view);
      onComplete?.();
      this.refreshFrogMotion(view);
      return;
    }

    const curve = new Phaser.Curves.Spline(points);
    const length = curve.getLength();
    const duration = Math.max(160, (length / speed) * 1000);

    this.playFrogAnim(view, "walk");

    // Constant walking pace: tween a normalized progress LINEARLY and sample the
    // curve by ARC LENGTH (getPointAt), so on-screen speed is steady the whole
    // way — no easing spikes and no fast segments from non-uniform spline params.
    const follower = { u: 0 };
    const out = new Phaser.Math.Vector2();
    let prevX = sx;
    view.walkTween = this.tweens.add({
      targets: follower,
      u: 1,
      duration,
      ease: "Linear",
      onUpdate: () => {
        curve.getPointAt(follower.u, out);
        view.container.setPosition(out.x, out.y);
        this.updateFacing(view, out.x - prevX);
        prevX = out.x;
        this.updateAvatarDepth(view);
      },
      onComplete: () => {
        view.walkTween = null;
        onComplete?.();
        this.refreshFrogMotion(view);
      },
    });
  }

  /** Mirror the frog to face its horizontal travel direction (with a deadzone). */
  private updateFacing(view: AvatarView, dx: number) {
    if (dx > 0.3) view.frog.setFlipX(false);
    else if (dx < -0.3) view.frog.setFlipX(true);
  }

  /** Lower (nearer) avatars draw in front; keeps everyone above the furniture. */
  private updateAvatarDepth(view: AvatarView) {
    view.container.setDepth(AVATAR_BASE_DEPTH + view.container.y * 0.01);
  }

  /** Snap an arrived avatar onto its chair: align to the seat, face the table. */
  private seatAvatar(view: AvatarView) {
    view.walkTween?.stop();
    view.walkTween = null;
    if (view.isLocal) this.localWasdMoving = false;
    const pos = this.seatPositions[view.deskSlot];
    if (pos) view.container.setPosition(pos.x, pos.y);
    view.isSeated = true;
    this.faceSeat(view);
    this.updateAvatarDepth(view);
    // Force the rest pose to re-evaluate so the seated sink applies even when
    // the looping animation kind is unchanged (playFrogAnim early-returns).
    view.animKind = "none";
    this.refreshFrogMotion(view);
  }

  /**
   * Orient a seated frog toward the table from the seat's position: flipX for
   * left/right, a capped body lean for the diagonal, and a small vertical sit
   * offset so seats below the table read as facing up/away and seats above read
   * as facing down toward the table. Works for all seats at every capacity.
   */
  private faceSeat(view: AvatarView) {
    const pos = this.seatPositions[view.deskSlot];
    if (!pos) return;

    if (isCampfireSeatSlot(view.deskSlot, this.capacity)) {
      const dx = this.campfireCenter.x - pos.x;
      const dy = this.campfireCenter.y - pos.y;
      if (Math.abs(dx) > 2) view.frog.setFlipX(dx < 0);
      view.frog.setRotation(Phaser.Math.Clamp(dx / 260, -0.16, 0.16));
      view.seatFaceDY = Phaser.Math.Clamp(dy / 14, -6, 6);
      return;
    }

    const dx = this.centerX - pos.x; // toward the table, horizontally
    const dy = this.centerY - pos.y; // toward the table, vertically
    if (Math.abs(dx) > 2) view.frog.setFlipX(dx < 0);
    // Lean the body toward the table (top tilts toward the table side): table to
    // the right (dx>0) → lean right (positive/CW); table to the left → lean left.
    view.frog.setRotation(Phaser.Math.Clamp(dx / 260, -0.16, 0.16));
    // Seat below the table (dy<0, table above) faces up/away → sit a touch
    // higher; seat above the table (dy>0) faces down → sit slightly lower.
    view.seatFaceDY = Phaser.Math.Clamp(dy / 14, -6, 6);
  }

  private setupKeyboard() {
    const kb = this.input.keyboard;
    if (!kb) return;
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // While a text field (room chat, etc.) is focused, release the WASD capture
    // so keystrokes reach the input and the avatar stays put; restore on blur.
    this.onDomFocusIn = (e: FocusEvent) => {
      if (isEditableTarget(e.target)) this.setMovementCaptureEnabled(false);
    };
    this.onDomFocusOut = () => {
      if (!isEditableTarget(document.activeElement)) {
        this.setMovementCaptureEnabled(true);
      }
    };
    window.addEventListener("focusin", this.onDomFocusIn);
    window.addEventListener("focusout", this.onDomFocusOut);
    if (isEditableTarget(document.activeElement)) {
      this.setMovementCaptureEnabled(false);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardownKeyboard, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardownKeyboard, this);
  }

  private teardownKeyboard() {
    if (this.onDomFocusIn) window.removeEventListener("focusin", this.onDomFocusIn);
    if (this.onDomFocusOut) window.removeEventListener("focusout", this.onDomFocusOut);
    this.onDomFocusIn = null;
    this.onDomFocusOut = null;
  }

  /** Toggle movement-key capture so inputs can claim WASD while focused. */
  private setMovementCaptureEnabled(enabled: boolean) {
    this.movementEnabled = enabled;
    const kb = this.input.keyboard;
    if (!kb) return;
    if (enabled) {
      kb.addCapture("W,A,S,D");
    } else {
      kb.removeCapture("W,A,S,D");
      if (this.localWasdMoving) {
        this.localWasdMoving = false;
        const local = this.avatars.get(this.myUserId);
        if (local) this.refreshFrogMotion(local);
      }
    }
  }

  private setupMovement(w: number, h: number) {
    // Click target matches the walkable floor (top of floor → reserved bottom).
    const top = h * L.floorTop;
    const bottom = h * FLOOR_WALK_BOTTOM;
    this.floorZone = this.add
      .zone(w * 0.5, (top + bottom) / 2, w * 0.86, bottom - top)
      .setInteractive({ useHandCursor: true })
      .setDepth(1);

    this.floorZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.localFreePosition) return;
      this.walkLocalUserTo(pointer.worldX, pointer.worldY);
    });
  }

  update(_time: number, delta: number) {
    this.advanceAmbiance(delta);
    this.updatePondLife(delta);

    if (this.membersCache.some((m) => m.status === "studying")) {
      this.studyTimerAccum += delta;
      if (this.studyTimerAccum >= STUDY_TIMER_TICK_MS) {
        this.studyTimerAccum = 0;
        this.updateStudyTimers();
      }
    } else {
      this.studyTimerAccum = 0;
    }

    if (!this.localFreePosition || !this.keys || !this.movementEnabled) return;
    const local = this.avatars.get(this.myUserId);
    if (!local || local.walkTween) return;

    // Same real-world pace as the walk tweens: WALK_SPEED px/sec converted to
    // px/frame via delta time, so WASD matches regardless of frame rate.
    const speed = WALK_SPEED * (delta / 1000);
    let dx = 0;
    let dy = 0;
    if (this.keys.W.isDown) dy -= speed;
    if (this.keys.S.isDown) dy += speed;
    if (this.keys.A.isDown) dx -= speed;
    if (this.keys.D.isDown) dx += speed;

    if (dx === 0 && dy === 0) {
      if (this.localWasdMoving) {
        this.localWasdMoving = false;
        this.refreshFrogMotion(local);
      }
      return;
    }

    if (!this.localWasdMoving) {
      this.localWasdMoving = true;
      this.refreshFrogMotion(local);
    }

    this.stopLocalWandering();
    const nx = local.container.x + dx;
    const ny = local.container.y + dy;
    if (this.navGrid?.isWalkableWorld(nx, ny)) {
      local.container.setPosition(nx, ny);
      local.isSeated = false;
    } else {
      const altX = this.navGrid?.isWalkableWorld(nx, local.container.y);
      const altY = this.navGrid?.isWalkableWorld(local.container.x, ny);
      if (altX) local.container.setPosition(nx, local.container.y);
      else if (altY) local.container.setPosition(local.container.x, ny);
    }
    this.updateFacing(local, dx);
    this.updateAvatarDepth(local);
  }

  private walkLocalUserTo(x: number, y: number) {
    const local = this.avatars.get(this.myUserId);
    if (!local || !this.localFreePosition) return;

    this.stopLocalWandering();
    this.walkAvatarTo(local, x, y, () => {
      this.scheduleNextWander(2500 + Math.random() * 2000);
    });
  }

  private walkLocalUserToSeat(slot: number) {
    const local = this.avatars.get(this.myUserId);
    const pos = this.seatPositions[slot];
    if (!local || !pos) return;

    this.stopLocalWandering();
    this.walkAvatarTo(local, pos.x, pos.y, () => {
      local.deskSlot = slot;
      this.localFreePosition = false;
      this.stopLocalWandering();
      this.seatAvatar(local);
      const member = this.membersCache.find((m) => m.userId === this.myUserId);
      this.applyStatus(
        local,
        this.timerPhase === "work" ? "studying" : member?.status ?? "idle"
      );
    });
  }

  private handleLocalSeatSelected(slot: number) {
    if (this.isSeatTaken(slot)) return;

    let local = this.avatars.get(this.myUserId);
    const member = this.membersCache.find((m) => m.userId === this.myUserId);
    if (!member) return;

    const pos = this.seatPositions[slot];
    if (!pos) return;

    this.stopLocalWandering();
    if (!local) {
      const spawn =
        this.navGrid?.findRandomWalkable(pos.x, pos.y, 40) ??
        { x: this.centerX, y: this.centerY };
      local = this.buildAvatar({ ...member, deskSlot: slot }, spawn.x, spawn.y);
      this.avatars.set(this.myUserId, local);
    } else {
      local.deskSlot = slot;
      local.isSeated = false;
    }

    this.walkLocalUserToSeat(slot);
  }

  private drawLibrary(w: number, h: number) {
    const plan = getFurniturePlan(this.capacity);

    drawRoomBackdrop(this, w, h, this.scale.width, this.scale.height);
    this.drawHerringboneFloor(w, h);
    this.drawWalls(w, h);
    drawRoomFrame(this, w, h);
    this.drawRunnerRugs(w, h);
    if (plan.loungeRug) this.drawLoungeRug(w, h);
    if (plan.pond) this.drawPond(w, h, plan.pondScale);
    this.drawArchedWindows(w, h);
    this.drawWallDecor(w, h);
    this.drawBookshelves(w, h);
    if (plan.campfire) {
      const layout = getCampfireLayout(
        w,
        h,
        plan.campfireChairs,
        plan.campfireScale
      );
      this.campfireCenter = { x: layout.fireX, y: layout.fireY };
      this.drawCampfire(layout.fireX, layout.fireY, plan.campfireScale);
    }
    if (plan.floorLamp) this.drawFloorLamp(w * L.floorLampX, h * L.floorLampY);
    this.drawPlants(w, h);
    this.drawAtmosphere(w, h);
  }

  private drawHerringboneFloor(w: number, h: number) {
    drawWoodFloor(this, w, h, h * L.floorTop);
  }

  private drawWalls(w: number, h: number) {
    drawCreamWalls(this, w, h * L.floorTop);
  }

  private drawLoungeRug(w: number, h: number) {
    const rug = this.add.graphics().setDepth(1);
    drawCozyRug(
      rug,
      w * L.loungeRugCx,
      h * L.loungeRugCy,
      w * L.loungeRugW,
      h * L.loungeRugH,
      C.rugCream,
      C.rugCreamBorder,
      true
    );
  }

  /** Stone-ring campfire with logs, flames and a warm night glow. */
  private drawCampfire(x: number, y: number, fireScale: number) {
    const s = FURNITURE_SCALE * fireScale;
    const g = this.add.graphics().setDepth(2);
    g.setPosition(x, y).setScale(s);

    const stoneCount = fireScale < 0.9 ? 8 : fireScale < 1.1 ? 10 : 12;
    const ringR = 34;
    for (let i = 0; i < stoneCount; i++) {
      const a = (Math.PI * 2 * i) / stoneCount;
      const sx = Math.cos(a) * ringR;
      const sy = Math.sin(a) * (ringR * 0.76);
      drawOutlinedEllipse(g, sx, sy, 14, 11, C.creamDark, C.outlineSoft, 2);
    }
    drawOutlinedEllipse(g, 0, 8, 30, 22, C.woodDark, C.outline, 2);
    drawOutlinedEllipse(g, -8, 6, 22, 9, C.woodMid, C.outlineSoft, 1.5);
    drawOutlinedEllipse(g, 8, 6, 20, 9, C.wood, C.outlineSoft, 1.5);

    const flameW = 34 * Math.min(1.2, fireScale);
    const flameH = 24 * Math.min(1.15, fireScale);
    drawOutlinedEllipse(g, 0, -2, flameW, flameH, C.fireCore, C.outline, 2);
    drawOutlinedEllipse(g, -10, -4, 14, 18, C.fire, C.outlineSoft, 1.5);
    drawOutlinedEllipse(g, 10, -4, 14, 18, C.fire, C.outlineSoft, 1.5);
    drawOutlinedEllipse(g, 0, -10, 12, 20, C.candle, C.outlineSoft, 1.5);

    this.lightSpots.push({
      x,
      y: y - 4 * s,
      radius: 200 * s,
      color: C.warmGlow,
      base: 0.1,
      night: 0.58,
    });
  }

  /** Calm garden pond with opaque water, chunky shore pebbles, lilies and seaweed. */
  private drawPond(w: number, h: number, pondScale: number) {
    const cx = w * L.pondCx;
    const cy = h * L.pondCy;
    const rx = w * 0.13 * pondScale;
    const ry = h * 0.052 * pondScale;
    const g = this.add.graphics().setDepth(1);
    g.setPosition(cx, cy);

    g.fillStyle(0x4a8880, 1);
    g.fillEllipse(0, 0, rx * 2 + 6, ry * 2 + 6);
    g.fillStyle(0x5a9890, 1);
    g.fillEllipse(0, 0, rx * 2, ry * 2);
    g.fillStyle(0x6aaca8, 1);
    g.fillEllipse(0, 0, rx * 2 - 8, ry * 2 - 8);
    g.fillStyle(0x7ab8b0, 1);
    g.fillEllipse(0, 0, rx * 2 - 16, ry * 2 - 16);
    drawOutlinedEllipse(g, 0, 0, rx, ry, 0x6aaca8, C.outlineSoft, 2);
    g.fillStyle(0x98d0c8, 0.45);
    g.fillEllipse(-rx * 0.15, -ry * 0.1, rx * 0.9, ry * 0.55);

    const pebbleScale = 0.92 + pondScale * 0.18;

    const innerCount = Math.floor(40 + pondScale * 24);
    for (let i = 0; i < innerCount; i++) {
      const a = (Math.PI * 2 * i) / innerCount + pseudo(i * 3.7) * 0.18;
      const ring = 1.0 + pseudo(i * 1.9) * 0.06;
      const px = Math.cos(a) * rx * ring;
      const py = Math.sin(a) * ry * ring;
      const pw = (20 + pseudo(i * 2.3) * 18) * pebbleScale;
      const ph = (16 + pseudo(i * 4.1) * 14) * pebbleScale;
      const tone = pseudo(i * 5.5) > 0.45 ? C.creamDark : C.woodLight;
      drawOutlinedEllipse(g, px, py, pw, ph, tone, C.outlineSoft, 2.5);
    }

    const midCount = Math.floor(28 + pondScale * 18);
    for (let i = 0; i < midCount; i++) {
      const a = (Math.PI * 2 * i) / midCount + pseudo(i * 4.9) * 0.22;
      const ring = 1.1 + pseudo(i * 2.1) * 0.08;
      const px = Math.cos(a) * rx * ring;
      const py = Math.sin(a) * ry * ring;
      const pw = (18 + pseudo(i * 3.3) * 16) * pebbleScale;
      const ph = (14 + pseudo(i * 5.7) * 12) * pebbleScale;
      const tone = pseudo(i * 6.1) > 0.5 ? 0xd8c8b0 : C.creamDark;
      drawOutlinedEllipse(g, px, py, pw, ph, tone, C.outlineSoft, 2);
    }

    const outerCount = Math.floor(20 + pondScale * 14);
    for (let i = 0; i < outerCount; i++) {
      const a = (Math.PI * 2 * i) / outerCount + pseudo(i * 5.1) * 0.28;
      const ring = 1.22 + pseudo(i * 2.7) * 0.1;
      const px = Math.cos(a) * rx * ring;
      const py = Math.sin(a) * ry * ring;
      const pw = (16 + pseudo(i * 3.9) * 14) * pebbleScale;
      const ph = (12 + pseudo(i * 6.3) * 11) * pebbleScale;
      drawOutlinedEllipse(g, px, py, pw, ph, C.creamDark, C.outlineSoft, 2);
    }

    const farCount = Math.floor(12 + pondScale * 10);
    for (let i = 0; i < farCount; i++) {
      const a = (Math.PI * 2 * i) / farCount + pseudo(i * 7.3) * 0.35;
      const ring = 1.34 + pseudo(i * 3.5) * 0.08;
      const px = Math.cos(a) * rx * ring;
      const py = Math.sin(a) * ry * ring;
      const pw = (14 + pseudo(i * 4.7) * 10) * pebbleScale;
      const ph = (10 + pseudo(i * 8.1) * 8) * pebbleScale;
      drawOutlinedEllipse(g, px, py, pw, ph, C.woodLight, C.outlineSoft, 1.5);
    }

    for (let i = 0; i < 4; i++) {
      const rippleR = rx * (0.35 + i * 0.12);
      g.lineStyle(1, 0xb8e0d8, 0.25 - i * 0.04);
      g.strokeEllipse(0, ry * 0.05, rippleR, rippleR * (ry / rx) * 0.55);
    }

    const lilyCount = this.capacity <= 2 ? 3 : this.capacity <= 4 ? 4 : 5;
    for (let i = 0; i < lilyCount; i++) {
      const a = pseudo(i * 11.3) * Math.PI * 2;
      const dist = 0.28 + pseudo(i * 7.7) * 0.42;
      const lx = Math.cos(a) * rx * dist;
      const ly = Math.sin(a) * ry * dist;
      if (!inPondEllipse(lx, ly, rx, ry, 0.82)) continue;
      const lw = 14 + pseudo(i * 3.1) * 8;
      const lh = 10 + pseudo(i * 5.9) * 6;
      drawOutlinedEllipse(g, lx, ly, lw, lh, C.plantMint, C.plantDark, 1.5);
      drawOutlinedEllipse(g, lx + 2, ly - 1, lw * 0.35, lh * 0.35, C.sageLight, C.plantDark, 1);
    }

    const benchX = cx - rx * 1.15;
    const benchY = cy + ry * 0.35;
    const bg = this.add.graphics().setDepth(2);
    bg.setPosition(benchX, benchY).setScale(FURNITURE_SCALE);
    drawOutlinedRect(bg, 0, 0, 52, 14, C.wood, C.outline, 6, 2.5);
    drawOutlinedRect(bg, 4, 12, 6, 12, C.woodDark, C.outline, 2, 1.5);
    drawOutlinedRect(bg, 42, 12, 6, 12, C.woodDark, C.outline, 2, 1.5);

    this.spawnPondSeaweed(cx, cy, rx, ry);
    this.spawnPondFish(cx, cy, rx, ry, pondFishCount(this.capacity));
  }

  private spawnPondSeaweed(cx: number, cy: number, rx: number, ry: number) {
    const count = this.capacity <= 2 ? 4 : this.capacity <= 4 ? 6 : 8;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + pseudo(i * 4.3) * 0.5;
      const dist = 0.62 + pseudo(i * 2.9) * 0.18;
      const bx = Math.cos(a) * rx * dist;
      const by = Math.sin(a) * ry * dist;
      if (!inPondEllipse(bx, by, rx, ry, 0.88)) continue;
      const height = ry * (0.45 + pseudo(i * 6.1) * 0.35);
      const topY = by - height;
      if (!inPondEllipse(bx, topY, rx, ry, 0.78)) continue;
      const gfx = this.add.graphics().setDepth(2);
      gfx.setPosition(cx, cy);
      this.pondSeaweed.push({
        gfx,
        bx,
        by,
        height,
        lean: (pseudo(i * 8.7) - 0.5) * 0.4,
        phase: pseudo(i * 3.5) * Math.PI * 2,
        swaySpeed: 0.8 + pseudo(i * 1.7) * 0.6,
      });
    }
  }

  private drawSeaweedStrand(
    g: Phaser.GameObjects.Graphics,
    bx: number,
    by: number,
    height: number,
    lean: number,
    sway: number
  ) {
    g.clear();
    const segments = 5;
    let px = bx;
    let py = by;
    g.lineStyle(3, C.plantDark, 0.75);
    g.beginPath();
    g.moveTo(r(px), r(py));
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const wave = Math.sin(sway + t * 2.4) * 4 * t;
      px = bx + lean * height * t + wave;
      py = by - height * t;
      g.lineTo(r(px), r(py));
    }
    g.strokePath();
    g.lineStyle(2, C.plant, 0.55);
    g.beginPath();
    px = bx;
    py = by;
    g.moveTo(r(px), r(py));
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const wave = Math.sin(sway + t * 2.4 + 0.6) * 3 * t;
      px = bx + lean * height * t * 0.7 + wave;
      py = by - height * t;
      g.lineTo(r(px), r(py));
    }
    g.strokePath();
  }

  private updatePondLife(delta: number) {
    this.pondAnimAccum += delta;
    if (this.pondAnimAccum < 33) return;
    const step = this.pondAnimAccum;
    this.pondAnimAccum = 0;
    this.updatePondFish(step);
    this.updatePondSeaweed(step);
  }

  private updatePondSeaweed(delta: number) {
    for (const weed of this.pondSeaweed) {
      weed.phase += weed.swaySpeed * (delta / 1000);
      this.drawSeaweedStrand(weed.gfx, weed.bx, weed.by, weed.height, weed.lean, weed.phase);
    }
  }

  private spawnPondFish(cx: number, cy: number, rx: number, ry: number, count: number) {
    const hues = [0xf0a060, 0xffb878, 0xe89070, 0xffc8a0];
    for (let i = 0; i < count; i++) {
      const gfx = this.add.graphics().setDepth(2);
      const pathRx = rx * (0.28 + pseudo(i * 2.1) * 0.22);
      const pathRy = ry * (0.35 + pseudo(i * 3.3) * 0.25);
      this.pondFish.push({
        gfx,
        originX: cx,
        originY: cy,
        pathRx,
        pathRy,
        angle: pseudo(i * 7.1) * Math.PI * 2,
        speed: 0.35 + pseudo(i * 4.7) * 0.45,
        hue: hues[i % hues.length],
        lastFlip: false,
      });
    }
  }

  private drawFishShape(g: Phaser.GameObjects.Graphics, hue: number, flip: boolean) {
    g.clear();
    const dir = flip ? -1 : 1;
    g.fillStyle(hue, 1);
    g.fillEllipse(0, 0, 14, 7);
    g.fillTriangle(dir * 8, 0, dir * 14, -4, dir * 14, 4);
    g.lineStyle(1.5, C.outlineSoft, 0.8);
    g.strokeEllipse(0, 0, 14, 7);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(dir * 4, -1.5, 1.5);
  }

  private updatePondFish(delta: number) {
    for (const fish of this.pondFish) {
      fish.angle += fish.speed * (delta / 1000);
      const x = fish.originX + Math.cos(fish.angle) * fish.pathRx;
      const y = fish.originY + Math.sin(fish.angle * 0.85) * fish.pathRy;
      const flip = Math.cos(fish.angle + 0.4) < 0;
      fish.gfx.setPosition(x, y);
      if (flip !== fish.lastFlip) {
        fish.lastFlip = flip;
        this.drawFishShape(fish.gfx, fish.hue, flip);
      }
    }
  }

  /**
   * Runner rug from the windows down toward the study zone.
   */
  private drawRunnerRugs(w: number, h: number) {
    const rug = this.add.graphics().setDepth(1);
    drawCozyRug(rug, w * 0.5, h * 0.34, w * 0.14, h * 0.24, C.rugCream, C.rugCreamBorder, false);
  }

  /**
   * Three grand windows fill the back wall. Only their glass geometry is
   * recorded here; the wood frame, the live sky (time-of-day), and weather are
   * painted every frame on the dynamic window layer (see renderWindows).
   */
  private drawArchedWindows(w: number, h: number) {
    const gw = w * 0.135;
    const gh = h * 0.15;
    const top = h * 0.045;
    this.windows = [0.33, 0.5, 0.67].map((cx) => ({
      x: w * cx - gw / 2,
      y: top,
      w: gw,
      h: gh,
    }));
  }

  private drawWallDecor(w: number, h: number) {
    // Clock hangs in the clear wall gap left of the first window; sconces sit
    // symmetrically in the two gaps between the three windows.
    const clockX = w * 0.25;
    const clockY = h * 0.1;
    const clock = this.add.graphics().setDepth(2);
    drawOutlinedCircle(clock, clockX, clockY, 13, C.pink, C.outline, 3);
    drawOutlinedCircle(clock, clockX, clockY, 9, C.cream, C.outline, 2);
    clock.lineStyle(2, C.outline, 1);
    clock.lineBetween(r(clockX), r(clockY), r(clockX), r(clockY - 6));
    clock.lineBetween(r(clockX), r(clockY), r(clockX + 4), r(clockY + 2));

    // Wall sconces ring the room: two in the gaps between the back-wall windows
    // and two down the right wall by the bookshelves, so warm light wraps the
    // whole space (the fireplace + study lamp cover the left and centre).
    [
      { x: 0.415, y: 0.11 },
      { x: 0.585, y: 0.11 },
      { x: 0.875, y: 0.42 },
      { x: 0.875, y: 0.68 },
    ].forEach(({ x, y }) => this.drawWallSconce(w * x, h * y));

    const vine = this.add.graphics().setDepth(2);
    drawOutlinedRect(vine, w * 0.035 - 8, h * 0.1, 16, 12, C.potBlue, C.outline, 5, 2);
    drawOutlinedCircle(vine, w * 0.035 - 4, h * 0.08, 6, C.plantMint, C.plantDark, 1.5);
    drawOutlinedCircle(vine, w * 0.035 + 3, h * 0.06, 5, C.plant, C.plantDark, 1.5);
    drawOutlinedCircle(vine, w * 0.035, h * 0.03, 7, C.plantMint, C.plantDark, 1.5);
    drawOutlinedCircle(vine, w * 0.035 - 6, h * 0.05, 4, C.rose, C.outline, 1.5);
    drawOutlinedCircle(vine, w * 0.035 + 5, h * 0.04, 3, C.pink, C.outline, 1.5);

    const frames = [
      { x: w * 0.82, y: h * 0.07, color: C.mint },
      { x: w * 0.24, y: h * 0.08, color: C.pinkSoft },
    ];
    frames.forEach(({ x, y, color }) => {
      const g = this.add.graphics().setDepth(2);
      drawOutlinedRect(g, x - 13, y - 11, 26, 22, C.wood, C.outline, 6, 2.5);
      drawOutlinedRect(g, x - 9, y - 7, 18, 14, color, C.outlineSoft, 4, 1.5);
    });
  }

  private drawWallSconce(x: number, y: number) {
    const g = this.add.graphics().setDepth(2);
    drawOutlinedRect(g, x - 8, y - 5, 16, 13, C.woodMid, C.outline, 5, 2);
    drawOutlinedRect(g, x - 3, y - 13, 6, 10, C.candle, C.outline, 2, 1.5);
    drawOutlinedCircle(g, x, y - 8, 6, C.lampGlow, C.outline, 1.5);
    drawWarmGlow(this, x, y + 10, 26, 0.06, 1);
    // Wall sconces light the room all around and warm up after dark via the
    // dynamic lighting pass (renderLights), alongside the fireplace + lamps.
    this.lightSpots.push({ x, y: y + 4, radius: 120, color: C.lampGlow, base: 0.05, night: 0.32 });
  }

  private drawBookshelves(w: number, h: number) {
    for (const shelf of TOP_SHELVES) {
      drawCozyBookshelf(this, w * shelf.x, h * L.shelfTopY, w * shelf.w, h * L.shelfTopH, 4);
    }
    for (const shelf of RIGHT_SHELVES) {
      drawCozyBookshelf(
        this,
        w * L.shelfRightX,
        h * shelf.y,
        w * L.shelfRightW,
        h * shelf.h,
        4
      );
    }
  }

  private drawFloorLamp(x: number, y: number) {
    const s = FURNITURE_SCALE;
    const g = this.add.graphics().setDepth(3);
    g.setPosition(x, y).setScale(s);
    drawOutlinedCircle(g, 0, 26, 14, C.cream, C.outline, 2.5);
    drawOutlinedRect(g, -3, 0, 6, 28, C.woodDark, C.outline, 2, 2);
    drawOutlinedCircle(g, 0, -8, 20, C.pinkSoft, C.outline, 2.5);
    drawWarmGlow(this, x, y + 14 * s, 52 * s, 0.08, 1);
    this.lightSpots.push({ x, y: y + 2 * s, radius: 110 * s, color: C.lampGlow, base: 0.1, night: 0.34 });
  }

  private drawLamp(x: number, y: number, scale = 1) {
    const s = scale * FURNITURE_SCALE;
    drawCozyLamp(this, x, y, s);
    this.lightSpots.push({ x, y, radius: 70 * s + 30, color: C.lampGlow, base: 0.08, night: 0.24 });
  }

  private drawPlants(w: number, h: number) {
    for (const plant of PLANT_SPOTS) {
      drawCozyPlant(this, w * plant.x, h * plant.y, plant.scale, plant.variant);
    }
  }

  private drawAtmosphere(w: number, h: number) {
    drawCozyAtmosphere(this, w, h, L.floorTop);
  }

  /** Create the dynamic ambiance layers and paint the first frame. */
  private setupAmbiance() {
    this.tintLayer = this.add.graphics().setDepth(6);
    // Equal depth 7, layered by insertion order: sky/frame-bg → celestial body
    // (masked to the glass) → mullions/border on top.
    this.windowLayer = this.add.graphics().setDepth(7);
    this.bodyLayer = this.add.graphics().setDepth(7);
    this.frameLayer = this.add.graphics().setDepth(7);
    this.lightLayer = this.add.graphics().setDepth(8);

    // A single sun/moon is masked to the union of the window glass rects, so it
    // simply slides out of view behind the wall between windows and reappears
    // in the next one — one body crossing the sky, not one per window.
    this.bodyMaskGfx?.destroy();
    this.bodyMaskGfx = this.make.graphics({}, false);
    this.bodyMaskGfx.fillStyle(0xffffff, 1);
    for (const win of this.windows) {
      this.bodyMaskGfx.fillRect(win.x, win.y, win.w, win.h);
    }
    this.bodyLayer.setMask(this.bodyMaskGfx.createGeometryMask());

    if (this.nextWeatherChangeAt === 0) {
      this.nextWeatherChangeAt = this.ambientClock + 9000;
    }
    const sky = this.skyState(this.todT);
    this.renderWindows(sky);
    this.renderCelestialBody(sky);
    this.renderInteriorTint(sky);
    this.renderLights(sky);
  }

  /** Advance the day cycle + weather and repaint windows, tint, and lighting. */
  private advanceAmbiance(delta: number) {
    if (!this.windowLayer || !this.tintLayer || !this.lightLayer) return;
    this.ambientClock += delta;
    this.ambianceRedrawAccum += delta;
    this.todT = (this.todT + delta / DAY_CYCLE_MS) % 1;
    this.updateWeather();
    const sky = this.skyState(this.todT);
    const key = `${Math.floor(this.todT * 8000)}|${sky.night.toFixed(2)}|${this.weatherStrength.toFixed(2)}|${this.weather}`;
    const weatherAnim = this.weatherStrength > 0.05;
    const interval = weatherAnim ? 33 : 80;
    if (this.ambianceRedrawAccum < interval && key === this.lastAmbianceKey) return;
    this.ambianceRedrawAccum = 0;
    this.lastAmbianceKey = key;
    this.renderWindows(sky);
    this.renderCelestialBody(sky);
    this.renderInteriorTint(sky);
    this.renderLights(sky);
  }

  private updateWeather() {
    if (this.ambientClock >= this.nextWeatherChangeAt) {
      const roll = Math.random();
      this.weather =
        roll < 0.52 ? "clear" : roll < 0.7 ? "rain" : roll < 0.86 ? "snow" : "fog";
      // A weather event lasts ~10 minutes once it starts; clear spells are a
      // shorter, random gap between events.
      const dur =
        this.weather === "clear"
          ? 60000 + Math.random() * 120000 // 1–3 min clear gap
          : 570000 + Math.random() * 60000; // ~9.5–10.5 min event
      this.nextWeatherChangeAt = this.ambientClock + dur;
    }
    const target = this.weather === "clear" ? 0 : 1;
    this.weatherStrength += (target - this.weatherStrength) * 0.025;
  }

  /** Interpolate the time-of-day palette + sun/moon position for progress t. */
  private skyState(t: number): SkyState {
    const seg = Math.floor(t * 4) % 4;
    const local = t * 4 - Math.floor(t * 4);
    const a = SKY_KEYS[seg];
    const b = SKY_KEYS[(seg + 1) % 4];
    let body: SkyState["body"];
    let star = 0;
    if (t < 0.5) {
      const p = t / 0.5;
      body = {
        nx: lerp(0.12, 0.88, p),
        ny: 0.82 - Math.sin(Math.PI * p) * 0.62,
        color: lerpColor(0xffc36b, 0xfff0b4, Math.sin(Math.PI * p)),
        moon: false,
      };
    } else {
      const p = (t - 0.5) / 0.5;
      body = {
        nx: lerp(0.16, 0.84, p),
        ny: 0.8 - Math.sin(Math.PI * p) * 0.5,
        color: 0xf3efd6,
        moon: true,
      };
      // Stars only while the moon is up: fade in as it rises after sunset, hold
      // through deep night, then fade out as dawn/sunrise approaches.
      star =
        Phaser.Math.Clamp(p / 0.24, 0, 1) *
        (1 - Phaser.Math.Clamp((p - 0.84) / 0.16, 0, 1));
    }
    return {
      top: lerpColor(a.top, b.top, local),
      bottom: lerpColor(a.bottom, b.bottom, local),
      tintColor: lerpColor(a.tintColor, b.tintColor, local),
      tintAlpha: lerp(a.tintAlpha, b.tintAlpha, local),
      night: lerp(a.night, b.night, local),
      star,
      body,
    };
  }

  private renderWindows(sky: SkyState) {
    const wl = this.windowLayer;
    const fl = this.frameLayer;
    if (!wl || !fl) return;
    wl.clear();
    fl.clear();
    const pad = 7;
    const bands = 10;

    for (const win of this.windows) {
      const { x, y, w, h } = win;

      // Rounded wood frame behind the glass.
      wl.fillStyle(C.wood, 1);
      wl.fillRoundedRect(r(x - pad), r(y - pad), r(w + pad * 2), r(h + pad * 2), 12);
      wl.lineStyle(3, C.outline, 1);
      wl.strokeRoundedRect(r(x - pad), r(y - pad), r(w + pad * 2), r(h + pad * 2), 12);

      // Sky gradient (top → bottom bands).
      for (let i = 0; i < bands; i++) {
        wl.fillStyle(lerpColor(sky.top, sky.bottom, i / (bands - 1)), 1);
        wl.fillRect(r(x), r(y + (h * i) / bands), r(w), Math.ceil(h / bands) + 1);
      }

      // Stars at night only — visible once the moon is up, never by daylight.
      if (sky.star > 0.01) {
        wl.fillStyle(0xfdfdf4, sky.star);
        for (let s = 0; s < 14; s++) {
          const sxn = pseudo(s * 2.1) * 0.9 + 0.05;
          const syn = pseudo(s * 3.7) * 0.5 + 0.05;
          const tw = 0.7 + 0.3 * Math.sin(this.ambientClock * 0.003 + s);
          wl.fillCircle(r(x + sxn * w), r(y + syn * h), 1.2 * tw);
        }
      }

      this.renderWeatherIn(wl, win);

      // Wood ring masks any precipitation that overran the glass edges.
      wl.fillStyle(C.wood, 1);
      wl.fillRect(r(x - pad), r(y - pad), r(w + pad * 2), pad);
      wl.fillRect(r(x - pad), r(y + h), r(w + pad * 2), pad);
      wl.fillRect(r(x - pad), r(y), pad, r(h));
      wl.fillRect(r(x + w), r(y), pad, r(h));

      // Mullions + crisp inner border drawn on top of the (masked) celestial body.
      fl.lineStyle(3, C.woodMid, 1);
      fl.lineBetween(r(x + w / 2), r(y), r(x + w / 2), r(y + h));
      fl.lineBetween(r(x), r(y + h / 2), r(x + w), r(y + h / 2));
      fl.lineStyle(2.5, C.outline, 0.9);
      fl.strokeRect(r(x), r(y), r(w), r(h));
    }
  }

  /**
   * One sun/moon crossing the whole window row. Its x spans from the first
   * window's left edge to the last window's right edge (gaps included); the
   * geometry mask on bodyLayer hides it over the wall between windows, so it
   * appears to pass behind the wall and emerge in the adjacent window.
   */
  private renderCelestialBody(sky: SkyState) {
    const bl = this.bodyLayer;
    if (!bl || this.windows.length === 0) return;
    bl.clear();

    const first = this.windows[0];
    const last = this.windows[this.windows.length - 1];
    const spanL = first.x;
    const spanR = last.x + last.w;
    const bx = spanL + sky.body.nx * (spanR - spanL);
    const by = first.y + sky.body.ny * first.h;
    const br = Math.min(first.w, first.h) * 0.16;

    // Soft halo for both sun and moon.
    bl.fillStyle(sky.body.color, 0.22);
    bl.fillCircle(r(bx), r(by), br * 1.8);

    if (sky.body.moon) {
      // Draw ONLY the lit crescent, built as a filled lune that lies entirely
      // inside the moon's disc — so no shadow pixels ever spill past the moon's
      // outline (the old offset-shadow circle bled onto the sky).
      bl.fillStyle(sky.body.color, 1);
      bl.fillPoints(this.crescentPoints(bx, by, br), true);
    } else {
      bl.fillStyle(sky.body.color, 1);
      bl.fillCircle(r(bx), r(by), br);
    }
  }

  /**
   * Boundary points of the lit crescent: the region inside the moon disc and
   * outside an offset "shadow" disc, walked as a simple polygon (bright moon
   * limb + shadow terminator) that never leaves the moon radius.
   */
  private crescentPoints(bx: number, by: number, R: number): Phaser.Math.Vector2[] {
    const rs = R * 0.85;
    const sx = bx + R * 0.42;
    const sy = by - R * 0.28;
    const d = Math.hypot(sx - bx, sy - by) || 0.0001;
    const a = (d * d + R * R - rs * rs) / (2 * d);
    const hh = Math.sqrt(Math.max(0, R * R - a * a));
    const ux = (sx - bx) / d;
    const uy = (sy - by) / d;
    const mx = bx + a * ux;
    const my = by + a * uy;
    const i1x = mx - hh * uy;
    const i1y = my + hh * ux;
    const i2x = mx + hh * uy;
    const i2y = my - hh * ux;

    const aM1 = Math.atan2(i1y - by, i1x - bx);
    const aM2 = Math.atan2(i2y - by, i2x - bx);
    const aS1 = Math.atan2(i1y - sy, i1x - sx);
    const aS2 = Math.atan2(i2y - sy, i2x - sx);

    const pts: Phaser.Math.Vector2[] = [];
    const sweep = (
      cx: number,
      cy: number,
      rad: number,
      a0: number,
      a1: number,
      ccw: boolean,
      n: number
    ) => {
      let delta = a1 - a0;
      if (ccw) while (delta < 0) delta += Math.PI * 2;
      else while (delta > 0) delta -= Math.PI * 2;
      for (let i = 0; i <= n; i++) {
        const ang = a0 + delta * (i / n);
        pts.push(new Phaser.Math.Vector2(cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)));
      }
    };
    const midOutsideShadow = (() => {
      let delta = aM2 - aM1;
      while (delta < 0) delta += Math.PI * 2;
      const am = aM1 + delta / 2;
      return Math.hypot(bx + R * Math.cos(am) - sx, by + R * Math.sin(am) - sy) > rs;
    })();
    const midInsideMoon = (() => {
      let delta = aS1 - aS2;
      while (delta < 0) delta += Math.PI * 2;
      const am = aS2 + delta / 2;
      return Math.hypot(sx + rs * Math.cos(am) - bx, sy + rs * Math.sin(am) - by) < R;
    })();

    // Bright limb along the moon (I1→I2), then terminator along the shadow (I2→I1).
    sweep(bx, by, R, aM1, aM2, midOutsideShadow, 24);
    sweep(sx, sy, rs, aS2, aS1, midInsideMoon, 20);
    return pts;
  }

  private renderWeatherIn(wl: Phaser.GameObjects.Graphics, win: WindowGlass) {
    const s = this.weatherStrength;
    if (s < 0.03) return;
    const { x, y, w, h } = win;
    const t = this.ambientClock;

    if (this.weather === "fog") {
      wl.fillStyle(0xeaeff2, 0.32 * s);
      wl.fillRect(r(x), r(y), r(w), r(h));
      for (let i = 0; i < 3; i++) {
        const fy = (pseudo(i * 5.1) + t * 0.00002 * (1 + i)) % 1;
        wl.fillStyle(0xf4f7f9, 0.18 * s);
        wl.fillRect(r(x), r(y + fy * h), r(w), r(h * 0.16));
      }
      return;
    }

    if (this.weather === "snow") {
      wl.fillStyle(0xffffff, 0.9 * s);
      for (let i = 0; i < 26; i++) {
        const fx = (pseudo(i) + Math.sin(t * 0.001 + i) * 0.04 + 1) % 1;
        const fy = (pseudo(i * 1.7) + t * 0.00004 * (0.6 + pseudo(i * 2.3))) % 1;
        wl.fillCircle(r(x + fx * w), r(y + fy * h), 1.4 * (0.6 + pseudo(i * 5)));
      }
      return;
    }

    // Rain.
    wl.lineStyle(1.5, 0xc3dbea, 0.7 * s);
    for (let i = 0; i < 30; i++) {
      const fx = pseudo(i * 2.7) * 0.96 + 0.02;
      const fy = (pseudo(i * 1.9) + t * 0.00018 * (0.8 + pseudo(i))) % 1;
      const px = x + fx * w;
      const py = y + fy * h;
      wl.lineBetween(r(px), r(py), r(px - 2), r(py + Math.min(9, h * 0.08)));
    }
  }

  private renderInteriorTint(sky: SkyState) {
    const tl = this.tintLayer;
    if (!tl) return;
    tl.clear();
    if (sky.tintAlpha > 0.001) {
      tl.fillStyle(sky.tintColor, sky.tintAlpha);
      tl.fillRect(0, 0, r(this.roomW), r(this.roomH));
    }
  }

  private renderLights(sky: SkyState) {
    const ll = this.lightLayer;
    if (!ll) return;
    ll.clear();
    if (this.lightSpots.length === 0) return;
    const flicker =
      0.92 +
      0.06 * Math.sin(this.ambientClock * 0.013) +
      0.04 * Math.sin(this.ambientClock * 0.037);

    for (const light of this.lightSpots) {
      const intensity = (light.base + light.night * sky.night) * flicker;
      if (intensity <= 0.01) continue;
      const radius = light.radius * (1 + 0.22 * sky.night);
      ll.fillStyle(light.color, intensity * 0.5);
      ll.fillCircle(r(light.x), r(light.y), r(radius * 0.42));
      ll.fillStyle(light.color, intensity * 0.28);
      ll.fillCircle(r(light.x), r(light.y), r(radius * 0.72));
      ll.fillStyle(light.color, intensity * 0.14);
      ll.fillCircle(r(light.x), r(light.y), r(radius));
    }
  }

  private getTableMetrics(_screenW: number): TableMetrics {
    return getTableLayout(this.capacity);
  }

  private buildTableAndSeats(w: number, h: number) {
    this.seatZones.forEach((z) => z.destroy());
    this.seatGraphics.forEach((g) => g.destroy());
    this.tableGfx?.destroy();
    this.studyRugGfx?.destroy();
    this.seatZones = [];
    this.seatGraphics = [];

    const placement = getStudyPlacement(this.capacity, w, h);
    this.centerX = placement.cx;
    this.centerY = placement.cy;
    const cx = placement.cx;
    const cy = placement.cy;

    this.studyRugGfx = this.add.graphics().setDepth(1);
    drawCozyRug(
      this.studyRugGfx,
      cx,
      cy,
      placement.rugW,
      placement.rugH,
      C.rugCream,
      C.rugCreamBorder,
      true
    );
    const metrics = this.getTableMetrics(w);
    const g = this.add.graphics().setDepth(5);
    this.tableGfx = g;

    if (metrics.shape === "round") {
      drawOutlinedEllipse(g, cx, cy + 4, metrics.outerW, metrics.outerH, C.table, C.outline, 3);
      drawOutlinedEllipse(g, cx, cy, metrics.innerW, metrics.innerH, C.tableTop, C.outline, 2.5);
      const deco = Math.max(10, metrics.innerW * 0.12);
      drawOutlinedRect(g, cx - deco, cy - deco * 0.45, deco * 2, deco * 1.2, C.cream, C.outline, 8, 2);
      this.drawLamp(cx + metrics.innerW * 0.35, cy - metrics.innerH * 0.3, 0.5);
    } else {
      const { tw, th } = metrics;
      const corner = Math.min(20, tw * 0.12, th * 0.15);
      drawOutlinedRect(g, cx - tw / 2, cy - th / 2 + 6, tw, th, C.table, C.outline, corner, 3);
      drawOutlinedRect(
        g,
        cx - tw / 2 + 12,
        cy - th / 2,
        tw - 24,
        th - 14,
        C.tableTop,
        C.outline,
        corner - 4,
        2.5
      );
      if (tw >= 180) {
        const mugOffset = Math.min(tw * 0.22, 50);
        drawCozyMug(g, cx - mugOffset, cy);
        drawCozyMug(g, cx + mugOffset, cy);
      }
      this.drawLamp(cx, cy - th * 0.35, 0.45);
    }

    this.seatPositions = this.computeSeatLayout(cx, cy, metrics);
    this.seatPositions.forEach((pos, i) => this.registerSeatSlot(i, pos));
  }

  /** Append campfire stools as real seat slots after the study chairs. */
  private buildCampfireSeats(w: number, h: number) {
    const plan = getFurniturePlan(this.capacity);
    if (!plan.campfire) return;

    const layout = getCampfireLayout(
      w,
      h,
      plan.campfireChairs,
      plan.campfireScale
    );
    this.campfireCenter = { x: layout.fireX, y: layout.fireY };

    layout.chairs.forEach((chair, i) => {
      const slot = this.capacity + i;
      this.registerSeatSlot(slot, {
        x: chair.x,
        y: chair.y,
        angle: chair.face + Math.PI / 2,
      });
    });
  }

  private registerSeatSlot(
    slot: number,
    pos: { x: number; y: number; angle: number }
  ) {
    if (slot >= this.seatPositions.length) {
      this.seatPositions.push(pos);
    } else {
      this.seatPositions[slot] = pos;
    }

    const sg = this.add.graphics().setDepth(6);
    this.drawSeatGraphic(sg, slot, pos.x, pos.y, pos.angle, "empty");
    this.seatGraphics[slot] = sg;

    const zone = this.add
      .zone(pos.x, pos.y, 72 * FURNITURE_SCALE, 72 * FURNITURE_SCALE)
      .setInteractive({ useHandCursor: true })
      .setDepth(8);
    zone.on("pointerover", () => {
      if (!this.isSeatTaken(slot)) {
        this.drawSeatGraphic(sg, slot, pos.x, pos.y, pos.angle, "hover");
      }
    });
    zone.on("pointerout", () => {
      const occ = this.membersCache.find((m) => m.deskSlot === slot);
      const isMine = occ?.userId === this.myUserId;
      this.drawSeatGraphic(
        sg,
        slot,
        pos.x,
        pos.y,
        pos.angle,
        occ ? (isMine ? "hover" : "taken") : "empty"
      );
    });
    zone.on("pointerdown", () => {
      if (this.isSeatTaken(slot)) return;
      this.onSeatClick?.(slot);
      this.handleLocalSeatSelected(slot);
    });
    this.seatZones[slot] = zone;
  }

  private drawSeatGraphic(
    g: Phaser.GameObjects.Graphics,
    slot: number,
    x: number,
    y: number,
    angle: number,
    state: "empty" | "hover" | "taken"
  ) {
    if (isCampfireSeatSlot(slot, this.capacity)) {
      this.drawCampStool(g, x, y, angle, state);
    } else {
      this.drawChair(g, x, y, angle, state);
    }
  }

  private computeSeatLayout(cx: number, cy: number, metrics: TableMetrics) {
    const positions: { x: number; y: number; angle: number }[] = [];
    const cap = this.capacity;

    if (metrics.shape === "round") {
      const semiW = metrics.innerW / 2;
      const semiH = metrics.innerH / 2;
      for (let i = 0; i < cap; i++) {
        const angle = (Math.PI * 2 * i) / cap - Math.PI / 2;
        const edgeR = ellipseRadiusAtAngle(semiW, semiH, angle);
        const seatR = edgeR + metrics.seatOffset;
        positions.push({
          x: cx + Math.cos(angle) * seatR,
          y: cy + Math.sin(angle) * seatR,
          angle: angle + Math.PI / 2,
        });
      }
      return positions;
    }

    const { tw, th, seatOffset, sideCounts } = metrics;
    const halfW = tw / 2;
    const halfH = th / 2;
    const [top, right, bottom, left] = sideCounts;

    const sideSeats = (
      count: number,
      start: { x: number; y: number },
      end: { x: number; y: number },
      angle: number
    ) => {
      if (count <= 0) return;
      if (count === 1) {
        positions.push({
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
          angle,
        });
        return;
      }
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        positions.push({
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          angle,
        });
      }
    };

    sideSeats(
      top,
      { x: cx - halfW, y: cy - halfH - seatOffset },
      { x: cx + halfW, y: cy - halfH - seatOffset },
      0
    );
    sideSeats(
      right,
      { x: cx + halfW + seatOffset, y: cy - halfH },
      { x: cx + halfW + seatOffset, y: cy + halfH },
      Math.PI / 2
    );
    sideSeats(
      bottom,
      { x: cx + halfW, y: cy + halfH + seatOffset },
      { x: cx - halfW, y: cy + halfH + seatOffset },
      Math.PI
    );
    sideSeats(
      left,
      { x: cx - halfW - seatOffset, y: cy + halfH },
      { x: cx - halfW - seatOffset, y: cy - halfH },
      -Math.PI / 2
    );

    // Seat count must exactly match room capacity.
    return positions.slice(0, cap);
  }

  private drawChair(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    state: "empty" | "hover" | "taken"
  ) {
    g.clear();
    g.setPosition(x, y);
    g.setRotation(angle);
    g.setScale(FURNITURE_SCALE);

    const color =
      state === "hover" ? C.chairHover : state === "taken" ? C.chairTaken : C.chairEmpty;

    drawOutlinedRect(g, -24, -16, 48, 32, color, C.outline, 14, 3);
    drawOutlinedRect(g, -20, -32, 40, 18, C.sageLight, C.outline, 12, 2.5);

    if (state === "empty") {
      drawOutlinedCircle(g, 0, 0, 5, C.cream, C.outlineSoft, 1.5);
    }
  }

  private drawCampStool(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    state: "empty" | "hover" | "taken"
  ) {
    g.clear();
    g.setPosition(x, y);
    g.setRotation(angle);
    g.setScale(FURNITURE_SCALE);

    const body =
      state === "hover" ? C.woodLight : state === "taken" ? C.woodDark : C.woodMid;
    const back =
      state === "hover" ? C.wood : state === "taken" ? C.woodMid : C.wood;

    drawOutlinedRect(g, -18, -10, 36, 20, body, C.outline, 8, 2.5);
    drawOutlinedRect(g, -14, -18, 28, 10, back, C.outline, 6, 2);

    if (state === "empty") {
      drawOutlinedCircle(g, 0, 0, 4, C.cream, C.outlineSoft, 1.5);
    }
  }

  private isSeatTaken(slot: number): boolean {
    return this.membersCache.some((m) => m.deskSlot === slot);
  }

  syncMembers(members: RoomMember[]) {
    if (this.seatPositions.length === 0) return;
    this.membersCache = members;

    this.seatPositions.forEach((pos, i) => {
      const occupant = members.find((m) => m.deskSlot === i);
      const sg = this.seatGraphics[i];
      if (!sg) return;
      const isMine = occupant?.userId === this.myUserId;
      this.drawSeatGraphic(
        sg,
        i,
        pos.x,
        pos.y,
        pos.angle,
        occupant ? (isMine ? "hover" : "taken") : "empty"
      );
    });

    const seen = new Set<string>();
    members.forEach((m) => {
      seen.add(m.userId);
      const isLocal = m.userId === this.myUserId;

      if (m.deskSlot < 0) {
        if (isLocal) {
          const existing = this.avatars.get(m.userId);
          if (!existing) {
            const spawn =
              this.navGrid?.findRandomWalkable(this.centerX, this.centerY, 80) ??
              { x: this.centerX, y: this.centerY };
            const avatar = this.buildAvatar(m, spawn.x, spawn.y);
            this.avatars.set(m.userId, avatar);
            if (this.localFreePosition && !this.wanderTimer) {
              this.startLocalWandering();
            }
          }
        }
        return;
      }

      const pos = this.seatPositions[m.deskSlot];
      if (!pos) return;

      const existing = this.avatars.get(m.userId);
      const shouldLockToSeat =
        !isLocal || (!this.localFreePosition && this.timerPhase === "work");

      if (!existing) {
        const spawn = isLocal
          ? this.navGrid?.findRandomWalkable(pos.x, pos.y, 30) ?? pos
          : pos;
        const avatar = this.buildAvatar(m, spawn.x, spawn.y);
        if (isLocal && !shouldLockToSeat) {
          this.walkLocalUserToSeat(m.deskSlot);
        } else if (isLocal && shouldLockToSeat) {
          this.seatAvatar(avatar);
          this.applyStatus(avatar, this.timerPhase === "work" ? "studying" : avatar.status);
        }
        this.avatars.set(m.userId, avatar);
      } else {
        if (existing.deskSlot !== m.deskSlot) {
          existing.deskSlot = m.deskSlot;
          if (isLocal) {
            this.stopLocalWandering();
            existing.walkTween?.stop();
            existing.walkTween = null;
            if (shouldLockToSeat) {
              this.walkAvatarTo(existing, pos.x, pos.y, () => {
                this.seatAvatar(existing);
                this.applyStatus(existing, "studying");
              });
            } else {
              this.walkLocalUserToSeat(m.deskSlot);
            }
          } else if (shouldLockToSeat) {
            this.seatAvatar(existing);
          }
        } else if (shouldLockToSeat && !existing.walkTween && !existing.isSeated) {
          this.seatAvatar(existing);
        } else if (isLocal && shouldLockToSeat && !existing.isSeated && !existing.walkTween) {
          this.walkAvatarTo(existing, pos.x, pos.y, () => {
            this.seatAvatar(existing);
            this.applyStatus(existing, "studying");
          });
        } else if (
          isLocal &&
          !shouldLockToSeat &&
          !this.localFreePosition &&
          !existing.walkTween &&
          !existing.isSeated &&
          existing.deskSlot === m.deskSlot
        ) {
          this.walkLocalUserToSeat(m.deskSlot);
        }

        if (existing.status !== m.status) {
          this.applyStatus(existing, m.status);
        }
      }
    });

    for (const [userId, view] of this.avatars) {
      if (!seen.has(userId)) {
        this.clearAvatarBubble(view);
        view.animTween?.stop();
        view.walkTween?.stop();
        view.container.destroy();
        this.avatars.delete(userId);
        for (const [id, b] of this.bubbles) {
          if (b.userId === userId) this.bubbles.delete(id);
        }
      }
    }

    // Refresh study-timer labels for new/changed members right away.
    this.updateStudyTimers();
  }

  setUserTyping(userId: string, isTyping: boolean) {
    const avatar = this.avatars.get(userId);
    if (!avatar) return;

    if (isTyping) {
      if (avatar.bubbleType === "typing") return;
      this.clearAvatarBubble(avatar);
      const bubble = drawTypingBubble(this);
      avatar.container.add(bubble);
      avatar.bubble = bubble;
      avatar.bubbleType = "typing";
    } else if (avatar.bubbleType === "typing") {
      this.clearAvatarBubble(avatar);
    }
  }

  private clearAvatarBubble(avatar: AvatarView) {
    if (!avatar.bubble) return;
    avatar.bubble.destroy();
    avatar.bubble = null;
    avatar.bubbleType = null;
  }

  private buildAvatar(member: RoomMember, x: number, y: number): AvatarView {
    const isLocal = member.userId === this.myUserId;
    const frog = createFrogAvatar(this, 0, -5, 0.9);
    const book = drawReadingBook(this).setVisible(false);

    // Clicking an avatar opens the in-room interaction popup. The React host
    // listens for this scene event and reads the current user via refs.
    frog.setInteractive({ useHandCursor: true });
    frog.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event?: Phaser.Types.Input.EventData
      ) => {
        event?.stopPropagation();
        this.events.emit("avatarClicked", member.userId);
      }
    );

    const textDpi = getDisplayDpi();
    const label = this.add
      .text(0, 38, member.displayName, {
        fontFamily: "Nunito, sans-serif",
        fontSize: "15px",
        color: C.text,
        fontStyle: "bold",
        stroke: "#ffffff",
        strokeThickness: 4,
        resolution: textDpi,
      })
      .setOrigin(0.5);

    // Daily study stopwatch floating above the head: smaller than the nameplate,
    // dark-outlined so the white/grey text stays legible over the cream floor.
    const timerLabel = this.add
      .text(0, -62, "0:00", {
        fontFamily: "Nunito, sans-serif",
        fontSize: "11px",
        color: "#9a8f80",
        fontStyle: "bold",
        stroke: C.text,
        strokeThickness: 3,
        resolution: textDpi,
      })
      .setOrigin(0.5);

    // Scale the whole avatar (frog + held book + name label + timer) up together
    // so the character is clearly visible and its labels are legible at the fit-zoom.
    const wrapper = this.add
      .container(Math.round(x), Math.round(y), [frog, book, label, timerLabel])
      .setDepth(10)
      .setScale(AVATAR_SCALE);

    const view: AvatarView = {
      container: wrapper,
      frog,
      book,
      status: member.status,
      deskSlot: member.deskSlot,
      bubble: null,
      bubbleType: null,
      breakIcon: null,
      timerLabel,
      seatFaceDY: 0,
      animTween: null,
      animKind: "none",
      baseScale: frog.scaleX,
      frogBaseY: frog.y,
      walkTween: null,
      isLocal,
      isSeated: false,
    };
    this.applyStatus(view, member.status);
    this.updateAvatarDepth(view);
    return view;
  }

  private applyStatus(view: AvatarView, status: string) {
    view.status = status;
    const isLocalOnBreak = view.isLocal && this.timerPhase === "break";
    const effectiveStatus = isLocalOnBreak ? "break" : status;
    const studying = effectiveStatus === "studying";
    const onBreak = effectiveStatus === "break";

    // Studying = the frog holds an open book (reading pose); shown only on the
    // work/focus phase. The body animation itself is chosen by refreshFrogMotion.
    view.book.setVisible(studying);

    if (onBreak && !view.breakIcon) {
      view.breakIcon = this.add
        .text(0, -52, "☕", { fontSize: "16px", resolution: getDisplayDpi() })
        .setOrigin(0.5);
      view.container.add(view.breakIcon);
    } else if (!onBreak && view.breakIcon) {
      view.breakIcon.destroy();
      view.breakIcon = null;
    }

    this.refreshFrogMotion(view);
  }

  /**
   * Pick the looping body animation that matches the frog's current motion and
   * status: a walking hop while moving, a slow reading bob while studying, and
   * a gentle idle breath otherwise. Called whenever movement or status changes.
   */
  private refreshFrogMotion(view: AvatarView) {
    const moving = view.walkTween !== null || (view.isLocal && this.localWasdMoving);
    if (moving) {
      this.playFrogAnim(view, "walk");
      return;
    }
    const isLocalOnBreak = view.isLocal && this.timerPhase === "break";
    const effectiveStatus = isLocalOnBreak ? "break" : view.status;
    this.playFrogAnim(view, effectiveStatus === "studying" ? "study" : "idle");
  }

  /** Start (or keep) a looping body animation, resetting to the rest pose first. */
  private playFrogAnim(view: AvatarView, kind: "idle" | "walk" | "study") {
    if (view.animKind === kind && view.animTween) return;
    if (view.animTween) {
      view.animTween.stop();
      view.animTween = null;
    }
    view.animKind = kind;

    const frog = view.frog;
    const base = view.baseScale;
    const restY =
      view.frogBaseY + (view.isSeated ? SIT_SINK + view.seatFaceDY : 0);
    frog.setScale(base);
    frog.setY(restY);
    view.book.setY(READING_BOOK_Y);

    if (kind === "walk") {
      // While moving the frog just travels — no bop, only the walk motion.
      return;
    }

    if (kind === "study") {
      // Sitting + studying: a subtle reading bop with the open book.
      view.animTween = this.tweens.add({
        targets: [frog, view.book],
        y: "-=2.5",
        duration: 1700 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      // Standing idle (paused between movements): a gentle, subtle bop.
      view.animTween = this.tweens.add({
        targets: frog,
        y: "-=2.5",
        duration: 1900 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  syncChat(messages: ChatMessage[]) {
    const now = Date.now();
    const recent = messages.filter((m) => now - m.createdAt < 8000);

    for (const msg of recent) {
      if (this.bubbles.has(msg.id)) continue;
      const avatar = this.avatars.get(msg.userId);
      if (!avatar) continue;

      this.clearAvatarBubble(avatar);
      const bubble = drawSpeechBubble(this, msg.text);
      avatar.container.add(bubble);
      avatar.bubble = bubble;
      avatar.bubbleType = "message";
      this.bubbles.set(msg.id, {
        container: bubble,
        expiresAt: msg.createdAt + 8000,
        userId: msg.userId,
      });

      this.tweens.add({
        targets: bubble,
        alpha: 0,
        delay: 6000,
        duration: 2000,
        onComplete: () => {
          bubble.destroy();
          this.bubbles.delete(msg.id);
          if (avatar.bubble === bubble) {
            avatar.bubble = null;
            avatar.bubbleType = null;
          }
        },
      });
    }

    for (const [id, b] of this.bubbles) {
      if (now > b.expiresAt) {
        b.container.destroy();
        this.bubbles.delete(id);
        const avatar = this.avatars.get(b.userId);
        if (avatar?.bubble === b.container) {
          avatar.bubble = null;
          avatar.bubbleType = null;
        }
      }
    }
  }

  resizeSeats(capacity: number) {
    this.capacity = normalizeCapacity(capacity);
    this.stopLocalWandering();
    for (const view of this.avatars.values()) {
      this.clearAvatarBubble(view);
      view.animTween?.stop();
      view.walkTween?.stop();
      view.container.destroy();
    }
    this.avatars.clear();
    this.bubbles.clear();
    // Room size depends on capacity now, so rebuild the whole room (walls,
    // floor, furniture, backdrop), not just the table and seats.
    this.destroyRoomObjects();
    this.buildRoom();
    this.syncMembers(this.membersCache);
    if (this.localFreePosition) {
      this.startLocalWandering();
    }
  }
}
