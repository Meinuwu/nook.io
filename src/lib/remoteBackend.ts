/**
 * Supabase-backed shared store for auth, profiles, friends, and nooks.
 * Used when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set.
 */
import { DEFAULT_AVATAR_CONFIG, type AvatarConfig, type PresenceStatus } from "./avatarTypes";
import { normalizeCapacity, totalSeatCount } from "../game/roomLayout";
import { supabase } from "./supabase/client";
import type {
  ChatMessage,
  DirectMessage,
  FriendInfo,
  FriendRequestInfo,
  Friendship,
  OnlineStatus,
  OnlineStatusMode,
  PrivacySettings,
  Profile,
  ProfileUpdate,
  PublicUserCard,
  Room,
  RoomMember,
  Session,
  UserNookMember,
  UserNookSummary,
  UserSearchResult,
} from "./mockBackend";
import type { RoomLeaderboardEntry, RoomLeaderboardPeriod } from "./mockBackend";
import {
  normalizeUsername,
  validateUsername,
  computeStudyStats,
  getStreak as getLocalStreak,
  applyStreakForSessionMinutes,
  upsertLocalStudySession,
  syncUserStudySessions,
  notifyStudyStats,
  subscribeToStudyStats,
  grantAchievement,
  STREAK_MIN_MINUTES,
  type StudySession,
} from "./mockBackend";

