import { AvatarConfig, DEFAULT_AVATAR_CONFIG, PresenceStatus } from "./avatarTypes";
import { normalizeCapacity, totalSeatCount } from "../game/roomLayout";

/**
 * Local mock backend for Nook v1.
 * Persists to localStorage; cross-tab sync via BroadcastChannel.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnlineStatus = "online" | "dnd" | "offline";

/** Manual override; omit or "auto" for activity-based online/offline. */
export type OnlineStatusMode = "auto" | OnlineStatus;

export interface PrivacySettings {
  showStats: boolean;
  showAchievements: boolean;
  showFriends: boolean;
  autoAcceptFriends: boolean;
}

export interface Profile {
  userId: string;
  email: string;
  /** Nickname — editable display name shown bold on profile. */
  displayName: string;
  /** Unique handle (@username) — set at signup, rarely changed. */
  username: string;
  avatarConfig: AvatarConfig;
  avatarCreated: boolean;
  /** User-uploaded profile photo (base64 data URL). */
  profilePhotoUrl?: string | null;
  bio?: string;
  /** Manual status override; auto when unset or "auto". */
  onlineStatus?: OnlineStatusMode;
  lastActiveAt?: number;
  /** Set at signup; cleared after avatar onboarding auto-friends inviter. */
  pendingInviterUserId?: string;
  /** Privacy — what other users can see on your profile. */
  showStats?: boolean;
  showAchievements?: boolean;
  showFriends?: boolean;
  autoAcceptFriends?: boolean;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  createdBy: string;
  capacity: number;
  createdAt: number;
}

export interface UserNookMember {
  userId: string;
  displayName: string;
  username: string;
  profilePhotoUrl?: string | null;
  onlineStatus: OnlineStatus;
  presenceStatus: PresenceStatus;
}

export interface UserNookSummary {
  id: string;
  name: string;
  code: string;
  capacity: number;
  memberCount: number;
  studyingCount: number;
  members: UserNookMember[];
  createdBy: string;
  isOwner: boolean;
  createdAt: number;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  deskSlot: number; // -1 = not seated yet
  status: PresenceStatus;
  timerEndsAt: number | null;
  /** When the current uncommitted focus segment began; null unless actively
   * studying. Drives live focus-time accumulation on the room board and is the
   * base for committing accrued whole minutes to the store. */
  focusStartedAt?: number | null;
  /** Session aggregating the current focus run; whole minutes accrue into it as
   * the run progresses. Persists across pause/resume, cleared when the run ends. */
  focusSessionId?: string | null;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  text: string;
  createdAt: number;
}

export interface StudySession {
  id: string;
  userId: string;
  /** Room where the session was recorded — used for per-room daily timers. */
  roomId?: string;
  durationMinutes: number;
  /** Precise elapsed seconds (preferred over whole-minute rounding). */
  durationSeconds?: number;
  completedAt: number;
}

function sessionDurationSeconds(s: StudySession): number {
  return s.durationSeconds ?? s.durationMinutes * 60;
}

export interface UserAchievement {
  achievementId: string;
  earnedAt: number;
}

export interface UserMeta {
  roomsCreated: number;
  messagesSent: number;
  hasSat: boolean;
  roomsJoined: string[];
  /** Nooks removed from the user's list (including owned nooks). */
  hiddenNooks: string[];
  /** Last desk/campfire slot chosen per room (survives leave/rejoin). */
  lastDeskSlotByRoom?: Record<string, number>;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
}

/** Minimum session length (minutes) to count toward daily streak. */
export const STREAK_MIN_MINUTES = 15;

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  studiedToday: boolean;
  atRisk: boolean;
}

export interface Friendship {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted";
  createdAt: number;
}

export interface DirectMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: number;
}

export interface FriendInfo {
  userId: string;
  displayName: string;
  username: string;
  email: string;
  profilePhotoUrl?: string | null;
  onlineStatus: OnlineStatus;
  /** @deprecated use onlineStatus */
  online: boolean;
}

export interface UserSearchResult {
  userId: string;
  displayName: string;
  username: string;
  profilePhotoUrl?: string | null;
}

export interface FriendRequestInfo {
  id: string;
  fromUserId: string;
  toUserId: string;
  displayName: string;
  username: string;
  profilePhotoUrl?: string | null;
  createdAt: number;
}

export interface EmailInvite {
  id: string;
  fromUserId: string;
  toEmail: string;
  createdAt: number;
}

export type EmailInviteResult =
  | { type: "instant"; friendship: Friendship }
  | { type: "sent"; invite: EmailInvite };

interface Account {
  userId: string;
  email: string;
  password: string;
}

interface DbShape {
  accounts: Account[];
  profiles: Record<string, Profile>;
  rooms: Record<string, Room>;
  members: RoomMember[];
  sessions: StudySession[];
  chat: ChatMessage[];
  achievements: Record<string, UserAchievement[]>;
  meta: Record<string, UserMeta>;
  friendships: Friendship[];
  directMessages: DirectMessage[];
  emailInvites: EmailInvite[];
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const DB_KEY = "nook.db.v5";
const DB_KEY_LEGACY_V4 = "nook.db.v4";
const DB_KEY_LEGACY_V3 = "nook.db.v3";
const DB_KEY_LEGACY_V2 = "nook.db.v2";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const ACTIVE_CUTOFF_MS = 10 * 60 * 1000;
const SESSION_KEY = "nook.session.v1";

function emptyDb(): DbShape {
  return {
    accounts: [],
    profiles: {},
    rooms: {},
    members: [],
    sessions: [],
    chat: [],
    achievements: {},
    meta: {},
    friendships: [],
    directMessages: [],
    emailInvites: [],
  };
}

function sanitizeUsernameBase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20);
}

export function normalizeUsername(input: string): string {
  const base = sanitizeUsernameBase(input.replace(/^@/, ""));
  if (base.length >= 3) return base;
  const padded = (base + "___").slice(0, 3);
  return padded.replace(/[^a-z0-9_]/g, "x");
}

export function validateUsername(username: string): void {
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      "Username must be 3–20 characters: lowercase letters, numbers, and underscores only."
    );
  }
}

function ensureUniqueUsername(db: DbShape, base: string, excludeUserId?: string): string {
  let candidate = normalizeUsername(base);
  if (!USERNAME_RE.test(candidate)) candidate = "friend";
  let suffix = 0;
  while (
    Object.values(db.profiles).some(
      (p) => p.username === candidate && p.userId !== excludeUserId
    )
  ) {
    suffix += 1;
    const stem = candidate.slice(0, Math.max(3, 20 - String(suffix).length - 1));
    candidate = `${stem}_${suffix}`;
  }
  return candidate;
}

function migrateProfile(profile: Profile, db?: DbShape): Profile {
  if (!profile.username) {
    const base = profile.email.split("@")[0] || "friend";
    profile.username = db
      ? ensureUniqueUsername(db, base, profile.userId)
      : normalizeUsername(base);
  }
  if (profile.profilePhotoUrl === undefined) profile.profilePhotoUrl = null;
  if (profile.bio === undefined) profile.bio = "";
  if (profile.onlineStatus === undefined) profile.onlineStatus = "auto";
  if (profile.showStats === undefined) profile.showStats = true;
  if (profile.showAchievements === undefined) profile.showAchievements = true;
  if (profile.showFriends === undefined) profile.showFriends = true;
  if (profile.autoAcceptFriends === undefined) profile.autoAcceptFriends = false;
  return profile;
}

export function getProfilePrivacy(userId: string): PrivacySettings {
  const db = loadDb();
  const profile = db.profiles[userId];
  if (!profile) {
    return {
      showStats: true,
      showAchievements: true,
      showFriends: true,
      autoAcceptFriends: false,
    };
  }
  const migrated = migrateProfile({ ...profile }, db);
  return {
    showStats: migrated.showStats ?? true,
    showAchievements: migrated.showAchievements ?? true,
    showFriends: migrated.showFriends ?? true,
    autoAcceptFriends: migrated.autoAcceptFriends ?? false,
  };
}

