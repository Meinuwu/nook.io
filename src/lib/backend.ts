/**
 * Unified backend: Supabase when env vars are set, otherwise local mock.
 */
import { isSupabaseConfigured } from "./supabase/client";
import * as mock from "./mockBackend";

export type {
  OnlineStatus,
  OnlineStatusMode,
  PrivacySettings,
  Profile,
  ProfileUpdate,
  Room,
  RoomMember,
  ChatMessage,
  Session,
  StudySession,
  StudyStats,
  StreakInfo,
  UserAchievement,
  Friendship,
  DirectMessage,
  FriendInfo,
  UserSearchResult,
  FriendRequestInfo,
  UserNookMember,
  UserNookSummary,
  LeaderboardMetric,
  LeaderboardEntry,
  FriendshipStatus,
  PublicUserCard,
  RoomLeaderboardPeriod,
  RoomLeaderboardEntry,
} from "./mockBackend";

export {
  normalizeUsername,
  validateUsername,
  STREAK_MIN_MINUTES,
  LEADERBOARD_METRIC_LABELS,
  formatAchievementProgress,
  formatStudyMinutes,
  formatTodayFocus,
  recordSession,
  getUserAchievements,
  getAchievementProgress,
  getFriendLeaderboard,
  getFriendLeaderboardRank,
  getVisibleFriends,
  getVisibleAchievementCount,
  canViewUserStats,
  canViewUserAchievements,
  canViewUserFriends,
} from "./mockBackend";

type RemoteBackend = typeof import("./remoteBackend");

let remote: RemoteBackend | null = null;
let initPromise: Promise<void> | null = null;

export function isSharedBackend(): boolean {
  return isSupabaseConfigured;
}

export async function initBackend(): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      remote = await import("./remoteBackend");
      await remote.initRemoteBackend();
      const userId = remote.getMyUserId();
      if (userId) await remote.refreshUserStudySessionsCache(userId);
    } catch (err) {
      console.warn(
        "[nook] Remote backend init failed — falling back to local mock.",
        err
      );
      remote = null;
    }
  })();
  return initPromise;
}

function r(): RemoteBackend {
  if (!remote) throw new Error("Shared backend not initialized — call initBackend() first.");
  return remote;
}

function useRemote(): boolean {
  return remote != null;
}

export async function refreshUserSearch(query: string, selfUserId: string) {
  if (remote) return r().refreshUserSearch(query, selfUserId);
  return mock.searchUsersByUsername(query, selfUserId);
}

export async function refreshPublicUserCard(
  viewerId: string,
  targetUserId: string,
  roomId?: string
) {
  if (remote) return r().refreshPublicUserCard(viewerId, targetUserId, roomId);
  return mock.getPublicUserCard(viewerId, targetUserId, roomId);
}

export async function refreshRoomMembers(roomId: string) {
  if (remote) return r().refreshRoomMembersCache(roomId);
  return mock.getRoomMembers(roomId);
}

export async function refreshChat(roomId: string) {
  if (remote) return r().refreshChatCache(roomId);
  return mock.getChatMessages(roomId);
}

export function getSession(): mock.Session | null {
  if (remote) return r().getSession();
  return mock.getSession();
}

export function onAuthChange(cb: (session: mock.Session | null) => void): () => void {
  if (remote) return r().onAuthChange(cb);
  return mock.onAuthChange(cb);
}

export function getMyUserId(): string | null {
  if (remote) return r().getMyUserId();
  return mock.getMyUserId();
}

export async function signUp(
  email: string,
  password: string,
  username?: string,
  inviter?: string
): Promise<mock.Profile> {
  if (remote) return r().signUp(email, password, username, inviter);
  return mock.signUp(email, password, username, inviter);
}

export async function login(email: string, password: string): Promise<mock.Profile> {
  if (remote) return r().login(email, password);
  return mock.login(email, password);
}

export async function logout(): Promise<void> {
  if (remote) return r().logout();
  return mock.logout();
}