if (!supabase) {
  throw new Error(
    "remoteBackend loaded without a working Supabase client — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

const db = supabase;
const SESSION_KEY = "nook.session.v1";
const ACTIVE_CUTOFF_MS = 10 * 60 * 1000;

type ProfileRow = {
  user_id: string;
  email: string;
  display_name: string;
  username: string;
  avatar_config: AvatarConfig;
  avatar_created: boolean;
  profile_photo_url: string | null;
  bio: string | null;
  online_status: string;
  last_active_at: number | null;
  pending_inviter_user_id: string | null;
  show_stats: boolean;
  show_achievements: boolean;
  show_friends: boolean;
  auto_accept_friends: boolean;
};

type RoomRow = {
  id: string;
  code: string;
  name: string;
  created_by: string;
  capacity: number;
  created_at: number;
};

type MemberRow = {
  room_id: string;
  user_id: string;
  display_name: string;
  avatar_config: AvatarConfig;
  desk_slot: number;
  status: PresenceStatus;
  timer_ends_at: number | null;
  focus_started_at: number | null;
  focus_session_id: string | null;
  updated_at: number;
};

type FriendshipRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted";
  created_at: number;
};

const authListeners = new Set<(session: Session | null) => void>();
let cachedSession: Session | null = null;
let authReady: Promise<void> | null = null;

type StudySessionRow = {
  id: string;
  user_id: string;
  room_id: string | null;
  duration_seconds: number;
  duration_minutes: number;
  completed_at: number;
};

function sessionRowSeconds(row: StudySessionRow): number {
  return row.duration_seconds ?? row.duration_minutes * 60;
}

async function safeRemote<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[nook] ${label}:`, err);
    return fallback;
  }
}

function persistSession(session: Session | null) {
  cachedSession = session;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function notifyAuthListeners(session: Session | null) {
  authListeners.forEach((cb) => {
    try {
      cb(session);
    } catch (err) {
      console.warn("[nook] Auth listener failed:", err);
    }
  });
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

function rowToProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    username: row.username,
    avatarConfig: row.avatar_config ?? { ...DEFAULT_AVATAR_CONFIG },
    avatarCreated: row.avatar_created,
    profilePhotoUrl: row.profile_photo_url,
    bio: row.bio ?? "",
    onlineStatus: (row.online_status as OnlineStatusMode) ?? "auto",
    lastActiveAt: row.last_active_at ?? undefined,
    pendingInviterUserId: row.pending_inviter_user_id ?? undefined,
    showStats: row.show_stats,
    showAchievements: row.show_achievements,
    showFriends: row.show_friends,
    autoAcceptFriends: row.auto_accept_friends,
  };
}

function rowToRoom(row: RoomRow): Room {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    createdBy: row.created_by,
    capacity: row.capacity,
    createdAt: row.created_at,
  };
}

function rowToMember(row: MemberRow): RoomMember {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarConfig: row.avatar_config ?? { ...DEFAULT_AVATAR_CONFIG },
    deskSlot: row.desk_slot,
    status: row.status,
    timerEndsAt: row.timer_ends_at,
    focusStartedAt: row.focus_started_at,
    focusSessionId: row.focus_session_id,
    updatedAt: row.updated_at,
  };
}

function setSession(session: Session | null, notify = true) {
  persistSession(session);
  if (notify) notifyAuthListeners(session);
}

function isRecentlyActive(profile: ProfileRow | null, updatedAt?: number): boolean {
  const cutoff = Date.now() - ACTIVE_CUTOFF_MS;
  if (profile?.last_active_at && profile.last_active_at >= cutoff) return true;
  return (updatedAt ?? 0) >= cutoff;
}

function onlineStatusFromProfile(
  profile: ProfileRow | null,
  memberUpdatedAt?: number
): OnlineStatus {
  if (!profile) return "offline";
  const mode = profile.online_status ?? "auto";
  if (mode === "dnd") return "dnd";
  if (mode === "offline") return "offline";
  return isRecentlyActive(profile, memberUpdatedAt) ? "online" : "offline";
}

const profileCache = new Map<string, ProfileRow>();

async function fetchProfile(userId: string): Promise<Profile | null> {
  const row = await fetchProfileRow(userId);
  return row ? rowToProfile(row) : null;
}

async function fetchProfileRow(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data as ProfileRow | null) ?? null;
  if (row) profileCache.set(userId, row);
  return row;
}

function canViewRemoteStats(viewerId: string, targetUserId: string): boolean {
  if (viewerId === targetUserId) return true;
  return profileCache.get(targetUserId)?.show_stats ?? true;
}

async function findProfileByUsername(username: string): Promise<Profile | null> {
  const normalized = normalizeUsername(username);
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("username", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToProfile(data as ProfileRow) : null;
}

async function resolveInviterId(inviter?: string): Promise<string | undefined> {
  const trimmed = inviter?.trim().replace(/^@/, "");
  if (!trimmed) return undefined;
  const byUsername = await findProfileByUsername(trimmed);
  if (byUsername) return byUsername.userId;
  const profile = await fetchProfile(trimmed);
  return profile?.userId;
}

async function ensureUniqueUsername(base: string, excludeUserId?: string): Promise<string> {
  let candidate = normalizeUsername(base);
  if (!/^[a-z0-9_]{3,20}$/.test(candidate)) candidate = "friend";
  let suffix = 0;
  while (true) {
    const { data } = await db
      .from("profiles")
      .select("user_id")
      .eq("username", candidate)
      .maybeSingle();
    if (!data || data.user_id === excludeUserId) return candidate;
    suffix += 1;
    const stem = candidate.slice(0, Math.max(3, 20 - String(suffix).length - 1));
    candidate = `${stem}_${suffix}`;
  }
}

type ProfileHints = {
  email?: string;
  username?: string;
  pendingInviterUserId?: string | null;
};

function buildProfileRow(
  userId: string,
  email: string,
  username: string,
  pendingInviterUserId: string | null = null
): ProfileRow {
  return {
    user_id: userId,
    email,
    display_name: username,
    username,
    avatar_config: { ...DEFAULT_AVATAR_CONFIG },
    avatar_created: false,
    profile_photo_url: null,
    bio: "",
    online_status: "auto",
    last_active_at: Date.now(),
    pending_inviter_user_id: pendingInviterUserId,
    show_stats: true,
    show_achievements: true,
    show_friends: true,
    auto_accept_friends: false,
  };
}

async function ensureProfileForUser(
  userId: string,
  hints: ProfileHints = {}
): Promise<Profile> {
  const existing = await fetchProfile(userId);
  if (existing) {
    if (
      hints.pendingInviterUserId &&
      hints.pendingInviterUserId !== userId &&
      !existing.pendingInviterUserId
    ) {
      const { data, error } = await db
        .from("profiles")
        .update({ pending_inviter_user_id: hints.pendingInviterUserId })
        .eq("user_id", userId)
        .select("*")
        .single();
      if (!error && data) return rowToProfile(data as ProfileRow);
    }
    return existing;
  }

  const {
    data: { user },
    error: userErr,
  } = await db.auth.getUser();
  if (userErr || !user || user.id !== userId) {
    throw new Error("Could not load your account. Try signing out and back in.");
  }

  const email = (hints.email ?? user.email ?? "").trim().toLowerCase();
  const metaUsername =
    hints.username ??
    (typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username
      : undefined);

  let username: string;
  if (metaUsername?.trim()) {
    username = normalizeUsername(metaUsername);
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      username = await ensureUniqueUsername(email.split("@")[0] || "friend", userId);
    } else {
      const taken = await findProfileByUsername(username);
      if (taken && taken.userId !== userId) {
        username = await ensureUniqueUsername(username, userId);
      }
    }
  } else {
    username = await ensureUniqueUsername(email.split("@")[0] || "friend", userId);
  }

  const inviterId =
    hints.pendingInviterUserId && hints.pendingInviterUserId !== userId
      ? hints.pendingInviterUserId
      : null;

  const profileRow = buildProfileRow(userId, email, username, inviterId);
  const { error: insertErr } = await db.from("profiles").insert(profileRow);
  if (insertErr) {
    const retry = await fetchProfile(userId);
    if (retry) return retry;
    console.error("[nook] Profile create failed:", insertErr.message);
    throw new Error(
      "Your account exists but setup failed. Try again in a moment or contact support."
    );
  }

  return rowToProfile(profileRow);
}

async function createAcceptedFriendship(userA: string, userB: string): Promise<Friendship> {
  const { data: existingRows, error: findErr } = await db
    .from("friendships")
    .select("*")
    .or(
      `and(from_user_id.eq.${userA},to_user_id.eq.${userB}),and(from_user_id.eq.${userB},to_user_id.eq.${userA})`
    )
    .limit(1);
  if (findErr) throw new Error(findErr.message);

  const existing = (existingRows?.[0] as FriendshipRow | undefined) ?? undefined;
  if (existing) {
    if (existing.status !== "accepted") {
      const { error } = await db
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return {
      id: existing.id,
      fromUserId: existing.from_user_id,
      toUserId: existing.to_user_id,
      status: "accepted",
      createdAt: existing.created_at,
    };
  }

  const friendship: Friendship = {
    id: uid("fr"),
    fromUserId: userA,
    toUserId: userB,
    status: "accepted",
    createdAt: Date.now(),
  };
  const { error } = await db.from("friendships").insert({
    id: friendship.id,
    from_user_id: userA,
    to_user_id: userB,
    status: "accepted",
    created_at: friendship.createdAt,
  });
  if (error) throw new Error(error.message);
  return friendship;
}

async function processPendingInviter(userId: string): Promise<void> {
  const profile = await fetchProfileRow(userId);
  if (!profile?.pending_inviter_user_id) return;
  const inviterId = profile.pending_inviter_user_id;
  await db
    .from("profiles")
    .update({ pending_inviter_user_id: null })
    .eq("user_id", userId);
  const inviter = await fetchProfileRow(inviterId);
  if (!inviter || inviterId === userId) return;
  await createAcceptedFriendship(userId, inviterId);
}

async function upsertRoomMeta(userId: string, roomId: string, hidden = false) {
  const { error } = await db.from("user_room_meta").upsert(
    { user_id: userId, room_id: roomId, hidden },
    { onConflict: "user_id,room_id" }
  );
  if (error) throw new Error(error.message);
}

export async function initRemoteBackend(): Promise<void> {
  if (authReady) return authReady;
  authReady = (async () => {
    const { data } = await db.auth.getSession();
    setSession(data.session ? { userId: data.session.user.id } : null, false);
    db.auth.onAuthStateChange((event, session) => {
      const next = session ? { userId: session.user.id } : null;
      const prevUserId = cachedSession?.userId ?? null;
      persistSession(next);
      if (event === "TOKEN_REFRESHED" && next?.userId === prevUserId) return;
      if (event === "INITIAL_SESSION") return;
      notifyAuthListeners(next);
    });
    notifyAuthListeners(cachedSession);
  })();
  return authReady;
}

export async function resetPasswordForEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Email is required.");
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://nook-io.vercel.app";
  const { error } = await db.auth.resetPasswordForEmail(normalized, {
    redirectTo: `${origin}/reset-password`,
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate") || msg.includes("limit")) {
      throw new Error("Too many attempts — wait a minute and try again.");
    }
    throw new Error("Could not send reset email. Check the address and try again.");
  }
}

export async function updatePassword(newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error("Password must be at least 6 characters.");
  const { error } = await db.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export function getSession(): Session | null {
  if (cachedSession) return cachedSession;
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
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new Error("Email and password are required.");

  const username = usernameInput?.trim()
    ? (() => {
        const u = normalizeUsername(usernameInput);
        validateUsername(u);
        return u;
      })()
    : await ensureUniqueUsername(normalized.split("@")[0] || "friend");

  if (usernameInput?.trim()) {
    const taken = await findProfileByUsername(username);
    if (taken) throw new Error("That username is already taken.");
  }

  const inviterUserId = await resolveInviterId(inviter);

  const { data, error } = await db.auth.signUp({
    email: normalized,
    password,
    options: {
      data: {
        username,
        display_name: username,
      },
    },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Sign up failed — please try again.");

  const userId = data.user.id;
  const resolvedInviter =
    inviterUserId && inviterUserId !== userId ? inviterUserId : null;

  if (!data.session) {
    throw new Error(
      "Check your email to confirm your account, or disable email confirmation in Supabase Auth settings."
    );
  }

  setSession({ userId });
  return ensureProfileForUser(userId, {
    email: normalized,
    username,
    pendingInviterUserId: resolvedInviter,
  });
}

export async function login(email: string, password: string): Promise<Profile> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await db.auth.signInWithPassword({
    email: normalized,
    password,
  });
  if (error) throw new Error("Incorrect email or password.");
  const userId = data.user.id;
  setSession({ userId });
  return ensureProfileForUser(userId, { email: normalized });
}

export async function logout(): Promise<void> {
  await db.auth.signOut();
  setSession(null);
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const profile = await fetchProfile(userId);
  if (profile) return profile;
  if (getMyUserId() === userId) {
    try {
      return await ensureProfileForUser(userId);
    } catch (err) {
      console.warn("[nook] Could not auto-create profile:", err);
      return null;
    }
  }
  return null;
}

export async function updateAvatarConfig(
  userId: string,
  avatarConfig: AvatarConfig,
  markCreated = true
): Promise<Profile> {
  const updates: Record<string, unknown> = { avatar_config: avatarConfig };
  if (markCreated) updates.avatar_created = true;

  const { data, error } = await db
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (markCreated) await processPendingInviter(userId);
  return rowToProfile(data as ProfileRow);
}

export async function updateProfile(userId: string, update: ProfileUpdate): Promise<Profile> {
  const updates: Record<string, unknown> = {};
  if (update.displayName !== undefined) {
    const name = update.displayName.trim();
    if (!name) throw new Error("Nickname cannot be empty.");
    updates.display_name = name.slice(0, 40);
  }
  if (update.bio !== undefined) updates.bio = update.bio.trim().slice(0, 150);
  if (update.profilePhotoUrl !== undefined) updates.profile_photo_url = update.profilePhotoUrl;
  if (update.onlineStatus !== undefined) updates.online_status = update.onlineStatus;

  const { data, error } = await db
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToProfile(data as ProfileRow);
}

export function syncOnlineStatus(userId: string, mode: OnlineStatusMode): void {
  void db.from("profiles").update({ online_status: mode }).eq("user_id", userId);
}

export function syncLastActive(userId: string): void {
  void db.from("profiles").update({ last_active_at: Date.now() }).eq("user_id", userId);
}

export async function getProfilePrivacy(userId: string): Promise<PrivacySettings> {
  const profile = await fetchProfile(userId);
  if (!profile) {
    return {
      showStats: true,
      showAchievements: true,
      showFriends: true,
      autoAcceptFriends: false,
    };
  }
  return {
    showStats: profile.showStats ?? true,
    showAchievements: profile.showAchievements ?? true,
    showFriends: profile.showFriends ?? true,
    autoAcceptFriends: profile.autoAcceptFriends ?? false,
  };
}

export function getProfilePrivacySync(userId: string): PrivacySettings {
  const profile = profileCache.get(userId);
  if (!profile) {
    return {
      showStats: true,
      showAchievements: true,
      showFriends: true,
      autoAcceptFriends: false,
    };
  }
  return {
    showStats: profile.show_stats,
    showAchievements: profile.show_achievements,
    showFriends: profile.show_friends,
    autoAcceptFriends: profile.auto_accept_friends,
  };
}

export async function syncPrivacySettings(userId: string, settings: PrivacySettings): Promise<void> {
  const { error } = await db
    .from("profiles")
    .update({
      show_stats: settings.showStats,
      show_achievements: settings.showAchievements,
      show_friends: settings.showFriends,
      auto_accept_friends: settings.autoAcceptFriends,
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function createRoom(
  userId: string,
  name: string,
  capacity: number
): Promise<Room> {
  let code = roomCode();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: existing } = await db.from("rooms").select("id").eq("code", code).maybeSingle();
    if (!existing) break;
    code = roomCode();
  }

  const cap = normalizeCapacity(capacity);
  const room: Room = {
    id: uid("room"),
    code,
    name: name.trim() || "Cozy Nook",
    createdBy: userId,
    capacity: cap,
    createdAt: Date.now(),
  };

  const { error } = await db.from("rooms").insert({
    id: room.id,
    code: room.code,
    name: room.name,
    created_by: room.createdBy,
    capacity: room.capacity,
    created_at: room.createdAt,
  });
  if (error) throw new Error(error.message);

  await upsertRoomMeta(userId, room.id, false);
  return room;
}

export async function findRoomByCode(code: string): Promise<Room | null> {
  const { data, error } = await db
    .from("rooms")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRoom(data as RoomRow) : null;
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await db.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRoom(data as RoomRow) : null;
}

export async function joinRoom(roomId: string, profile: Profile): Promise<RoomMember> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("Room not found.");

  const { data: existing } = await db
    .from("room_members")
    .select("*")
    .eq("room_id", roomId)
    .eq("user_id", profile.userId)
    .maybeSingle();
  if (existing) return rowToMember(existing as MemberRow);

  const { count, error: countErr } = await db
    .from("room_members")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) >= room.capacity) throw new Error("This nook is full!");

  const { data: meta } = await db
    .from("user_room_meta")
    .select("last_desk_slot")
    .eq("user_id", profile.userId)
    .eq("room_id", roomId)
    .maybeSingle();

  let deskSlot = -1;
  const remembered = meta?.last_desk_slot ?? -1;
  if (remembered >= 0 && remembered < totalSeatCount(room.capacity)) {
    const { data: taken } = await db
      .from("room_members")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("desk_slot", remembered)
      .maybeSingle();
    if (!taken) deskSlot = remembered;
  }

  const memberRow = {
    room_id: roomId,
    user_id: profile.userId,
    display_name: profile.displayName,
    avatar_config: profile.avatarConfig,
    desk_slot: deskSlot,
    status: "idle" as PresenceStatus,
    timer_ends_at: null,
    focus_started_at: null,
    focus_session_id: null,
    updated_at: Date.now(),
  };

  const { error } = await db.from("room_members").insert(memberRow);
  if (error) throw new Error(error.message);

  await upsertRoomMeta(profile.userId, roomId, false);
  return rowToMember(memberRow as MemberRow);
}

export async function changeSeat(
  roomId: string,
  userId: string,
  deskSlot: number
): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("Room not found.");
  if (deskSlot < 0 || deskSlot >= totalSeatCount(room.capacity)) {
    throw new Error("Invalid seat.");
  }

  const { data: taken } = await db
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("desk_slot", deskSlot)
    .neq("user_id", userId)
    .maybeSingle();
  if (taken) throw new Error("That seat is taken.");

  const { error } = await db
    .from("room_members")
    .update({ desk_slot: deskSlot, updated_at: Date.now() })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  await db.from("user_room_meta").upsert(
    { user_id: userId, room_id: roomId, last_desk_slot: deskSlot, hidden: false },
    { onConflict: "user_id,room_id" }
  );
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const { error } = await db
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

async function loadRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await db
    .from("room_members")
    .select("*")
    .eq("room_id", roomId)
    .order("desk_slot", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as MemberRow[] | null)?.map(rowToMember) ?? [];
}

export async function updateMemberStatus(
  roomId: string,
  userId: string,
  status: PresenceStatus,
  timerEndsAt: number | null
): Promise<void> {
  const { error } = await db
    .from("room_members")
    .update({
      status,
      timer_ends_at: timerEndsAt,
      focus_started_at: status === "studying" ? Date.now() : null,
      updated_at: Date.now(),
    })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

const memberListeners = new Map<string, Set<() => void>>();
const memberPollers = new Map<string, ReturnType<typeof setInterval>>();
const memberChannels = new Map<string, ReturnType<typeof db.channel>>();

function removeRealtimeChannel(channel: ReturnType<typeof db.channel> | undefined) {
  if (channel) void db.removeChannel(channel);
}

function notifyRoom(roomId: string) {
  void safeRemote(`room members poll (${roomId})`, () => refreshRoomMembersCache(roomId), []).then(
    () => {
      memberListeners.get(roomId)?.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          console.warn("[nook] Room listener failed:", err);
        }
      });
    }
  );
}

export function subscribeToRoom(roomId: string, cb: () => void): () => void {
  if (!memberListeners.has(roomId)) memberListeners.set(roomId, new Set());
  memberListeners.get(roomId)!.add(cb);

  if (!memberPollers.has(roomId)) {
    memberPollers.set(
      roomId,
      setInterval(() => notifyRoom(roomId), 2000)
    );
    const channel = db
      .channel(`room-members:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
        () => notifyRoom(roomId)
      )
      .subscribe();
    memberChannels.set(roomId, channel);
  }

  return () => {
    memberListeners.get(roomId)?.delete(cb);
    if (memberListeners.get(roomId)?.size === 0) {
      memberListeners.delete(roomId);
      clearInterval(memberPollers.get(roomId));
      memberPollers.delete(roomId);
      removeRealtimeChannel(memberChannels.get(roomId));
      memberChannels.delete(roomId);
    }
  };
}