export function syncPrivacySettings(userId: string, settings: PrivacySettings): void {
  const db = loadDb();
  const profile = db.profiles[userId];
  if (!profile) return;
  profile.showStats = settings.showStats;
  profile.showAchievements = settings.showAchievements;
  profile.showFriends = settings.showFriends;
  profile.autoAcceptFriends = settings.autoAcceptFriends;
  saveDb(db);
}

export function canViewUserStats(viewerId: string, targetUserId: string): boolean {
  if (viewerId === targetUserId) return true;
  return getProfilePrivacy(targetUserId).showStats;
}

export function canViewUserAchievements(viewerId: string, targetUserId: string): boolean {
  if (viewerId === targetUserId) return true;
  return getProfilePrivacy(targetUserId).showAchievements;
}

export function canViewUserFriends(viewerId: string, targetUserId: string): boolean {
  if (viewerId === targetUserId) return true;
  return getProfilePrivacy(targetUserId).showFriends;
}

function loadDb(): DbShape {
  try {
    let raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const legacyV4 = localStorage.getItem(DB_KEY_LEGACY_V4);
      if (legacyV4) {
        localStorage.setItem(DB_KEY, legacyV4);
        raw = legacyV4;
      } else {
        const legacyV3 = localStorage.getItem(DB_KEY_LEGACY_V3);
        if (legacyV3) {
          localStorage.setItem(DB_KEY, legacyV3);
          raw = legacyV3;
        } else {
          const legacyV2 = localStorage.getItem(DB_KEY_LEGACY_V2);
          if (legacyV2) {
            localStorage.setItem(DB_KEY, legacyV2);
            raw = legacyV2;
          }
        }
      }
    }
    if (!raw) return emptyDb();
    const parsed = { ...emptyDb(), ...JSON.parse(raw) };
    for (const userId of Object.keys(parsed.profiles)) {
      parsed.profiles[userId] = migrateProfile(parsed.profiles[userId], parsed);
    }
    if (!parsed.friendships) parsed.friendships = [];
    if (!parsed.directMessages) parsed.directMessages = [];
    if (!parsed.emailInvites) parsed.emailInvites = [];
    return parsed;
  } catch {
    return emptyDb();
  }
}

function saveDb(db: DbShape) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function roomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function getMeta(db: DbShape, userId: string): UserMeta {
  if (!db.meta[userId]) {
    db.meta[userId] = {
      roomsCreated: 0,
      messagesSent: 0,
      hasSat: false,
      roomsJoined: [],
      hiddenNooks: [],
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
    };
  } else {
    const m = db.meta[userId];
    if (!m.roomsJoined) m.roomsJoined = [];
    if (!m.hiddenNooks) m.hiddenNooks = [];
    if (!m.lastDeskSlotByRoom) m.lastDeskSlotByRoom = {};
    if (m.currentStreak == null) m.currentStreak = 0;
    if (m.longestStreak == null) m.longestStreak = 0;
    if (m.lastStudyDate === undefined) m.lastStudyDate = null;
  }
  return db.meta[userId];
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const msA = new Date(ay, am, ad).getTime();
  const msB = new Date(by, bm, bd).getTime();
  return Math.round((msB - msA) / (24 * 60 * 60 * 1000));
}

function updateStreak(db: DbShape, userId: string, durationMinutes: number) {
  if (durationMinutes < STREAK_MIN_MINUTES) return;

  const meta = getMeta(db, userId);
  const today = dateKey(new Date());

  if (meta.lastStudyDate === today) {
    return;
  }

  if (!meta.lastStudyDate) {
    meta.currentStreak = 1;
  } else {
    const gap = daysBetween(meta.lastStudyDate, today);
    if (gap === 1) {
      meta.currentStreak += 1;
    } else {
      meta.currentStreak = 1;
    }
  }

  meta.lastStudyDate = today;
  if (meta.currentStreak > meta.longestStreak) {
    meta.longestStreak = meta.currentStreak;
  }
}

function checkStreakAchievements(userId: string, longestStreak: number) {
  if (longestStreak >= 3) awardAchievement(userId, "streak_spark");
  if (longestStreak >= 7) awardAchievement(userId, "streak_week");
  if (longestStreak >= 14) awardAchievement(userId, "streak_fortnight");
  if (longestStreak >= 30) awardAchievement(userId, "streak_month");
  if (longestStreak >= 100) awardAchievement(userId, "streak_century");
}

async function delay<T>(value: T, ms = 80): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

type RealtimeMessage =
  | { type: "members"; roomId: string }
  | { type: "chat"; roomId: string }
  | { type: "friends"; userId: string }
  | { type: "dm"; userId: string; peerId: string }
  | { type: "userNooks"; userId: string };

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("nook-realtime") : null;

const memberListeners = new Map<string, Set<() => void>>();
const chatListeners = new Map<string, Set<() => void>>();
const friendListeners = new Map<string, Set<() => void>>();
const dmListeners = new Map<string, Set<() => void>>();
const userNooksListeners = new Map<string, Set<() => void>>();

function dmKey(userId: string, peerId: string): string {
  return [userId, peerId].sort().join(":");
}

function notifyRoom(roomId: string) {
  channel?.postMessage({ type: "members", roomId });
  memberListeners.get(roomId)?.forEach((cb) => cb());
}

function notifyChat(roomId: string) {
  channel?.postMessage({ type: "chat", roomId });
  chatListeners.get(roomId)?.forEach((cb) => cb());
}

function notifyFriends(userId: string) {
  channel?.postMessage({ type: "friends", userId });
  friendListeners.get(userId)?.forEach((cb) => cb());
}

function notifyDm(userId: string, peerId: string) {
  channel?.postMessage({ type: "dm", userId, peerId });
  dmListeners.get(dmKey(userId, peerId))?.forEach((cb) => cb());
}

function notifyUserNooks(userId: string) {
  channel?.postMessage({ type: "userNooks", userId });
  userNooksListeners.get(userId)?.forEach((cb) => cb());
}