export async function resetPasswordForEmail(email: string): Promise<void> {
  if (remote) return r().resetPasswordForEmail(email);
  throw new Error("Password reset requires Supabase — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export async function updatePassword(newPassword: string): Promise<void> {
  if (remote) return r().updatePassword(newPassword);
  throw new Error("Password reset requires Supabase — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export function commitFocusProgress(roomId: string, userId: string, finalize = false): void {
  if (remote) return r().commitFocusProgress(roomId, userId, finalize);
  return mock.commitFocusProgress(roomId, userId, finalize);
}

export function getStats(userId: string): mock.StudyStats {
  if (remote) return r().getStats(userId);
  return mock.getStats(userId);
}

export function getStreak(userId: string): mock.StreakInfo {
  if (remote) return r().getStreak(userId);
  return mock.getStreak(userId);
}

export function subscribeToStudyStats(userId: string, cb: () => void): () => void {
  if (remote) return r().subscribeToStudyStats(userId, cb);
  return mock.subscribeToStudyStats(userId, cb);
}

export async function refreshUserStudyStats(userId: string): Promise<void> {
  if (remote) return r().refreshUserStudySessionsCache(userId);
}

export function getRoomStudyLeaderboard(
  roomId: string,
  period: import("./mockBackend").RoomLeaderboardPeriod,
  viewerId?: string
): import("./mockBackend").RoomLeaderboardEntry[] {
  if (remote) return r().getRoomStudyLeaderboard(roomId, period, viewerId);
  return mock.getRoomStudyLeaderboard(roomId, period, viewerId);
}

export async function getProfile(userId: string): Promise<mock.Profile | null> {
  if (remote) return r().getProfile(userId);
  return mock.getProfile(userId);
}

export async function updateAvatarConfig(
  userId: string,
  avatarConfig: import("./avatarTypes").AvatarConfig,
  markCreated = true
): Promise<mock.Profile> {
  if (remote) return r().updateAvatarConfig(userId, avatarConfig, markCreated);
  return mock.updateAvatarConfig(userId, avatarConfig, markCreated);
}

export async function updateProfile(
  userId: string,
  update: mock.ProfileUpdate
): Promise<mock.Profile> {
  if (remote) return r().updateProfile(userId, update);
  return mock.updateProfile(userId, update);
}

export function syncOnlineStatus(userId: string, mode: mock.OnlineStatusMode): void {
  if (remote) return r().syncOnlineStatus(userId, mode);
  mock.syncOnlineStatus(userId, mode);
}

export function syncLastActive(userId: string): void {
  if (remote) return r().syncLastActive(userId);
  mock.syncLastActive(userId);
}

export function getProfilePrivacy(userId: string): mock.PrivacySettings {
  if (remote) return r().getProfilePrivacySync(userId);
  return mock.getProfilePrivacy(userId);
}

export function syncPrivacySettings(userId: string, settings: mock.PrivacySettings): void {
  if (remote) void r().syncPrivacySettings(userId, settings);
  else mock.syncPrivacySettings(userId, settings);
}

export async function createRoom(
  userId: string,
  name: string,
  capacity: number
): Promise<mock.Room> {
  if (remote) return r().createRoom(userId, name, capacity);
  return mock.createRoom(userId, name, capacity);
}

export async function findRoomByCode(code: string): Promise<mock.Room | null> {
  if (remote) return r().findRoomByCode(code);
  return mock.findRoomByCode(code);
}

export async function getRoom(roomId: string): Promise<mock.Room | null> {
  if (remote) return r().getRoom(roomId);
  return mock.getRoom(roomId);
}

export async function joinRoom(roomId: string, profile: mock.Profile): Promise<mock.RoomMember> {
  if (remote) return r().joinRoom(roomId, profile);
  return mock.joinRoom(roomId, profile);
}

export async function changeSeat(
  roomId: string,
  userId: string,
  deskSlot: number
): Promise<void> {
  if (remote) return r().changeSeat(roomId, userId, deskSlot);
  return mock.changeSeat(roomId, userId, deskSlot);
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  if (remote) return r().leaveRoom(roomId, userId);
  return mock.leaveRoom(roomId, userId);
}

export function getRoomMembers(roomId: string): mock.RoomMember[] {
  if (remote) return r().getRoomMembers(roomId);
  return mock.getRoomMembers(roomId);
}

export async function updateMemberStatus(
  roomId: string,
  userId: string,
  status: import("./avatarTypes").PresenceStatus,
  timerEndsAt: number | null
): Promise<void> {
  if (remote) return r().updateMemberStatus(roomId, userId, status, timerEndsAt);
  return mock.updateMemberStatus(roomId, userId, status, timerEndsAt);
}

export function subscribeToRoom(roomId: string, cb: () => void): () => void {
  if (remote) return r().subscribeToRoom(roomId, cb);
  return mock.subscribeToRoom(roomId, cb);
}

export async function sendChatMessage(
  roomId: string,
  userId: string,
  displayName: string,
  text: string
): Promise<mock.ChatMessage> {
  if (remote) return r().sendChatMessage(roomId, userId, displayName, text);
  return mock.sendChatMessage(roomId, userId, displayName, text);
}

export function getChatMessages(roomId: string): mock.ChatMessage[] {
  if (remote) return r().getChatMessages(roomId);
  return mock.getChatMessages(roomId);
}

export function subscribeToChat(roomId: string, cb: () => void): () => void {
  if (remote) return r().subscribeToChat(roomId, cb);
  return mock.subscribeToChat(roomId, cb);
}

export function getUserNooks(userId: string): mock.UserNookSummary[] {
  if (remote) return r().getUserNooks(userId);
  return mock.getUserNooks(userId);
}

export function subscribeToUserNooks(userId: string, cb: () => void): () => void {
  if (remote) return r().subscribeToUserNooks(userId, cb);
  return mock.subscribeToUserNooks(userId, cb);
}

export async function removeNookFromUser(userId: string, roomId: string): Promise<void> {
  if (remote) return r().removeNookFromUser(userId, roomId);
  return mock.removeNookFromUser(userId, roomId);
}

export async function removeNooksFromUser(userId: string, roomIds: string[]): Promise<void> {
  if (remote) return r().removeNooksFromUser(userId, roomIds);
  return mock.removeNooksFromUser(userId, roomIds);
}

export function searchUsersByUsername(query: string, selfUserId: string): mock.UserSearchResult[] {
  if (remote) return r().searchUsersByUsername(query, selfUserId);
  return mock.searchUsersByUsername(query, selfUserId);
}

export async function sendFriendRequestByUsername(
  fromUserId: string,
  username: string
): Promise<mock.Friendship> {
  if (remote) return r().sendFriendRequestByUsername(fromUserId, username);
  return mock.sendFriendRequestByUsername(fromUserId, username);
}

export async function sendFriendRequestByUserId(
  fromUserId: string,
  targetUserId: string
): Promise<mock.Friendship> {
  if (remote) return r().sendFriendRequestByUserId(fromUserId, targetUserId);
  return mock.sendFriendRequestByUserId(fromUserId, targetUserId);
}

export function getPendingRequests(userId: string): mock.FriendRequestInfo[] {
  if (remote) return r().getPendingRequests(userId);
  return mock.getPendingRequests(userId);
}

export function getSentRequests(userId: string): mock.FriendRequestInfo[] {
  if (remote) return r().getSentRequests(userId);
  return mock.getSentRequests(userId);
}

export async function acceptFriendRequest(requestId: string, userId: string): Promise<void> {
  if (remote) return r().acceptFriendRequest(requestId, userId);
  return mock.acceptFriendRequest(requestId, userId);
}

export async function declineFriendRequest(requestId: string, userId: string): Promise<void> {
  if (remote) return r().declineFriendRequest(requestId, userId);
  return mock.declineFriendRequest(requestId, userId);
}

export function getFriends(userId: string): mock.FriendInfo[] {
  if (remote) return r().getFriends(userId);
  return mock.getFriends(userId);
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  if (remote) return r().removeFriend(userId, friendId);
  return mock.removeFriend(userId, friendId);
}

export function subscribeToFriends(userId: string, cb: () => void): () => void {
  if (remote) return r().subscribeToFriends(userId, cb);
  return mock.subscribeToFriends(userId, cb);
}

export async function sendDirectMessage(
  fromUserId: string,
  toUserId: string,
  text: string
): Promise<mock.DirectMessage> {
  if (remote) return r().sendDirectMessage(fromUserId, toUserId, text);
  return mock.sendDirectMessage(fromUserId, toUserId, text);
}

export function getDirectMessages(userId: string, friendId: string): mock.DirectMessage[] {
  if (remote) return r().getDirectMessages(userId, friendId);
  return mock.getDirectMessages(userId, friendId);
}

export function subscribeToDirectMessages(
  userId: string,
  friendId: string,
  cb: () => void
): () => void {
  if (remote) return r().subscribeToDirectMessages(userId, friendId, cb);
  return mock.subscribeToDirectMessages(userId, friendId, cb);
}

export function getUserOnlineStatus(userId: string): mock.OnlineStatus {
  if (remote) return r().getUserOnlineStatus(userId);
  return mock.getUserOnlineStatus(userId);
}

export function getFriendshipStatus(
  userId: string,
  otherUserId: string
): mock.FriendshipStatus {
  if (remote) return r().getFriendshipStatus(userId, otherUserId);
  return mock.getFriendshipStatus(userId, otherUserId);
}

export function getPublicUserCard(
  viewerId: string,
  targetUserId: string,
  roomId?: string
): mock.PublicUserCard | null {
  if (remote) return r().getPublicUserCard(viewerId, targetUserId, roomId);
  return mock.getPublicUserCard(viewerId, targetUserId, roomId);
}

export function checkStudyBuddyAchievement(roomId: string, userId: string): void {
  if (remote) return r().checkStudyBuddyAchievement(roomId, userId);
  mock.checkStudyBuddyAchievement(roomId, userId);
}

/** Remote members + local per-device session seconds for live timers. */
export function getRoomDailyStudySeconds(roomId: string): Record<string, number> {
  if (useRemote()) return r().getRoomDailyStudySeconds(roomId);
  return mock.getRoomDailyStudySeconds(roomId);
}

export function buildRoomShareUrl(code: string): string {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://nook-io.vercel.app";
  return `${origin}/join/${code.trim().toUpperCase()}`;
}