export async function sendChatMessage(
  roomId: string,
  userId: string,
  displayName: string,
  text: string
): Promise<ChatMessage> {
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
  const { error } = await db.from("chat_messages").insert({
    id: msg.id,
    room_id: roomId,
    user_id: userId,
    display_name: displayName,
    text: msg.text,
    created_at: msg.createdAt,
  });
  if (error) throw new Error(error.message);
  return msg;
}

async function loadChatMessages(roomId: string): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (
    (data ?? []).map((row) => ({
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      displayName: row.display_name,
      text: row.text,
      createdAt: row.created_at,
    })) ?? []
  );
}

const chatCache = new Map<string, ChatMessage[]>();

export function getChatMessages(roomId: string): ChatMessage[] {
  return chatCache.get(roomId) ?? [];
}

export async function refreshChatCache(roomId: string): Promise<ChatMessage[]> {
  return safeRemote(
    `load chat (${roomId})`,
    async () => {
      const messages = await loadChatMessages(roomId);
      chatCache.set(roomId, messages);
      return messages;
    },
    chatCache.get(roomId) ?? []
  );
}

const chatListeners = new Map<string, Set<() => void>>();
const chatPollers = new Map<string, ReturnType<typeof setInterval>>();
const chatChannels = new Map<string, ReturnType<typeof db.channel>>();