channel?.addEventListener("message", (e: MessageEvent<RealtimeMessage>) => {
  if (e.data?.type === "members") {
    memberListeners.get(e.data.roomId)?.forEach((cb) => cb());
  }
  if (e.data?.type === "chat") {
    chatListeners.get(e.data.roomId)?.forEach((cb) => cb());
  }
  if (e.data?.type === "friends") {
    friendListeners.get(e.data.userId)?.forEach((cb) => cb());
  }
  if (e.data?.type === "dm") {
    dmListeners.get(dmKey(e.data.userId, e.data.peerId))?.forEach((cb) => cb());
  }
  if (e.data?.type === "userNooks") {
    userNooksListeners.get(e.data.userId)?.forEach((cb) => cb());
  }
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface Session {
  userId: string;
}

const authListeners = new Set<(session: Session | null) => void>();

function setSession(session: Session | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  authListeners.forEach((cb) => cb(session));
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

export function getMyUserId(): string | null {
  return getSession()?.userId ?? null;
}

export async function signUp(
  email: string,
  password: string,
  usernameInput?: string,
  inviter?: string
): Promise<Profile> {
  const db = loadDb();
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new Error("Email and password are required.");
  if (db.accounts.some((a) => a.email === normalized)) {
    throw new Error("An account with that email already exists.");
  }

  const username = usernameInput?.trim()
    ? (() => {
        const u = normalizeUsername(usernameInput);
        validateUsername(u);
        if (Object.values(db.profiles).some((p) => p.username === u)) {
          throw new Error("That username is already taken.");
        }
        return u;
      })()
    : ensureUniqueUsername(db, normalized.split("@")[0] || "friend");

  const userId = uid("user");
  db.accounts.push({ userId, email: normalized, password });

  const inviterUserId = resolveInviterId(db, inviter);
  const profile: Profile = {
    userId,
    email: normalized,
    displayName: username,
    username,
    avatarConfig: { ...DEFAULT_AVATAR_CONFIG },
    avatarCreated: false,
    profilePhotoUrl: null,
    bio: "",
    onlineStatus: "auto",
    lastActiveAt: Date.now(),
    pendingInviterUserId:
      inviterUserId && inviterUserId !== userId ? inviterUserId : undefined,
  };
  db.profiles[userId] = profile;
  getMeta(db, userId);
  processEmailInvitesOnSignup(db, userId, normalized);
  saveDb(db);
  setSession({ userId });
  return delay(profile);
}

export async function login(email: string, password: string): Promise<Profile> {
  const db = loadDb();
  const normalized = email.trim().toLowerCase();
  const account = db.accounts.find((a) => a.email === normalized);
  if (!account || account.password !== password) {
    throw new Error("Incorrect email or password.");
  }
  setSession({ userId: account.userId });
  return delay(db.profiles[account.userId]);
}

export async function logout(): Promise<void> {
  setSession(null);
  return delay(undefined);
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = loadDb();
  return delay(db.profiles[userId] ?? null, 40);
}

export async function updateAvatarConfig(
  userId: string,
  avatarConfig: AvatarConfig,
  markCreated = true
): Promise<Profile> {
  const db = loadDb();
  const profile = db.profiles[userId];
  if (!profile) throw new Error("Profile not found.");
  profile.avatarConfig = avatarConfig;
  if (markCreated) {
    profile.avatarCreated = true;
    processPendingInviter(db, userId);
  }
  saveDb(db);
  return delay(profile);
}

export interface ProfileUpdate {
  displayName?: string;
  bio?: string;
  profilePhotoUrl?: string | null;
  onlineStatus?: OnlineStatusMode;
}

export async function updateProfile(
  userId: string,
  update: ProfileUpdate
): Promise<Profile> {
  const db = loadDb();
  const profile = db.profiles[userId];
  if (!profile) throw new Error("Profile not found.");

  if (update.displayName !== undefined) {
    const name = update.displayName.trim();
    if (!name) throw new Error("Nickname cannot be empty.");
    profile.displayName = name.slice(0, 40);
  }
  if (update.bio !== undefined) {
    profile.bio = update.bio.trim().slice(0, 150);
  }
  if (update.profilePhotoUrl !== undefined) {
    profile.profilePhotoUrl = update.profilePhotoUrl;
  }
  if (update.onlineStatus !== undefined) {
    profile.onlineStatus = update.onlineStatus;
  }

  saveDb(db);
  notifyFriends(userId);
  return delay(profile);
}

export function syncOnlineStatus(userId: string, mode: OnlineStatusMode): void {
  const db = loadDb();
  const profile = db.profiles[userId];
  if (!profile) return;
  profile.onlineStatus = mode;
  saveDb(db);
  notifyFriends(userId);
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export async function createRoom(
  userId: string,
  name: string,
  capacity: number
): Promise<Room> {
  const db = loadDb();
  let code = roomCode();
  while (Object.values(db.rooms).some((r) => r.code === code)) code = roomCode();
  const cap = normalizeCapacity(capacity);
  const room: Room = {
    id: uid("room"),
    code,
    name: name.trim() || "Cozy Nook",
    createdBy: userId,
    capacity: cap,
    createdAt: Date.now(),
  };
  db.rooms[room.id] = room;
  const meta = getMeta(db, userId);
  meta.roomsCreated++;
  if (!meta.roomsJoined.includes(room.id)) {
    meta.roomsJoined.push(room.id);
  }
  saveDb(db);
  awardAchievement(userId, "first_nook");
  if (meta.roomsCreated >= 3) awardAchievement(userId, "room_host");
  if (meta.roomsCreated >= 5) awardAchievement(userId, "grand_librarian");
  return delay(room);
}

export async function findRoomByCode(code: string): Promise<Room | null> {
  const db = loadDb();
  const room = Object.values(db.rooms).find(
    (r) => r.code === code.trim().toUpperCase()
  );
  return delay(room ?? null);
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const db = loadDb();
  return delay(db.rooms[roomId] ?? null, 40);
}

// ---------------------------------------------------------------------------
// Room members / presence
// ---------------------------------------------------------------------------

export async function joinRoom(roomId: string, profile: Profile): Promise<RoomMember> {
  const db = loadDb();
  const room = db.rooms[roomId];
  if (!room) throw new Error("Room not found.");

  const existing = db.members.find(
    (m) => m.roomId === roomId && m.userId === profile.userId
  );
  if (existing) return delay(existing, 40);

  const memberCount = db.members.filter((m) => m.roomId === roomId).length;
  if (memberCount >= room.capacity) {
    throw new Error("This nook is full!");
  }

  const meta = getMeta(db, profile.userId);
  const remembered = meta.lastDeskSlotByRoom?.[roomId] ?? -1;
  let deskSlot = -1;
  if (remembered >= 0 && remembered < totalSeatCount(room.capacity)) {
    const taken = db.members.some(
      (m) => m.roomId === roomId && m.deskSlot === remembered
    );
    if (!taken) deskSlot = remembered;
  }

  const member: RoomMember = {
    roomId,
    userId: profile.userId,
    displayName: profile.displayName,
    avatarConfig: profile.avatarConfig,
    deskSlot,
    status: "idle",
    timerEndsAt: null,
    focusStartedAt: null,
    focusSessionId: null,
    updatedAt: Date.now(),
  };
  db.members.push(member);
  if (!meta.roomsJoined.includes(roomId)) {
    meta.roomsJoined.push(roomId);
    if (meta.roomsJoined.length === 1) awardAchievement(profile.userId, "welcome_aboard");
    if (meta.roomsJoined.length >= 5) awardAchievement(profile.userId, "social_explorer");
  }
  saveDb(db);
  notifyRoom(roomId);
  return delay(member, 40);
}

export async function changeSeat(
  roomId: string,
  userId: string,
  deskSlot: number
): Promise<void> {
  const db = loadDb();
  const room = db.rooms[roomId];
  if (!room) throw new Error("Room not found.");
  if (deskSlot < 0 || deskSlot >= totalSeatCount(room.capacity))
    throw new Error("Invalid seat.");

  const taken = db.members.some(
    (m) => m.roomId === roomId && m.deskSlot === deskSlot && m.userId !== userId
  );
  if (taken) throw new Error("That seat is taken.");

  const member = db.members.find(
    (m) => m.roomId === roomId && m.userId === userId
  );
  if (!member) throw new Error("Not in room.");

  member.deskSlot = deskSlot;
  member.updatedAt = Date.now();
  const meta = getMeta(db, userId);
  if (!meta.lastDeskSlotByRoom) meta.lastDeskSlotByRoom = {};
  meta.lastDeskSlotByRoom[roomId] = deskSlot;
  if (!meta.hasSat) {
    meta.hasSat = true;
    awardAchievement(userId, "seat_claimer");
  }
  saveDb(db);
  notifyRoom(roomId);
  return delay(undefined, 30);
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const db = loadDb();
  db.members = db.members.filter(
    (m) => !(m.roomId === roomId && m.userId === userId)
  );
  saveDb(db);
  notifyRoom(roomId);
  return delay(undefined, 20);
}

export function getRoomMembers(roomId: string): RoomMember[] {
  return loadDb()
    .members.filter((m) => m.roomId === roomId)
    .sort((a, b) => a.deskSlot - b.deskSlot);
}

export async function updateMemberStatus(
  roomId: string,
  userId: string,
  status: PresenceStatus,
  timerEndsAt: number | null
): Promise<void> {
  const db = loadDb();
  const member = db.members.find(
    (m) => m.roomId === roomId && m.userId === userId
  );
  if (member) {
    member.status = status;
    member.timerEndsAt = timerEndsAt;
    member.focusStartedAt = status === "studying" ? Date.now() : null;
    member.updatedAt = Date.now();
    saveDb(db);
    notifyRoom(roomId);
  }
  return delay(undefined, 15);
}

export function subscribeToRoom(roomId: string, cb: () => void): () => void {
  if (!memberListeners.has(roomId)) memberListeners.set(roomId, new Set());
  memberListeners.get(roomId)!.add(cb);
  return () => memberListeners.get(roomId)?.delete(cb);
}

export function getUserNooks(userId: string): UserNookSummary[] {
  const db = loadDb();
  const meta = getMeta(db, userId);
  const hidden = new Set(meta.hiddenNooks);
  const roomIds = new Set<string>(meta.roomsJoined);

  for (const room of Object.values(db.rooms)) {
    if (room.createdBy === userId) roomIds.add(room.id);
  }

  const summaries: UserNookSummary[] = [];
  for (const roomId of roomIds) {
    if (hidden.has(roomId)) continue;
    const room = db.rooms[roomId];
    if (!room) continue;

    const memberRecords = db.members.filter((m) => m.roomId === roomId);
    const members: UserNookMember[] = memberRecords.map((m) => {
      const profile = db.profiles[m.userId];
      const migrated = profile ? migrateProfile({ ...profile }, db) : null;
      return {
        userId: m.userId,
        displayName: m.displayName,
        username: migrated?.username ?? m.displayName,
        profilePhotoUrl: migrated?.profilePhotoUrl,
        onlineStatus: getUserOnlineStatusFromDb(m.userId, db),
        presenceStatus: m.status,
      };
    });

    summaries.push({
      id: room.id,
      name: room.name,
      code: room.code,
      capacity: room.capacity,
      memberCount: memberRecords.length,
      studyingCount: memberRecords.filter((m) => m.status === "studying").length,
      members,
      createdBy: room.createdBy,
      isOwner: room.createdBy === userId,
      createdAt: room.createdAt,
    });
  }

  return summaries.sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return b.createdAt - a.createdAt;
  });
}

export function subscribeToUserNooks(userId: string, cb: () => void): () => void {
  const unsubs: (() => void)[] = [];

  function setup() {
    unsubs.forEach((u) => u());
    unsubs.length = 0;
    for (const nook of getUserNooks(userId)) {
      unsubs.push(subscribeToRoom(nook.id, cb));
    }
  }

  const onUserNooksChange = () => {
    setup();
    cb();
  };

  if (!userNooksListeners.has(userId)) userNooksListeners.set(userId, new Set());
  userNooksListeners.get(userId)!.add(onUserNooksChange);

  setup();
  return () => {
    userNooksListeners.get(userId)?.delete(onUserNooksChange);
    unsubs.forEach((u) => u());
  };
}

function deleteRoomData(db: DbShape, roomId: string): void {
  delete db.rooms[roomId];
  db.members = db.members.filter((m) => m.roomId !== roomId);
  db.chat = db.chat.filter((m) => m.roomId !== roomId);
}

function removeNookFromUserInDb(db: DbShape, userId: string, roomId: string): boolean {
  const meta = getMeta(db, userId);
  meta.roomsJoined = meta.roomsJoined.filter((id) => id !== roomId);
  if (!meta.hiddenNooks.includes(roomId)) meta.hiddenNooks.push(roomId);

  const room = db.rooms[roomId];
  if (!room) return false;

  const isOwner = room.createdBy === userId;
  const otherMembers = db.members.filter(
    (m) => m.roomId === roomId && m.userId !== userId
  );
  const hadMember = db.members.some(
    (m) => m.roomId === roomId && m.userId === userId
  );

  db.members = db.members.filter(
    (m) => !(m.roomId === roomId && m.userId === userId)
  );

  if (isOwner && otherMembers.length === 0) {
    deleteRoomData(db, roomId);
    return true;
  }

  return hadMember;
}

export async function removeNookFromUser(userId: string, roomId: string): Promise<void> {
  const db = loadDb();
  const notifyRoomMembers = removeNookFromUserInDb(db, userId, roomId);
  saveDb(db);
  if (notifyRoomMembers) notifyRoom(roomId);
  notifyUserNooks(userId);
  return delay(undefined, 30);
}

export async function removeNooksFromUser(
  userId: string,
  roomIds: string[]
): Promise<void> {
  const db = loadDb();
  const roomsToNotify = new Set<string>();

  for (const roomId of roomIds) {
    if (removeNookFromUserInDb(db, userId, roomId)) {
      roomsToNotify.add(roomId);
    }
  }

  saveDb(db);
  for (const roomId of roomsToNotify) notifyRoom(roomId);
  notifyUserNooks(userId);
  return delay(undefined, 40);
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendChatMessage(
  roomId: string,
  userId: string,
  displayName: string,
  text: string
): Promise<ChatMessage> {
  const db = loadDb();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");
  const msg: ChatMessage = {
    id: uid("msg"),
    roomId,
    userId,
    displayName,
    text: trimmed.slice(0, 200),
    createdAt: Date.now(),
  };
  const roomMsgs = db.chat.filter((m) => m.roomId === roomId);
  const otherMsgs = db.chat.filter((m) => m.roomId !== roomId);
  db.chat = [...otherMsgs, ...roomMsgs.slice(-99), msg];
  const meta = getMeta(db, userId);
  meta.messagesSent++;
  saveDb(db);
  if (meta.messagesSent === 1) awardAchievement(userId, "first_chat");
  if (meta.messagesSent >= 5) awardAchievement(userId, "chatterbox");
  if (meta.messagesSent >= 25) awardAchievement(userId, "hello_library");
  if (meta.messagesSent >= 100) awardAchievement(userId, "century_whispers");
  notifyChat(roomId);
  return delay(msg, 20);
}

export function getChatMessages(roomId: string): ChatMessage[] {
  return loadDb()
    .chat.filter((m) => m.roomId === roomId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function subscribeToChat(roomId: string, cb: () => void): () => void {
  if (!chatListeners.has(roomId)) chatListeners.set(roomId, new Set());
  chatListeners.get(roomId)!.add(cb);
  return () => chatListeners.get(roomId)?.delete(cb);
}

// ---------------------------------------------------------------------------
// Study sessions / stats
// ---------------------------------------------------------------------------

/**
 * Commits whole minutes elapsed in the current focus segment to the store.
 * Accrued minutes fold into a single session per focus run (created lazily on
 * the first whole minute, reused across pause/resume) so the room board and the
 * user's stats both reflect real elapsed time as it accrues — not just on
 * completion — and nothing is lost on pause, stop, or leaving the room.
 * `focusStartedAt` is advanced by the committed minutes so live board time and
 * the saved session never double-count. Pass `finalize` to end the run.
 */
export function commitFocusProgress(
  roomId: string,
  userId: string,
  finalize = false
): void {
  const db = loadDb();
  const member = db.members.find(
    (m) => m.roomId === roomId && m.userId === userId
  );
  if (!member) return;

  let addedWholeMinutes = 0;
  let sessionTotalMinutes = 0;
  const startedAt = member.focusStartedAt;
  if (startedAt != null) {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if (elapsedSeconds > 0) {
      const existing = member.focusSessionId
        ? db.sessions.find((s) => s.id === member.focusSessionId)
        : undefined;
      const prevSeconds = existing ? sessionDurationSeconds(existing) : 0;
      if (existing) {
        existing.durationSeconds = prevSeconds + elapsedSeconds;
        existing.durationMinutes = Math.floor(existing.durationSeconds / 60);
        existing.completedAt = Date.now();
        if (!existing.roomId) existing.roomId = roomId;
      } else {
        const session: StudySession = {
          id: uid("sess"),
          userId,
          roomId,
          durationSeconds: elapsedSeconds,
          durationMinutes: Math.floor(elapsedSeconds / 60),
          completedAt: Date.now(),
        };
        db.sessions.push(session);
        member.focusSessionId = session.id;
      }
      member.focusStartedAt = startedAt + elapsedSeconds * 1000;
      const totalSeconds = prevSeconds + elapsedSeconds;
      sessionTotalMinutes = Math.floor(totalSeconds / 60);
      addedWholeMinutes =
        Math.floor(totalSeconds / 60) - Math.floor(prevSeconds / 60);
      if (addedWholeMinutes > 0) updateStreak(db, userId, addedWholeMinutes);
    }
  }

  if (finalize) member.focusSessionId = null;

  if (addedWholeMinutes > 0 || finalize) {
    saveDb(db);
    notifyRoom(roomId);
  }

  if (addedWholeMinutes > 0) {
    const meta = getMeta(loadDb(), userId);
    checkStreakAchievements(userId, meta.longestStreak);
    checkSessionAchievements(userId, sessionTotalMinutes);
  }
}

export async function recordSession(
  userId: string,
  durationMinutes: number,
  roomId?: string
): Promise<void> {
  const db = loadDb();
  db.sessions.push({
    id: uid("sess"),
    userId,
    roomId,
    durationMinutes,
    durationSeconds: durationMinutes * 60,
    completedAt: Date.now(),
  });
  updateStreak(db, userId, durationMinutes);
  saveDb(db);
  const meta = getMeta(loadDb(), userId);
  checkStreakAchievements(userId, meta.longestStreak);
  checkSessionAchievements(userId, durationMinutes);
  return delay(undefined, 15);
}

function getUserSessions(userId: string): StudySession[] {
  return loadDb().sessions.filter((s) => s.userId === userId);
}

function getQualifyingDayKeys(userId: string): Set<string> {
  return new Set(
    getUserSessions(userId)
      .filter((s) => s.durationMinutes >= STREAK_MIN_MINUTES)
      .map((s) => dateKey(new Date(s.completedAt)))
  );
}

function hasStudiedEveryDayForDays(userId: string, days: number): boolean {
  const dayKeys = getQualifyingDayKeys(userId);
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (!dayKeys.has(dateKey(d))) return false;
  }
  return true;
}

function countConsecutiveQualifyingDays(userId: string): number {
  const dayKeys = getQualifyingDayKeys(userId);
  const now = new Date();
  let count = 0;
  for (let i = 0; ; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (!dayKeys.has(dateKey(d))) break;
    count++;
  }
  return count;
}

function hasStudiedWithOthers(userId: string): boolean {
  const db = loadDb();
  const roomCounts = new Map<string, number>();
  for (const member of db.members) {
    roomCounts.set(member.roomId, (roomCounts.get(member.roomId) ?? 0) + 1);
  }
  return db.members.some(
    (member) => member.userId === userId && (roomCounts.get(member.roomId) ?? 0) >= 2
  );
}

function hasSessionMatching(userId: string, predicate: (session: StudySession) => boolean): boolean {
  return getUserSessions(userId).some(predicate);
}

function checkSessionAchievements(userId: string, durationMinutes: number) {
  awardAchievement(userId, "first_focus");

  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  if (hour >= 22) awardAchievement(userId, "night_owl");
  if (hour < 7) awardAchievement(userId, "early_bird");
  if (day === 0 || day === 6) awardAchievement(userId, "weekend_warrior");
  if (durationMinutes >= 45) awardAchievement(userId, "deep_focus");

  const stats = getStats(userId);
  if (stats.totalHours >= 5) awardAchievement(userId, "marathon");
  if (stats.totalHours >= 25) awardAchievement(userId, "focus_veteran");
  if (stats.totalHours >= 50) awardAchievement(userId, "half_century_hours");
  if (stats.totalHours >= 365) awardAchievement(userId, "lifetime_scholar");
  if (stats.weekSessions >= 3) awardAchievement(userId, "cozy_regular");
  if (stats.weekSessions >= 7) awardAchievement(userId, "weekly_champion");
  if (stats.todayMinutes >= 60) awardAchievement(userId, "daily_grind");

  const sessionCount = getUserSessions(userId).length;
  if (sessionCount >= 10) awardAchievement(userId, "ten_sessions");
  if (sessionCount >= 25) awardAchievement(userId, "quarter_century");
  if (sessionCount >= 100) awardAchievement(userId, "session_century");
  if (hasStudiedEveryDayForDays(userId, 30)) awardAchievement(userId, "perfect_month");
}

export function checkStudyBuddyAchievement(roomId: string, userId: string) {
  const members = getRoomMembers(roomId);
  if (members.length >= 2) {
    awardAchievement(userId, "study_buddy");
  }
}

export interface StudyStats {
  todayMinutes: number;
  weekSessions: number;
  totalHours: number;
}

export function getStreak(userId: string): StreakInfo {
  const db = loadDb();
  const meta = getMeta(db, userId);
  const today = dateKey(new Date());

  let current = meta.currentStreak;
  if (meta.lastStudyDate) {
    const gap = daysBetween(meta.lastStudyDate, today);
    if (gap > 1) current = 0;
  } else {
    current = 0;
  }

  const studiedToday = meta.lastStudyDate === today;
  const atRisk = !studiedToday && meta.lastStudyDate != null && daysBetween(meta.lastStudyDate, today) === 1;

  return {
    currentStreak: current,
    longestStreak: meta.longestStreak,
    studiedToday,
    atRisk,
  };
}

export function getStats(userId: string): StudyStats {
  const db = loadDb();
  const mine = db.sessions.filter((s) => s.userId === userId);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const todayMinutes = mine
    .filter((s) => s.completedAt >= startOfToday)
    .reduce((sum, s) => sum + s.durationMinutes, 0);
  const weekSessions = mine.filter((s) => s.completedAt >= weekAgo).length;
  const totalMinutes = mine.reduce((sum, s) => sum + s.durationMinutes, 0);

  return {
    todayMinutes,
    weekSessions,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

function awardAchievement(userId: string, achievementId: string) {
  const db = loadDb();
  if (!db.achievements[userId]) db.achievements[userId] = [];
  if (db.achievements[userId].some((a) => a.achievementId === achievementId)) return;
  db.achievements[userId].push({ achievementId, earnedAt: Date.now() });
  saveDb(db);
}

/** Public wrapper for shared-backend achievement hooks. */
export function grantAchievement(userId: string, achievementId: string) {
  awardAchievement(userId, achievementId);
}

export function getUserAchievements(userId: string): UserAchievement[] {
  return loadDb().achievements[userId] ?? [];
}

export interface AchievementProgress {
  current: number;
  required: number;
}

function capProgress(current: number, required: number): AchievementProgress {
  return { current: Math.min(Math.max(0, current), required), required };
}

function binaryProgress(done: boolean): AchievementProgress {
  return { current: done ? 1 : 0, required: 1 };
}

export function getAchievementProgress(
  userId: string,
  achievementId: string
): AchievementProgress {
  const meta = getMeta(loadDb(), userId);
  const stats = getStats(userId);
  const sessionCount = getUserSessions(userId).length;
  const totalHours = Math.floor(stats.totalHours);

  switch (achievementId) {
    case "first_focus":
      return capProgress(sessionCount, 1);
    case "first_nook":
      return capProgress(meta.roomsCreated, 1);
    case "seat_claimer":
      return binaryProgress(meta.hasSat);
    case "first_chat":
      return capProgress(meta.messagesSent, 1);
    case "welcome_aboard":
      return capProgress(meta.roomsJoined.length, 1);
    case "study_buddy":
      return binaryProgress(hasStudiedWithOthers(userId));
    case "chatterbox":
      return capProgress(meta.messagesSent, 5);
    case "night_owl":
      return binaryProgress(
        hasSessionMatching(
          userId,
          (s) => new Date(s.completedAt).getHours() >= 22
        )
      );
    case "early_bird":
      return binaryProgress(
        hasSessionMatching(userId, (s) => new Date(s.completedAt).getHours() < 7)
      );
    case "weekend_warrior":
      return binaryProgress(
        hasSessionMatching(userId, (s) => {
          const day = new Date(s.completedAt).getDay();
          return day === 0 || day === 6;
        })
      );
    case "streak_spark":
      return capProgress(meta.longestStreak, 3);
    case "ten_sessions":
      return capProgress(sessionCount, 10);
    case "marathon":
      return capProgress(totalHours, 5);
    case "room_host":
      return capProgress(meta.roomsCreated, 3);
    case "cozy_regular":
      return capProgress(stats.weekSessions, 3);
    case "streak_week":
      return capProgress(meta.longestStreak, 7);
    case "deep_focus":
      return binaryProgress(
        hasSessionMatching(userId, (s) => s.durationMinutes >= 45)
      );
    case "daily_grind":
      return capProgress(stats.todayMinutes, 60);
    case "social_explorer":
      return capProgress(meta.roomsJoined.length, 5);
    case "quarter_century":
      return capProgress(sessionCount, 25);
    case "streak_fortnight":
      return capProgress(meta.longestStreak, 14);
    case "hello_library":
      return capProgress(meta.messagesSent, 25);
    case "focus_veteran":
      return capProgress(totalHours, 25);
    case "weekly_champion":
      return capProgress(stats.weekSessions, 7);
    case "century_whispers":
      return capProgress(meta.messagesSent, 100);
    case "grand_librarian":
      return capProgress(meta.roomsCreated, 5);
    case "streak_month":
      return capProgress(meta.longestStreak, 30);
    case "perfect_month":
      return capProgress(countConsecutiveQualifyingDays(userId), 30);
    case "session_century":
      return capProgress(sessionCount, 100);
    case "half_century_hours":
      return capProgress(totalHours, 50);
    case "lifetime_scholar":
      return capProgress(totalHours, 365);
    case "streak_century":
      return capProgress(meta.longestStreak, 100);
    default:
      return { current: 0, required: 1 };
  }
}

export function formatAchievementProgress(progress: AchievementProgress): string {
  return `${progress.current}/${progress.required}`;
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

function isRecentlyActive(userId: string, db: DbShape): boolean {
  const profile = db.profiles[userId];
  const cutoff = Date.now() - ACTIVE_CUTOFF_MS;
  if (profile?.lastActiveAt && profile.lastActiveAt >= cutoff) return true;
  return db.members.some((m) => m.userId === userId && m.updatedAt >= cutoff);
}

export function getUserOnlineStatus(userId: string): OnlineStatus {
  const db = loadDb();
  const profile = db.profiles[userId];
  if (!profile) return "offline";
  const mode = profile.onlineStatus ?? "auto";
  if (mode === "dnd") return "dnd";
  if (mode === "offline") return "offline";
  return isRecentlyActive(userId, db) ? "online" : "offline";
}

export function syncLastActive(userId: string): void {
  const db = loadDb();
  const profile = db.profiles[userId];
  if (!profile) return;
  profile.lastActiveAt = Date.now();
  saveDb(db);
}

function getUserOnlineStatusFromDb(userId: string, db: DbShape): OnlineStatus {
  const profile = db.profiles[userId];
  if (!profile) return "offline";
  const mode = profile.onlineStatus ?? "auto";
  if (mode === "dnd") return "dnd";
  if (mode === "offline") return "offline";
  return isRecentlyActive(userId, db) ? "online" : "offline";
}

function findFriendshipBetween(
  db: DbShape,
  userA: string,
  userB: string
): Friendship | undefined {
  return db.friendships.find(
    (f) =>
      (f.fromUserId === userA && f.toUserId === userB) ||
      (f.fromUserId === userB && f.toUserId === userA)
  );
}

function createAcceptedFriendship(
  db: DbShape,
  userA: string,
  userB: string
): Friendship {
  const existing = findFriendshipBetween(db, userA, userB);
  if (existing) {
    if (existing.status !== "accepted") existing.status = "accepted";
    return existing;
  }
  const friendship: Friendship = {
    id: uid("fr"),
    fromUserId: userA,
    toUserId: userB,
    status: "accepted",
    createdAt: Date.now(),
  };
  db.friendships.push(friendship);
  return friendship;
}

function processEmailInvitesOnSignup(db: DbShape, userId: string, email: string) {
  const matching = db.emailInvites.filter((i) => i.toEmail === email);
  const inviterIds = new Set<string>();
  for (const invite of matching) {
    if (invite.fromUserId !== userId) {
      createAcceptedFriendship(db, userId, invite.fromUserId);
      inviterIds.add(invite.fromUserId);
    }
  }
  db.emailInvites = db.emailInvites.filter((i) => i.toEmail !== email);
  notifyFriends(userId);
  inviterIds.forEach((id) => notifyFriends(id));
}

function processPendingInviter(db: DbShape, userId: string) {
  const profile = db.profiles[userId];
  if (!profile?.pendingInviterUserId) return;
  const inviterId = profile.pendingInviterUserId;
  delete profile.pendingInviterUserId;
  if (!db.profiles[inviterId] || inviterId === userId) return;
  createAcceptedFriendship(db, userId, inviterId);
  notifyFriends(userId);
  notifyFriends(inviterId);
}

function findProfileByUserId(userId: string, db: DbShape): Profile | null {
  const profile = db.profiles[userId.trim()];
  return profile ? migrateProfile({ ...profile }, db) : null;
}

function findProfileByUsername(username: string, db: DbShape): Profile | null {
  const normalized = normalizeUsername(username);
  const profile = Object.values(db.profiles).find((p) => p.username === normalized);
  return profile ? migrateProfile({ ...profile }, db) : null;
}

function resolveInviterId(db: DbShape, inviter?: string): string | undefined {
  const trimmed = inviter?.trim().replace(/^@/, "");
  if (!trimmed) return undefined;
  const byUsername = findProfileByUsername(trimmed, db);
  if (byUsername) return byUsername.userId;
  const byId = findProfileByUserId(trimmed, db);
  return byId?.userId;
}

function getFriendUserIds(userId: string, db: DbShape): Set<string> {
  const ids = new Set<string>();
  for (const f of db.friendships) {
    if (f.status !== "accepted") continue;
    if (f.fromUserId === userId) ids.add(f.toUserId);
    if (f.toUserId === userId) ids.add(f.fromUserId);
  }
  return ids;
}

function getPendingUserIds(userId: string, db: DbShape): Set<string> {
  const ids = new Set<string>();
  for (const f of db.friendships) {
    if (f.status !== "pending") continue;
    if (f.fromUserId === userId) ids.add(f.toUserId);
    if (f.toUserId === userId) ids.add(f.fromUserId);
  }
  return ids;
}

export function searchUsersByUsername(
  query: string,
  selfUserId: string
): UserSearchResult[] {
  const db = loadDb();
  const q = normalizeUsername(query.replace(/^@/, ""));
  if (q.length < 1) return [];

  const friendIds = getFriendUserIds(selfUserId, db);
  const pendingIds = getPendingUserIds(selfUserId, db);

  return Object.values(db.profiles)
    .map((p) => migrateProfile({ ...p }, db))
    .filter((p) => {
      if (p.userId === selfUserId) return false;
      if (friendIds.has(p.userId)) return false;
      if (pendingIds.has(p.userId)) return false;
      return p.username.includes(q);
    })
    .slice(0, 12)
    .map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      username: p.username,
      profilePhotoUrl: p.profilePhotoUrl,
    }));
}

export async function sendEmailInvite(
  fromUserId: string,
  email: string
): Promise<EmailInviteResult> {
  const db = loadDb();
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }
  if (db.accounts.some((a) => a.email === normalized && a.userId === fromUserId)) {
    throw new Error("You can't invite yourself!");
  }

  const existingAccount = db.accounts.find((a) => a.email === normalized);
  if (existingAccount) {
    if (existingAccount.userId === fromUserId) {
      throw new Error("You can't invite yourself!");
    }
    const existing = findFriendshipBetween(db, fromUserId, existingAccount.userId);
    if (existing?.status === "accepted") {
      throw new Error("You're already friends!");
    }
    const friendship = createAcceptedFriendship(db, fromUserId, existingAccount.userId);
    saveDb(db);
    notifyFriends(fromUserId);
    notifyFriends(existingAccount.userId);
    return delay({ type: "instant", friendship });
  }

  const duplicate = db.emailInvites.some(
    (i) => i.fromUserId === fromUserId && i.toEmail === normalized
  );
  if (duplicate) throw new Error("You already sent an invitation to that email.");

  const invite: EmailInvite = {
    id: uid("inv"),
    fromUserId,
    toEmail: normalized,
    createdAt: Date.now(),
  };
  db.emailInvites.push(invite);
  saveDb(db);
  return delay({ type: "sent", invite });
}

export async function sendFriendRequestByUsername(
  fromUserId: string,
  username: string
): Promise<Friendship> {
  const db = loadDb();
  const target = findProfileByUsername(username, db);
  if (!target) throw new Error(`No user found with @${normalizeUsername(username)}.`);
  return sendFriendRequestByUserId(fromUserId, target.userId);
}

export async function sendFriendRequestByUserId(
  fromUserId: string,
  targetUserId: string
): Promise<Friendship> {
  const db = loadDb();
  const trimmed = targetUserId.trim();
  if (!trimmed) throw new Error("Please enter a username.");

  const target = findProfileByUserId(trimmed, db);
  if (!target) throw new Error("No user found.");
  if (target.userId === fromUserId) throw new Error("You can't friend yourself!");

  const existing = findFriendshipBetween(db, fromUserId, target.userId);
  if (existing) {
    if (existing.status === "accepted") throw new Error("You're already friends!");
    if (existing.fromUserId === fromUserId) {
      throw new Error("You already sent a request — awaiting reply.");
    }
    throw new Error("They already sent you a request — check your mailbox!");
  }

  if (target.autoAcceptFriends) {
    const friendship = createAcceptedFriendship(db, fromUserId, target.userId);
    saveDb(db);
    notifyFriends(fromUserId);
    notifyFriends(target.userId);
    return delay(friendship);
  }

  const friendship: Friendship = {
    id: uid("fr"),
    fromUserId,
    toUserId: target.userId,
    status: "pending",
    createdAt: Date.now(),
  };
  db.friendships.push(friendship);
  saveDb(db);
  notifyFriends(fromUserId);
  notifyFriends(target.userId);
  return delay(friendship);
}

export function getPendingRequests(userId: string): FriendRequestInfo[] {
  const db = loadDb();
  return db.friendships
    .filter((f) => f.toUserId === userId && f.status === "pending")
    .map((f) => {
      const profile = db.profiles[f.fromUserId];
      return {
        id: f.id,
        fromUserId: f.fromUserId,
        toUserId: f.toUserId,
        displayName: profile?.displayName ?? "Friend",
        username: profile?.username ?? profile?.email.split("@")[0] ?? "friend",
        profilePhotoUrl: profile?.profilePhotoUrl,
        createdAt: f.createdAt,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getSentRequests(userId: string): FriendRequestInfo[] {
  const db = loadDb();
  return db.friendships
    .filter((f) => f.fromUserId === userId && f.status === "pending")
    .map((f) => {
      const profile = db.profiles[f.toUserId];
      return {
        id: f.id,
        fromUserId: f.fromUserId,
        toUserId: f.toUserId,
        displayName: profile?.displayName ?? "Friend",
        username: profile?.username ?? profile?.email.split("@")[0] ?? "friend",
        profilePhotoUrl: profile?.profilePhotoUrl,
        createdAt: f.createdAt,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function acceptFriendRequest(
  requestId: string,
  userId: string
): Promise<void> {
  const db = loadDb();
  const friendship = db.friendships.find((f) => f.id === requestId);
  if (!friendship) throw new Error("Letter not found.");
  if (friendship.toUserId !== userId) throw new Error("This letter isn't for you.");
  if (friendship.status !== "pending") throw new Error("Already handled.");

  friendship.status = "accepted";
  saveDb(db);
  notifyFriends(friendship.fromUserId);
  notifyFriends(friendship.toUserId);
  return delay(undefined);
}

export async function declineFriendRequest(
  requestId: string,
  userId: string
): Promise<void> {
  const db = loadDb();
  const friendship = db.friendships.find((f) => f.id === requestId);
  if (!friendship) throw new Error("Letter not found.");
  if (friendship.toUserId !== userId) throw new Error("This letter isn't for you.");
  if (friendship.status !== "pending") throw new Error("Already handled.");

  const { fromUserId, toUserId } = friendship;
  db.friendships = db.friendships.filter((f) => f.id !== requestId);
  saveDb(db);
  notifyFriends(fromUserId);
  notifyFriends(toUserId);
  return delay(undefined);
}

export function getFriends(userId: string): FriendInfo[] {
  const db = loadDb();
  const friendIds = new Set<string>();
  for (const f of db.friendships) {
    if (f.status !== "accepted") continue;
    if (f.fromUserId === userId) friendIds.add(f.toUserId);
    if (f.toUserId === userId) friendIds.add(f.fromUserId);
  }
  const result: FriendInfo[] = [];
  for (const fid of friendIds) {
    const profile = db.profiles[fid];
    if (!profile) continue;
    const migrated = migrateProfile({ ...profile }, db);
    const onlineStatus = getUserOnlineStatusFromDb(fid, db);
    result.push({
      userId: fid,
      displayName: migrated.displayName,
      username: migrated.username,
      email: migrated.email,
      profilePhotoUrl: migrated.profilePhotoUrl,
      onlineStatus,
      online: onlineStatus === "online",
    });
  }
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function getVisibleFriends(
  viewerId: string,
  targetUserId: string
): FriendInfo[] | null {
  if (!canViewUserFriends(viewerId, targetUserId)) return null;
  return getFriends(targetUserId);
}

export function getVisibleAchievementCount(
  viewerId: string,
  targetUserId: string
): number | null {
  if (!canViewUserAchievements(viewerId, targetUserId)) return null;
  return getUserAchievements(targetUserId).length;
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  const db = loadDb();
  const friendship = findFriendshipBetween(db, userId, friendId);
  if (!friendship || friendship.status !== "accepted") {
    throw new Error("Friend not found.");
  }
  db.friendships = db.friendships.filter((f) => f.id !== friendship.id);
  saveDb(db);
  notifyFriends(userId);
  notifyFriends(friendId);
  return delay(undefined);
}

export function subscribeToFriends(userId: string, cb: () => void): () => void {
  if (!friendListeners.has(userId)) friendListeners.set(userId, new Set());
  friendListeners.get(userId)!.add(cb);
  return () => friendListeners.get(userId)?.delete(cb);
}

// ---------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------

export async function sendDirectMessage(
  fromUserId: string,
  toUserId: string,
  text: string
): Promise<DirectMessage> {
  const db = loadDb();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");

  const friendship = findFriendshipBetween(db, fromUserId, toUserId);
  if (!friendship || friendship.status !== "accepted") {
    throw new Error("You can only message friends.");
  }

  const msg: DirectMessage = {
    id: uid("dm"),
    fromUserId,
    toUserId,
    text: trimmed.slice(0, 500),
    createdAt: Date.now(),
  };
  db.directMessages.push(msg);
  saveDb(db);
  notifyDm(fromUserId, toUserId);
  return delay(msg);
}

export function getDirectMessages(userId: string, friendId: string): DirectMessage[] {
  return loadDb()
    .directMessages.filter(
      (m) =>
        (m.fromUserId === userId && m.toUserId === friendId) ||
        (m.fromUserId === friendId && m.toUserId === userId)
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function subscribeToDirectMessages(
  userId: string,
  friendId: string,
  cb: () => void
): () => void {
  const key = dmKey(userId, friendId);
  if (!dmListeners.has(key)) dmListeners.set(key, new Set());
  dmListeners.get(key)!.add(cb);
  return () => dmListeners.get(key)?.delete(cb);
}

// ---------------------------------------------------------------------------
// Friend leaderboard
// ---------------------------------------------------------------------------

export type LeaderboardMetric =
  | "streak"
  | "week_minutes"
  | "total_hours"
  | "week_sessions";

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  username: string;
  profilePhotoUrl?: string | null;
  avatarConfig?: AvatarConfig;
  currentStreak: number;
  totalFocusMinutes: number;
  weekFocusMinutes: number;
  weekSessions: number;
  totalHours: number;
  rank: number;
  onlineStatus: OnlineStatus;
  /** When true, the viewer cannot see this user's stats. */
  statsHidden?: boolean;
  /** @deprecated use onlineStatus */
  online: boolean;
}

function getWeekFocusMinutes(userId: string, db: DbShape): number {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return db.sessions
    .filter((s) => s.userId === userId && s.completedAt >= weekAgo)
    .reduce((sum, s) => sum + s.durationMinutes, 0);
}

function getTotalFocusMinutes(userId: string, db: DbShape): number {
  return db.sessions
    .filter((s) => s.userId === userId)
    .reduce((sum, s) => sum + s.durationMinutes, 0);
}

function buildLeaderboardEntry(
  userId: string,
  db: DbShape
): Omit<LeaderboardEntry, "rank"> | null {
  const profile = db.profiles[userId];
  if (!profile) return null;
  const migrated = migrateProfile(profile);
  const stats = getStats(userId);
  const streak = getStreak(userId);

  return {
    userId,
    displayName: migrated.displayName,
    username: migrated.username,
    profilePhotoUrl: migrated.profilePhotoUrl,
    avatarConfig: migrated.avatarConfig,
    currentStreak: streak.currentStreak,
    totalFocusMinutes: getTotalFocusMinutes(userId, db),
    weekFocusMinutes: getWeekFocusMinutes(userId, db),
    weekSessions: stats.weekSessions,
    totalHours: stats.totalHours,
    onlineStatus: getUserOnlineStatusFromDb(userId, db),
    online: getUserOnlineStatusFromDb(userId, db) === "online",
  };
}

function leaderboardMetricValue(
  entry: Omit<LeaderboardEntry, "rank">,
  metric: LeaderboardMetric
): number {
  switch (metric) {
    case "streak":
      return entry.currentStreak;
    case "week_minutes":
      return entry.weekFocusMinutes;
    case "total_hours":
      return entry.totalFocusMinutes;
    case "week_sessions":
      return entry.weekSessions;
  }
}

export function getFriendLeaderboard(
  userId: string,
  metric: LeaderboardMetric
): LeaderboardEntry[] {
  const db = loadDb();
  const participantIds = new Set<string>([userId]);
  for (const f of getFriends(userId)) {
    participantIds.add(f.userId);
  }

  const entries: Omit<LeaderboardEntry, "rank">[] = [];
  for (const id of participantIds) {
    const entry = buildLeaderboardEntry(id, db);
    if (entry) entries.push(entry);
  }

  entries.sort((a, b) => {
    const diff = leaderboardMetricValue(b, metric) - leaderboardMetricValue(a, metric);
    if (diff !== 0) return diff;
    return a.displayName.localeCompare(b.displayName);
  });

  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    statsHidden: !canViewUserStats(userId, entry.userId),
  }));
}

export function getFriendLeaderboardRank(
  userId: string,
  metric: LeaderboardMetric = "streak"
): { rank: number; total: number } | null {
  if (getFriends(userId).length === 0) return null;
  const board = getFriendLeaderboard(userId, metric);
  const self = board.find((e) => e.userId === userId);
  if (!self) return null;
  return { rank: self.rank, total: board.length };
}

export const LEADERBOARD_METRIC_LABELS: Record<LeaderboardMetric, string> = {
  streak: "Streak",
  week_minutes: "This week",
  total_hours: "Total hours",
  week_sessions: "Sessions",
};

// ---------------------------------------------------------------------------
// In-room social — avatar interaction cards + room study leaderboard
// ---------------------------------------------------------------------------

export type FriendshipStatus =
  | "self"
  | "friends"
  | "pending_outgoing"
  | "pending_incoming"
  | "none";

/** Relationship between two users — drives the avatar-click popup actions. */
export function getFriendshipStatus(
  userId: string,
  otherUserId: string
): FriendshipStatus {
  if (userId === otherUserId) return "self";
  const db = loadDb();
  const friendship = findFriendshipBetween(db, userId, otherUserId);
  if (!friendship) return "none";
  if (friendship.status === "accepted") return "friends";
  return friendship.fromUserId === userId ? "pending_outgoing" : "pending_incoming";
}

/** Lightweight, privacy-aware snapshot of a user shown in the avatar popup. */
export interface PublicUserCard {
  userId: string;
  displayName: string;
  username: string;
  profilePhotoUrl?: string | null;
  bio: string;
  onlineStatus: OnlineStatus;
  /** Presence within the room, when a roomId is supplied. */
  presenceStatus: PresenceStatus | null;
  isSelf: boolean;
  friendshipStatus: FriendshipStatus;
  /** null when the viewer is not allowed to see this user's stats. */
  stats: StudyStats | null;
}

export function getPublicUserCard(
  viewerId: string,
  targetUserId: string,
  roomId?: string
): PublicUserCard | null {
  const db = loadDb();
  const profile = db.profiles[targetUserId];
  if (!profile) return null;
  const migrated = migrateProfile({ ...profile }, db);
  const presenceStatus =
    roomId !== undefined
      ? db.members.find((m) => m.roomId === roomId && m.userId === targetUserId)
          ?.status ?? null
      : null;

  return {
    userId: targetUserId,
    displayName: migrated.displayName,
    username: migrated.username,
    profilePhotoUrl: migrated.profilePhotoUrl,
    bio: migrated.bio ?? "",
    onlineStatus: getUserOnlineStatusFromDb(targetUserId, db),
    presenceStatus,
    isSelf: viewerId === targetUserId,
    friendshipStatus: getFriendshipStatus(viewerId, targetUserId),
    stats: canViewUserStats(viewerId, targetUserId) ? getStats(targetUserId) : null,
  };
}

export type RoomLeaderboardPeriod = "daily" | "weekly";

export interface RoomLeaderboardEntry {
  userId: string;
  displayName: string;
  username: string;
  profilePhotoUrl?: string | null;
  onlineStatus: OnlineStatus;
  presenceStatus: PresenceStatus;
  /** Focus minutes in the selected period (0 when hidden from the viewer). */
  minutes: number;
  rank: number;
  /** True when the viewer may not see this member's stats. */
  statsHidden: boolean;
  isSelf: boolean;
}

/**
 * Ranks the members currently in a nook by focus minutes for the period.
 * Members who hide their stats are sorted last and surface as "Private".
 */
export function getRoomStudyLeaderboard(
  roomId: string,
  period: RoomLeaderboardPeriod,
  viewerId?: string
): RoomLeaderboardEntry[] {
  const db = loadDb();
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cutoff = period === "daily" ? startOfToday : weekAgo;

  const rows = db.members
    .filter((m) => m.roomId === roomId)
    .map((m) => {
      const profile = db.profiles[m.userId];
      const migrated = profile ? migrateProfile({ ...profile }, db) : null;
      const isSelf = viewerId === m.userId;
      const visible = isSelf || (migrated?.showStats ?? true);
      // Live, in-progress focus time for anyone currently studying — added on
      // top of saved sessions so the board ticks up in real time before the
      // session is persisted.
      const liveMinutes =
        m.status === "studying" && m.focusStartedAt
          ? Math.max(0, Date.now() - m.focusStartedAt) / (60 * 1000)
          : 0;
      const minutes = visible
        ? db.sessions
            .filter(
              (s) =>
                s.userId === m.userId &&
                s.roomId === roomId &&
                s.completedAt >= cutoff
            )
            .reduce((sum, s) => sum + sessionDurationSeconds(s) / 60, 0) +
          liveMinutes
        : 0;
      return {
        userId: m.userId,
        displayName: migrated?.displayName ?? m.displayName,
        username: migrated?.username ?? m.displayName,
        profilePhotoUrl: migrated?.profilePhotoUrl ?? null,
        onlineStatus: getUserOnlineStatusFromDb(m.userId, db),
        presenceStatus: m.status,
        minutes,
        statsHidden: !visible,
        isSelf,
      };
    });

  rows.sort((a, b) => {
    if (a.statsHidden !== b.statsHidden) return a.statsHidden ? 1 : -1;
    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
    return a.displayName.localeCompare(b.displayName);
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * Per-member study SECONDS for the current day (resets at local midnight):
 * the sum of today's saved session minutes plus the live in-progress portion
 * (`now - focusStartedAt`) when the member is actively studying. Mirrors the
 * leaderboard's daily fold, but at second resolution for the per-character
 * on-screen timer. Returns a `{ userId: seconds }` map for everyone in the room.
 */
export function getRoomDailyStudySeconds(roomId: string): Record<string, number> {
  const db = loadDb();
  const now = Date.now();
  const today = new Date(now);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();

  const result: Record<string, number> = {};
  for (const m of db.members.filter((mm) => mm.roomId === roomId)) {
    const savedSeconds = db.sessions
      .filter(
        (s) =>
          s.userId === m.userId &&
          s.roomId === roomId &&
          s.completedAt >= startOfToday
      )
      .reduce((sum, s) => sum + sessionDurationSeconds(s), 0);
    const liveSeconds =
      m.status === "studying" && m.focusStartedAt
        ? Math.max(0, (now - m.focusStartedAt) / 1000)
        : 0;
    result[m.userId] = savedSeconds + liveSeconds;
  }
  return result;
}

/** Formats focus minutes as "1h 20m" / "2h" / "45m". */
export function formatStudyMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}
