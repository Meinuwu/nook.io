import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import ProfileAvatar from "../components/ProfileAvatar";
import { useAuth } from "../lib/useAuth";
import * as backend from "../lib/mockBackend";

type Tab = "search" | "mailbox" | "friends";

export default function FriendsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  const [tab, setTab] = useState<Tab>("friends");
  const [pending, setPending] = useState<backend.FriendRequestInfo[]>([]);
  const [sent, setSent] = useState<backend.FriendRequestInfo[]>([]);
  const [friends, setFriends] = useState<backend.FriendInfo[]>([]);
  const [openedLetter, setOpenedLetter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<backend.UserSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchBusy, setSearchBusy] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<backend.FriendInfo | null>(null);
  const [messages, setMessages] = useState<backend.DirectMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const refreshMailbox = useCallback(() => {
    if (!profile) return;
    setPending(backend.getPendingRequests(profile.userId));
    setSent(backend.getSentRequests(profile.userId));
    setFriends(backend.getFriends(profile.userId));
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    refreshMailbox();
    return backend.subscribeToFriends(profile.userId, refreshMailbox);
  }, [profile, refreshMailbox]);

  useEffect(() => {
    if (!profile) return;
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    setSearchResults(backend.searchUsersByUsername(q, profile.userId));
  }, [searchQuery, profile]);

  useEffect(() => {
    const chatWith = (location.state as { chatWith?: string } | null)?.chatWith;
    if (!chatWith || !profile) return;
    const friend = backend.getFriends(profile.userId).find((f) => f.userId === chatWith);
    if (friend) {
      setSelectedFriend(friend);
      setTab("friends");
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, profile, navigate]);

  const refreshMessages = useCallback(() => {
    if (!profile || !selectedFriend) return;
    setMessages(backend.getDirectMessages(profile.userId, selectedFriend.userId));
  }, [profile, selectedFriend]);

  useEffect(() => {
    if (!profile || !selectedFriend) return;
    refreshMessages();
    return backend.subscribeToDirectMessages(
      profile.userId,
      selectedFriend.userId,
      refreshMessages
    );
  }, [profile, selectedFriend, refreshMessages]);

  async function handleAddFriend(username: string) {
    if (!profile) return;
    setSearchBusy(username);
    setSearchError(null);
    try {
      const friendship = await backend.sendFriendRequestByUsername(profile.userId, username);
      setSearchResults((prev) => prev.filter((r) => r.username !== username));
      refreshMailbox();
      setTab(friendship.status === "accepted" ? "friends" : "mailbox");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Could not send request.");
    } finally {
      setSearchBusy(null);
    }
  }

  async function handleAccept(requestId: string) {
    if (!profile) return;
    setActionBusy(true);
    try {
      await backend.acceptFriendRequest(requestId, profile.userId);
      setOpenedLetter(null);
      refreshMailbox();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDecline(requestId: string) {
    if (!profile) return;
    setActionBusy(true);
    try {
      await backend.declineFriendRequest(requestId, profile.userId);
      setOpenedLetter(null);
      refreshMailbox();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRemoveFriend(friendId: string) {
    if (!profile) return;
    setActionBusy(true);
    try {
      await backend.removeFriend(profile.userId, friendId);
      if (selectedFriend?.userId === friendId) setSelectedFriend(null);
      refreshMailbox();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !selectedFriend || !messageText.trim()) return;
    await backend.sendDirectMessage(profile.userId, selectedFriend.userId, messageText);
    setMessageText("");
    refreshMessages();
  }

  if (!profile) return null;

  return (
    <>
      <PageHeader variant="back" title="Friends" backTo="/profile" />

      <main className="mx-auto max-w-3xl px-4 pb-6 sm:px-6">
        <div className="mb-6 text-center animate-pop-in">
          <p className="text-3xl font-extrabold text-brown">Find your study crew</p>
          <p className="mt-1 text-olive">Search by @username to add friends.</p>
        </div>

        <div className="mb-6 flex rounded-full bg-cream p-1 shadow-cozy">
          {(
            [
              { id: "friends" as Tab, label: "Your friends" },
              { id: "mailbox" as Tab, label: "Mailbox" },
              { id: "search" as Tab, label: "Search" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                if (id !== "friends") setSelectedFriend(null);
              }}
              className={`flex-1 rounded-full py-2.5 text-sm font-extrabold transition-all ${
                tab === id ? "bg-peach text-white shadow-cozy" : "text-brown/60"
              }`}
            >
              {label}
              {id === "mailbox" && pending.length > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/30 px-1 text-[10px]">
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "search" && (
          <div className="flex flex-col gap-4 animate-pop-in">
            <section className="mail-envelope px-5 py-5">
              <label className="mb-2 block text-sm font-bold text-olive" htmlFor="username-search">
                Search by username
              </label>
              <input
                id="username-search"
                className="input-cozy"
                placeholder="@username"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
              {searchError && (
                <p className="mt-2 text-sm font-semibold text-peach">{searchError}</p>
              )}
            </section>

            {searchQuery.trim().length > 0 && searchResults.length === 0 && (
              <p className="mail-postcard text-center text-sm text-olive/70">
                No users found for @{backend.normalizeUsername(searchQuery)}
              </p>
            )}

            {searchResults.length > 0 && (
              <ul className="flex flex-col gap-2">
                {searchResults.map((user) => (
                  <li
                    key={user.userId}
                    className="mail-postcard flex items-center gap-3 px-4 py-3"
                  >
                    <ProfileAvatar
                      displayName={user.displayName}
                      profilePhotoUrl={user.profilePhotoUrl}
                      size={44}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-brown">{user.displayName}</p>
                      <p className="truncate text-xs text-olive/70">@{user.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddFriend(user.username)}
                      disabled={searchBusy === user.username}
                      className="btn-primary shrink-0 !px-4 !py-2 text-sm"
                    >
                      {searchBusy === user.username ? "…" : "Add"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "mailbox" && (
          <div className="flex flex-col gap-6 animate-pop-in">
            <section>
              <h2 className="mb-3 text-lg font-extrabold text-brown">
                Incoming mail
                {pending.length > 0 && (
                  <span className="ml-2 text-sm font-bold text-peach">({pending.length})</span>
                )}
              </h2>
              {pending.length === 0 ? (
                <p className="mail-postcard text-sm text-olive/70">No letters waiting — check back later!</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {pending.map((req) => (
                    <IncomingLetter
                      key={req.id}
                      request={req}
                      opened={openedLetter === req.id}
                      onOpen={() => setOpenedLetter(req.id)}
                      onClose={() => setOpenedLetter(null)}
                      onAccept={() => handleAccept(req.id)}
                      onDecline={() => handleDecline(req.id)}
                      busy={actionBusy}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-extrabold text-brown">Awaiting reply</h2>
              {sent.length === 0 ? (
                <p className="mail-postcard text-sm text-olive/70">No outgoing letters in transit.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sent.map((req) => (
                    <li key={req.id} className="mail-envelope flex items-center gap-3 px-4 py-3">
                      <ProfileAvatar
                        displayName={req.displayName}
                        profilePhotoUrl={req.profilePhotoUrl}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-brown">To: {req.displayName}</p>
                        <p className="truncate text-xs text-olive">@{req.username} · waiting for reply…</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "friends" && (
          <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] animate-pop-in">
            <section className="mail-postcard">
              <h2 className="mb-3 text-lg font-extrabold text-brown">Your friends</h2>
              {friends.length === 0 ? (
                <p className="text-sm text-olive/70">
                  No friends yet — search by @username to add someone!
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {friends.map((f) => (
                    <li key={f.userId}>
                      <button
                        type="button"
                        onClick={() => setSelectedFriend(f)}
                        className={`selectable-option flex w-full items-center gap-3 px-3 py-2.5 ${
                          selectedFriend?.userId === f.userId
                            ? "selectable-option--selected"
                            : ""
                        }`}
                      >
                        <ProfileAvatar
                          displayName={f.displayName}
                          profilePhotoUrl={f.profilePhotoUrl}
                          size={40}
                          showStatus
                          status={f.onlineStatus}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="selectable-option__title truncate">{f.displayName}</p>
                          <p className="selectable-option__description truncate">@{f.username}</p>
                        </div>
                        <span className="text-xs font-bold text-olive">
                          {f.onlineStatus === "online"
                            ? "Online"
                            : f.onlineStatus === "dnd"
                              ? "DND"
                              : "Offline"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mail-postcard flex min-h-[320px] flex-col">
              {selectedFriend ? (
                <MailThread
                  friend={selectedFriend}
                  messages={messages}
                  currentUserId={profile.userId}
                  messageText={messageText}
                  onMessageChange={setMessageText}
                  onSend={handleSendMessage}
                  onRemove={() => handleRemoveFriend(selectedFriend.userId)}
                  removeBusy={actionBusy}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                  <span className="text-4xl">📝</span>
                  <p className="font-bold text-brown">Pick a friend to write</p>
                  <p className="text-sm text-olive/70">Your mail thread will appear here.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}

function IncomingLetter({
  request,
  opened,
  onOpen,
  onClose,
  onAccept,
  onDecline,
  busy,
}: {
  request: backend.FriendRequestInfo;
  opened: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  if (!opened) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mail-envelope group flex flex-col items-center gap-2 px-4 py-6 text-center transition-transform hover:scale-[1.02]"
      >
        <span className="text-4xl transition-transform group-hover:rotate-6" aria-hidden>
          ✉️
        </span>
        <p className="text-sm font-bold text-brown">From @{request.username}</p>
        <p className="text-xs text-olive">Tap to open</p>
      </button>
    );
  }

  return (
    <div className="mail-postcard-open animate-pop-in">
      <button
        type="button"
        onClick={onClose}
        className="mb-3 text-xs font-bold text-olive hover:text-brown"
      >
        ← Back to envelope
      </button>
      <div className="mb-4 flex items-center gap-3">
        <ProfileAvatar
          displayName={request.displayName}
          profilePhotoUrl={request.profilePhotoUrl}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-brown">{request.displayName}</p>
          <p className="truncate text-xs text-olive">@{request.username}</p>
        </div>
        <span className="mail-stamp ml-auto shrink-0" aria-hidden>
          📮
        </span>
      </div>
      <p className="mb-5 text-sm italic text-olive">
        "Would you like to be study buddies? Let's cozy up and focus together!"
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="wax-seal wax-seal-accept flex-1"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="wax-seal wax-seal-decline flex-1"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function MailThread({
  friend,
  messages,
  currentUserId,
  messageText,
  onMessageChange,
  onSend,
  onRemove,
  removeBusy,
}: {
  friend: backend.FriendInfo;
  messages: backend.DirectMessage[];
  currentUserId: string;
  messageText: string;
  onMessageChange: (v: string) => void;
  onSend: (e: React.FormEvent) => void;
  onRemove: () => void;
  removeBusy: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-dashed border-wood/30 pb-3">
        <div className="flex items-center gap-2">
          <ProfileAvatar
            displayName={friend.displayName}
            profilePhotoUrl={friend.profilePhotoUrl}
            size={40}
            showStatus
            status={friend.onlineStatus}
          />
          <div>
            <p className="font-extrabold text-brown">{friend.displayName}</p>
            <p className="text-xs text-olive">@{friend.username}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={removeBusy}
          className="text-xs font-bold text-olive hover:text-peach"
        >
          Remove friend
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "280px" }}>
        {messages.length === 0 && (
          <p className="text-center text-sm text-olive/70">No letters yet — say hello!</p>
        )}
        {messages.map((m) => {
          const mine = m.fromUserId === currentUserId;
          return (
            <div
              key={m.id}
              className={`rounded-2xl border border-dashed px-3 py-2 text-sm ${
                mine
                  ? "ml-6 border-peach/40 bg-peach/15 text-brown"
                  : "mr-6 border-sage/50 bg-sage/20 text-brown"
              }`}
            >
              {m.text}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSend} className="mt-3 flex gap-2 border-t border-dashed border-wood/30 pt-3">
        <input
          className="input-cozy !py-2 text-sm"
          placeholder="Write a letter…"
          value={messageText}
          onChange={(e) => onMessageChange(e.target.value)}
          maxLength={500}
        />
        <button type="submit" className="btn-primary !px-4 !py-2 text-sm" disabled={!messageText.trim()}>
          Send
        </button>
      </form>
    </>
  );
}