export function subscribeToChat(roomId: string, cb: () => void): () => void {
  if (!chatListeners.has(roomId)) chatListeners.set(roomId, new Set());
  chatListeners.get(roomId)!.add(cb);

  if (!chatPollers.has(roomId)) {
    const notify = () => {
      void safeRemote(`chat poll (${roomId})`, () => refreshChatCache(roomId), []).then(() => {
        chatListeners.get(roomId)?.forEach((fn) => {
          try {
            fn();
          } catch (err) {
            console.warn("[nook] Chat listener failed:", err);
          }
        });
      });
    };
    notify();
    chatPollers.set(roomId, setInterval(notify, 2000));
    const channel = db
      .channel(`room-chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        notify
      )
      .subscribe();
    chatChannels.set(roomId, channel);
  }

  return () => {
    chatListeners.get(roomId)?.delete(cb);
    if (chatListeners.get(roomId)?.size === 0) {
      chatListeners.delete(roomId);
      clearInterval(chatPollers.get(roomId));
      chatPollers.delete(roomId);
      removeRealtimeChannel(chatChannels.get(roomId));
      chatChannels.delete(roomId);
    }
  };
}

const userNooksCache = new Map<string, UserNookSummary[]>();

export function getUserNooks(userId: string): UserNookSummary[] {
  return userNooksCache.get(userId) ?? [];
}

async function loadUserNooks(userId: string): Promise<UserNookSummary[]> {
  const { data: metaRows, error: metaErr } = await db
    .from("user_room_meta")
    .select("room_id, hidden")
    .eq("user_id", userId);
  if (metaErr) throw new Error(metaErr.message);

  const hidden = new Set(
    (metaRows ?? []).filter((r) => r.hidden).map((r) => r.room_id as string)
  );
  const roomIds = new Set<string>(
    (metaRows ?? []).filter((r) => !r.hidden).map((r) => r.room_id as string)
  );

  const { data: owned, error: ownedErr } = await db
    .from("rooms")
    .select("id")
    .eq("created_by", userId);
  if (ownedErr) throw new Error(ownedErr.message);
  for (const row of owned ?? []) roomIds.add(row.id);

  const summaries: UserNookSummary[] = [];
  for (const roomId of roomIds) {
    if (hidden.has(roomId)) continue;
    const room = await getRoom(roomId);
    if (!room) continue;

    const members = await loadRoomMembers(roomId);
    const profileRows = await Promise.all(members.map((m) => fetchProfileRow(m.userId)));

    const nookMembers: UserNookMember[] = members.map((m, i) => ({
      userId: m.userId,
      displayName: m.displayName,
      username: profileRows[i]?.username ?? m.displayName,
      profilePhotoUrl: profileRows[i]?.profile_photo_url,
      onlineStatus: onlineStatusFromProfile(profileRows[i], m.updatedAt),
      presenceStatus: m.status,
    }));

    summaries.push({
      id: room.id,
      name: room.name,
      code: room.code,
      capacity: room.capacity,
      memberCount: members.length,
      studyingCount: members.filter((m) => m.status === "studying").length,
      members: nookMembers,
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

export async function refreshUserNooksCache(userId: string): Promise<UserNookSummary[]> {
  const summaries = await loadUserNooks(userId);
  userNooksCache.set(userId, summaries);
  return summaries;
}

const userNooksListeners = new Map<string, Set<() => void>>();
const userNooksPollers = new Map<string, ReturnType<typeof setInterval>>();

function notifyUserNooks(userId: string) {
  void safeRemote(
    `user nooks (${userId})`,
    () => refreshUserNooksCache(userId),
    userNooksCache.get(userId) ?? []
  ).then(() => {
    userNooksListeners.get(userId)?.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.warn("[nook] User nooks listener failed:", err);
      }
    });
  });
}

export function subscribeToUserNooks(userId: string, cb: () => void): () => void {
  if (!userNooksListeners.has(userId)) userNooksListeners.set(userId, new Set());
  userNooksListeners.get(userId)!.add(cb);

  if (!userNooksPollers.has(userId)) {
    userNooksPollers.set(userId, setInterval(() => notifyUserNooks(userId), 4000));
  }

  notifyUserNooks(userId);

  return () => {
    userNooksListeners.get(userId)?.delete(cb);
    if (userNooksListeners.get(userId)?.size === 0) {
      userNooksListeners.delete(userId);
      clearInterval(userNooksPollers.get(userId));
      userNooksPollers.delete(userId);
    }
  };
}

export async function removeNookFromUser(userId: string, roomId: string): Promise<void> {
  await leaveRoom(roomId, userId);
  await db.from("user_room_meta").upsert(
    { user_id: userId, room_id: roomId, hidden: true },
    { onConflict: "user_id,room_id" }
  );

  const room = await getRoom(roomId);
  if (room?.createdBy === userId) {
    const members = await loadRoomMembers(roomId);
    if (members.length === 0) {
      await db.from("rooms").delete().eq("id", roomId);
    }
  }
}

export async function removeNooksFromUser(userId: string, roomIds: string[]): Promise<void> {
  for (const roomId of roomIds) {
    await removeNookFromUser(userId, roomId);
  }
}

export function searchUsersByUsername(
  query: string,
  selfUserId: string
): UserSearchResult[] {
  return searchResultsCache.get(`${selfUserId}:${normalizeUsername(query.replace(/^@/, ""))}`) ?? [];
}

const searchResultsCache = new Map<string, UserSearchResult[]>();

export async function refreshUserSearch(query: string, selfUserId: string): Promise<UserSearchResult[]> {
  const q = normalizeUsername(query.replace(/^@/, ""));
  if (q.length < 1) return [];

  const friendIds = new Set(getFriends(selfUserId).map((f) => f.userId));
  const pendingIds = new Set(
    [...getPendingRequests(selfUserId), ...getSentRequests(selfUserId)].flatMap((p) => [
      p.fromUserId,
      p.toUserId,
    ])
  );

  const { data, error } = await db
    .from("profiles")
    .select("user_id, display_name, username, profile_photo_url")
    .ilike("username", `%${q}%`)
    .limit(20);
  if (error) throw new Error(error.message);

  const results = (data ?? [])
    .filter(
      (p) =>
        p.user_id !== selfUserId &&
        !friendIds.has(p.user_id) &&
        !pendingIds.has(p.user_id)
    )
    .slice(0, 12)
    .map((p) => ({
      userId: p.user_id,
      displayName: p.display_name,
      username: p.username,
      profilePhotoUrl: p.profile_photo_url,
    }));

  searchResultsCache.set(`${selfUserId}:${q}`, results);
  return results;
}

export async function sendFriendRequestByUsername(
  fromUserId: string,
  username: string
): Promise<Friendship> {
  const target = await findProfileByUsername(username);
  if (!target) throw new Error(`No user found with @${normalizeUsername(username)}.`);
  return sendFriendRequestByUserId(fromUserId, target.userId);
}

export async function sendFriendRequestByUserId(
  fromUserId: string,
  targetUserId: string
): Promise<Friendship> {
  const trimmed = targetUserId.trim();
  if (!trimmed) throw new Error("Please enter a username.");

  const target = await fetchProfile(trimmed);
  if (!target) throw new Error("No user found.");
  if (target.userId === fromUserId) throw new Error("You can't friend yourself!");

  const { data: existingRows } = await db
    .from("friendships")
    .select("*")
    .or(
      `and(from_user_id.eq.${fromUserId},to_user_id.eq.${target.userId}),and(from_user_id.eq.${target.userId},to_user_id.eq.${fromUserId})`
    )
    .limit(1);
  const existing = existingRows?.[0] as FriendshipRow | undefined;
  if (existing) {
    if (existing.status === "accepted") throw new Error("You're already friends!");
    if (existing.from_user_id === fromUserId) {
      throw new Error("You already sent a request — awaiting reply.");
    }
    throw new Error("They already sent you a request — check your mailbox!");
  }

  if (target.autoAcceptFriends) {
    return createAcceptedFriendship(fromUserId, target.userId);
  }

  const friendship: Friendship = {
    id: uid("fr"),
    fromUserId,
    toUserId: target.userId,
    status: "pending",
    createdAt: Date.now(),
  };
  const { error } = await db.from("friendships").insert({
    id: friendship.id,
    from_user_id: fromUserId,
    to_user_id: target.userId,
    status: "pending",
    created_at: friendship.createdAt,
  });
  if (error) throw new Error(error.message);
  await refreshSocialCache(fromUserId);
  await refreshSocialCache(target.userId);
  return friendship;
}

type SocialCache = {
  friends: FriendInfo[];
  pending: FriendRequestInfo[];
  sent: FriendRequestInfo[];
};

const socialCache = new Map<string, SocialCache>();

async function loadFriends(userId: string): Promise<FriendInfo[]> {
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
  if (error) throw new Error(error.message);

  const friendIds = new Set<string>();
  for (const row of (data ?? []) as FriendshipRow[]) {
    friendIds.add(row.from_user_id === userId ? row.to_user_id : row.from_user_id);
  }

  const result: FriendInfo[] = [];
  for (const fid of friendIds) {
    const profile = await fetchProfileRow(fid);
    if (!profile) continue;
    const onlineStatus = onlineStatusFromProfile(profile);
    result.push({
      userId: fid,
      displayName: profile.display_name,
      username: profile.username,
      email: profile.email,
      profilePhotoUrl: profile.profile_photo_url,
      onlineStatus,
      online: onlineStatus === "online",
    });
  }
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function loadPendingRequests(userId: string): Promise<FriendRequestInfo[]> {
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .eq("to_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as FriendshipRow[];
  const results: FriendRequestInfo[] = [];
  for (const f of rows) {
    const profile = await fetchProfileRow(f.from_user_id);
    results.push({
      id: f.id,
      fromUserId: f.from_user_id,
      toUserId: f.to_user_id,
      displayName: profile?.display_name ?? "Friend",
      username: profile?.username ?? "friend",
      profilePhotoUrl: profile?.profile_photo_url,
      createdAt: f.created_at,
    });
  }
  return results;
}

async function loadSentRequests(userId: string): Promise<FriendRequestInfo[]> {
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .eq("from_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as FriendshipRow[];
  const results: FriendRequestInfo[] = [];
  for (const f of rows) {
    const profile = await fetchProfileRow(f.to_user_id);
    results.push({
      id: f.id,
      fromUserId: f.from_user_id,
      toUserId: f.to_user_id,
      displayName: profile?.display_name ?? "Friend",
      username: profile?.username ?? "friend",
      profilePhotoUrl: profile?.profile_photo_url,
      createdAt: f.created_at,
    });
  }
  return results;
}

export async function refreshSocialCache(userId: string): Promise<void> {
  await safeRemote(`social cache (${userId})`, async () => {
    const [friends, pending, sent] = await Promise.all([
      loadFriends(userId),
      loadPendingRequests(userId),
      loadSentRequests(userId),
    ]);
    socialCache.set(userId, { friends, pending, sent });
  }, undefined);
}

export function getFriends(userId: string): FriendInfo[] {
  return socialCache.get(userId)?.friends ?? [];
}

export function getPendingRequests(userId: string): FriendRequestInfo[] {
  return socialCache.get(userId)?.pending ?? [];
}

export function getSentRequests(userId: string): FriendRequestInfo[] {
  return socialCache.get(userId)?.sent ?? [];
}

export async function acceptFriendRequest(requestId: string, userId: string): Promise<void> {
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const friendship = data as FriendshipRow | null;
  if (!friendship) throw new Error("Letter not found.");
  if (friendship.to_user_id !== userId) throw new Error("This letter isn't for you.");
  if (friendship.status !== "pending") throw new Error("Already handled.");

  const { error: updateErr } = await db
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", requestId);
  if (updateErr) throw new Error(updateErr.message);
  await refreshSocialCache(userId);
  await refreshSocialCache(friendship.from_user_id);
}

export async function declineFriendRequest(requestId: string, userId: string): Promise<void> {
  const { data } = await db.from("friendships").select("*").eq("id", requestId).maybeSingle();
  const friendship = data as FriendshipRow | null;
  if (!friendship) throw new Error("Letter not found.");
  if (friendship.to_user_id !== userId) throw new Error("This letter isn't for you.");
  if (friendship.status !== "pending") throw new Error("Already handled.");

  const { error } = await db.from("friendships").delete().eq("id", requestId);
  if (error) throw new Error(error.message);
  await refreshSocialCache(userId);
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  const { data } = await db
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(
      `and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`
    )
    .limit(1);
  const friendship = data?.[0] as FriendshipRow | undefined;
  if (!friendship) throw new Error("Friend not found.");
  const { error } = await db.from("friendships").delete().eq("id", friendship.id);
  if (error) throw new Error(error.message);
  await refreshSocialCache(userId);
  await refreshSocialCache(friendId);
}

const friendListeners = new Map<string, Set<() => void>>();
const friendPollers = new Map<string, ReturnType<typeof setInterval>>();
const friendChannels = new Map<string, ReturnType<typeof db.channel>>();

function notifyFriends(userId: string) {
  void safeRemote(`friends poll (${userId})`, () => refreshSocialCache(userId), undefined).then(
    () => {
      friendListeners.get(userId)?.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          console.warn("[nook] Friends listener failed:", err);
        }
      });
    }
  );
}

export function subscribeToFriends(userId: string, cb: () => void): () => void {
  if (!friendListeners.has(userId)) friendListeners.set(userId, new Set());
  friendListeners.get(userId)!.add(cb);

  // One channel per user — register .on() handlers before .subscribe(), never reuse
  // a channel that is already subscribed (Supabase throws on late .on() calls).
  if (!friendPollers.has(userId)) {
    friendPollers.set(userId, setInterval(() => notifyFriends(userId), 3000));
    const channel = db
      .channel(`friends:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => notifyFriends(userId)
      )
      .subscribe();
    friendChannels.set(userId, channel);
  }

  notifyFriends(userId);

  return () => {
    friendListeners.get(userId)?.delete(cb);
    if (friendListeners.get(userId)?.size === 0) {
      friendListeners.delete(userId);
      clearInterval(friendPollers.get(userId));
      friendPollers.delete(userId);
      removeRealtimeChannel(friendChannels.get(userId));
      friendChannels.delete(userId);
    }
  };
}

export async function sendDirectMessage(
  fromUserId: string,
  toUserId: string,
  text: string
): Promise<DirectMessage> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");

  const { data: friendship } = await db
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(
      `and(from_user_id.eq.${fromUserId},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${fromUserId})`
    )
    .limit(1);
  if (!friendship?.length) throw new Error("You can only message friends.");

  const msg: DirectMessage = {
    id: uid("dm"),
    fromUserId,
    toUserId,
    text: trimmed.slice(0, 500),
    createdAt: Date.now(),
  };
  const { error } = await db.from("direct_messages").insert({
    id: msg.id,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    text: msg.text,
    created_at: msg.createdAt,
  });
  if (error) throw new Error(error.message);
  return msg;
}

const dmCache = new Map<string, DirectMessage[]>();

function dmCacheKey(userId: string, friendId: string): string {
  return [userId, friendId].sort().join(":");
}

async function loadDirectMessages(userId: string, friendId: string): Promise<DirectMessage[]> {
  const { data, error } = await db
    .from("direct_messages")
    .select("*")
    .or(
      `and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    text: row.text,
    createdAt: row.created_at,
  }));
}

export function getDirectMessages(userId: string, friendId: string): DirectMessage[] {
  return dmCache.get(dmCacheKey(userId, friendId)) ?? [];
}

export async function refreshDirectMessagesCache(
  userId: string,
  friendId: string
): Promise<DirectMessage[]> {
  const messages = await loadDirectMessages(userId, friendId);
  dmCache.set(dmCacheKey(userId, friendId), messages);
  return messages;
}

export function subscribeToDirectMessages(
  userId: string,
  friendId: string,
  cb: () => void
): () => void {
  const notify = () => void refreshDirectMessagesCache(userId, friendId).then(cb);
  notify();
  const poll = setInterval(notify, 3000);
  return () => clearInterval(poll);
}

export function getUserOnlineStatus(userId: string): OnlineStatus {
  return onlineStatusFromProfile(profileCache.get(userId) ?? null);
}

async function loadFriendshipStatus(
  userId: string,
  otherUserId: string
): Promise<import("./mockBackend").FriendshipStatus> {
  if (userId === otherUserId) return "self";
  const { data } = await db
    .from("friendships")
    .select("*")
    .or(
      `and(from_user_id.eq.${userId},to_user_id.eq.${otherUserId}),and(from_user_id.eq.${otherUserId},to_user_id.eq.${userId})`
    )
    .limit(1);
  const friendship = data?.[0] as FriendshipRow | undefined;
  if (!friendship) return "none";
  if (friendship.status === "accepted") return "friends";
  return friendship.from_user_id === userId ? "pending_outgoing" : "pending_incoming";
}

const publicCardCache = new Map<string, PublicUserCard | null>();

function publicCardKey(viewerId: string, targetUserId: string, roomId?: string): string {
  return `${viewerId}:${targetUserId}:${roomId ?? ""}`;
}

export function getPublicUserCard(
  viewerId: string,
  targetUserId: string,
  roomId?: string
): PublicUserCard | null {
  return publicCardCache.get(publicCardKey(viewerId, targetUserId, roomId)) ?? null;
}

export async function refreshPublicUserCard(
  viewerId: string,
  targetUserId: string,
  roomId?: string
): Promise<PublicUserCard | null> {
  const profile = await fetchProfileRow(targetUserId);
  if (!profile) {
    publicCardCache.set(publicCardKey(viewerId, targetUserId, roomId), null);
    return null;
  }

  let presenceStatus: PresenceStatus | null = null;
  if (roomId !== undefined) {
    const { data: member } = await db
      .from("room_members")
      .select("status")
      .eq("room_id", roomId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    presenceStatus = (member?.status as PresenceStatus | undefined) ?? null;
  }

  const card: PublicUserCard = {
    userId: targetUserId,
    displayName: profile.display_name,
    username: profile.username,
    profilePhotoUrl: profile.profile_photo_url,
    bio: profile.bio ?? "",
    onlineStatus: onlineStatusFromProfile(profile),
    presenceStatus,
    isSelf: viewerId === targetUserId,
    friendshipStatus: await loadFriendshipStatus(viewerId, targetUserId),
    stats: canViewRemoteStats(viewerId, targetUserId) ? getStats(targetUserId) : null,
  };
  publicCardCache.set(publicCardKey(viewerId, targetUserId, roomId), card);
  return card;
}

export function getFriendshipStatus(
  userId: string,
  otherUserId: string
): import("./mockBackend").FriendshipStatus {
  const card = publicCardCache.get(publicCardKey(userId, otherUserId));
  return card?.friendshipStatus ?? (userId === otherUserId ? "self" : "none");
}

export function checkStudyBuddyAchievement(roomId: string, userId: string): void {
  void loadRoomMembers(roomId).then((members) => {
    if (members.length >= 2) grantAchievement(userId, "study_buddy");
  });
}

const membersCache = new Map<string, RoomMember[]>();
const roomStudySessionsCache = new Map<string, StudySessionRow[]>();

function getRemoteLiveFocusSeconds(userId: string): number {
  const now = Date.now();
  let live = 0;
  for (const members of membersCache.values()) {
    for (const m of members) {
      if (m.userId === userId && m.status === "studying" && m.focusStartedAt != null) {
        live += Math.max(0, (now - m.focusStartedAt) / 1000);
      }
    }
  }
  return live;
}

export function getStats(userId: string) {
  return computeStudyStats(userId, getRemoteLiveFocusSeconds(userId));
}

export function getStreak(userId: string) {
  return getLocalStreak(userId);
}

async function loadUserStudySessions(userId: string): Promise<StudySessionRow[]> {
  const { data, error } = await db
    .from("study_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as StudySessionRow[] | null) ?? [];
}

function rowToStudySession(row: StudySessionRow): StudySession {
  return {
    id: row.id,
    userId: row.user_id,
    roomId: row.room_id ?? undefined,
    durationSeconds: row.duration_seconds,
    durationMinutes: row.duration_minutes,
    completedAt: row.completed_at,
  };
}

export async function refreshUserStudySessionsCache(userId: string): Promise<void> {
  await safeRemote(`user study sessions (${userId})`, async () => {
    const rows = await loadUserStudySessions(userId);
    syncUserStudySessions(userId, rows.map(rowToStudySession));
  }, undefined);
}

export { subscribeToStudyStats, notifyStudyStats };

async function loadRoomStudySessions(roomId: string): Promise<StudySessionRow[]> {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const { data, error } = await db
    .from("study_sessions")
    .select("*")
    .eq("room_id", roomId)
    .gte("completed_at", weekAgo);
  if (error) throw new Error(error.message);
  return (data as StudySessionRow[] | null) ?? [];
}

export async function refreshRoomStudySessionsCache(roomId: string): Promise<StudySessionRow[]> {
  return safeRemote(
    `study sessions (${roomId})`,
    async () => {
      const rows = await loadRoomStudySessions(roomId);
      roomStudySessionsCache.set(roomId, rows);
      return rows;
    },
    roomStudySessionsCache.get(roomId) ?? []
  );
}

async function commitFocusProgressAsync(
  roomId: string,
  userId: string,
  finalize = false
): Promise<void> {
  const members = membersCache.get(roomId) ?? (await loadRoomMembers(roomId));
  const member = members.find((m) => m.userId === userId);
  if (!member) return;

  let addedWholeMinutes = 0;
  let sessionTotalMinutes = 0;
  const startedAt = member.focusStartedAt;
  const updates: Partial<MemberRow> = { updated_at: Date.now() };

  if (startedAt != null) {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if (elapsedSeconds > 0) {
      let sessionId = member.focusSessionId ?? uid("sess");
      const { data: existing } = await db
        .from("study_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      const prevSeconds = existing ? sessionRowSeconds(existing as StudySessionRow) : 0;
      const totalSeconds = prevSeconds + elapsedSeconds;
      sessionTotalMinutes = Math.floor(totalSeconds / 60);
      const row = {
        id: sessionId,
        user_id: userId,
        room_id: roomId,
        duration_seconds: totalSeconds,
        duration_minutes: sessionTotalMinutes,
        completed_at: Date.now(),
      };
      const { error: upsertErr } = await db.from("study_sessions").upsert(row);
      if (upsertErr) throw new Error(upsertErr.message);

      upsertLocalStudySession(rowToStudySession(row as StudySessionRow));
      if (sessionTotalMinutes >= STREAK_MIN_MINUTES) {
        applyStreakForSessionMinutes(userId, sessionTotalMinutes);
      } else {
        notifyStudyStats(userId);
      }

      updates.focus_started_at = startedAt + elapsedSeconds * 1000;
      updates.focus_session_id = sessionId;
      member.focusStartedAt = updates.focus_started_at as number;
      member.focusSessionId = sessionId;
      addedWholeMinutes = sessionTotalMinutes - Math.floor(prevSeconds / 60);
    }
  }

  if (finalize) {
    updates.focus_session_id = null;
    member.focusSessionId = null;
  }

  if (startedAt != null || finalize) {
    const { error } = await db
      .from("room_members")
      .update(updates)
      .eq("room_id", roomId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    membersCache.set(roomId, members);
  }

  if (addedWholeMinutes > 0 || finalize) {
    await refreshRoomStudySessionsCache(roomId);
    notifyRoom(roomId);
  }
}

export function commitFocusProgress(roomId: string, userId: string, finalize = false): void {
  void commitFocusProgressAsync(roomId, userId, finalize).catch((err) => {
    console.warn("[nook] commitFocusProgress failed:", err);
  });
}

export function getRoomStudyLeaderboard(
  roomId: string,
  period: RoomLeaderboardPeriod,
  viewerId?: string
): RoomLeaderboardEntry[] {
  const startOfToday = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  ).getTime();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cutoff = period === "daily" ? startOfToday : weekAgo;
  const sessions = (roomStudySessionsCache.get(roomId) ?? []).filter(
    (s) => s.completed_at >= cutoff
  );

  const rows = getRoomMembers(roomId).map((m) => {
    const profile = profileCache.get(m.userId);
    const isSelf = viewerId === m.userId;
    const visible = isSelf || (profile?.show_stats ?? true);
    const liveMinutes =
      m.status === "studying" && m.focusStartedAt
        ? Math.max(0, Date.now() - m.focusStartedAt) / (60 * 1000)
        : 0;
    const minutes = visible
      ? sessions
          .filter((s) => s.user_id === m.userId)
          .reduce((sum, s) => sum + sessionRowSeconds(s) / 60, 0) + liveMinutes
      : 0;
    return {
      userId: m.userId,
      displayName: profile?.display_name ?? m.displayName,
      username: profile?.username ?? m.displayName,
      profilePhotoUrl: profile?.profile_photo_url ?? null,
      onlineStatus: onlineStatusFromProfile(profile ?? null, m.updatedAt),
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

export function getRoomDailyStudySeconds(roomId: string): Record<string, number> {
  const now = Date.now();
  const startOfToday = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  ).getTime();
  const sessions = roomStudySessionsCache.get(roomId) ?? [];
  const result: Record<string, number> = {};

  for (const m of getRoomMembers(roomId)) {
    const savedSeconds = sessions
      .filter((s) => s.user_id === m.userId && s.completed_at >= startOfToday)
      .reduce((sum, s) => sum + sessionRowSeconds(s), 0);
    const liveSeconds =
      m.status === "studying" && m.focusStartedAt
        ? Math.max(0, (now - m.focusStartedAt) / 1000)
        : 0;
    result[m.userId] = savedSeconds + liveSeconds;
  }
  return result;
}

export function getRoomMembers(roomId: string): RoomMember[] {
  return membersCache.get(roomId) ?? [];
}

export async function refreshRoomMembersCache(roomId: string): Promise<RoomMember[]> {
  return safeRemote(`load members (${roomId})`, async () => {
    const members = await loadRoomMembers(roomId);
    membersCache.set(roomId, members);
    await Promise.all(
      members.map((m) =>
        fetchProfileRow(m.userId).catch(() => null)
      )
    );
    void refreshRoomStudySessionsCache(roomId);
    return members;
  }, membersCache.get(roomId) ?? []);
}
