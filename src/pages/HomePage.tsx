import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import ProfileAvatar from "../components/ProfileAvatar";
import { useAuth } from "../lib/useAuth";
import * as backend from "../lib/mockBackend";
import type { UserNookSummary } from "../lib/mockBackend";
import { VALID_CAPACITIES } from "../game/roomLayout";
import { APP_VERSION_LABEL } from "../lib/appInfo";

const CAPACITY_OPTIONS = VALID_CAPACITIES;

function tableShapeLabel(capacity: number): string {
  if (capacity <= 3) return "round table";
  if (capacity === 4) return "square table";
  return "rectangle table";
}

function nookActivityLabel(nook: UserNookSummary): string {
  if (nook.studyingCount > 0) {
    return `${nook.studyingCount} studying`;
  }
  if (nook.memberCount > 0) {
    return `${nook.memberCount} in nook`;
  }
  return "empty";
}

function NookCard({
  nook,
  selectionMode,
  selected,
  onToggleSelect,
  onJoin,
}: {
  nook: UserNookSummary;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onJoin: () => void;
}) {
  const visibleMembers = nook.members.slice(0, 4);
  const overflow = nook.members.length - visibleMembers.length;

  return (
    <li
      className={`rounded-2xl border bg-[rgb(var(--bg-rgb)/0.45)] px-4 py-3 transition-colors ${
        selectionMode && selected
          ? "border-[rgb(var(--accent-peach-rgb)/0.6)] bg-[rgb(var(--accent-peach-rgb)/0.08)]"
          : "border-[var(--border-strong)]"
      }`}
    >
      <div className="flex items-center gap-3">
        {selectionMode && (
          <label className="flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-5 w-5 cursor-pointer rounded-md border-2 border-[var(--border-strong)] accent-[var(--accent-peach)]"
              aria-label={`Select ${nook.name}`}
            />
          </label>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-extrabold text-brown">{nook.name}</p>
            {nook.isOwner && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-peach">
                yours
              </span>
            )}
          </div>
          <p className="text-xs text-olive/80">
            {nook.memberCount}/{nook.capacity} · {nookActivityLabel(nook)}
          </p>
        </div>

        {!selectionMode && (
          <button type="button" onClick={onJoin} className="btn-primary shrink-0 !px-4 !py-2 text-sm">
            Join
          </button>
        )}
      </div>

      {nook.members.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex -space-x-2">
            {visibleMembers.map((member) => (
              <ProfileAvatar
                key={member.userId}
                displayName={member.displayName}
                profilePhotoUrl={member.profilePhotoUrl}
                size={32}
                showStatus
                status={member.onlineStatus}
                className="ring-2 ring-[var(--bg-panel)]"
              />
            ))}
          </div>
          <p className="min-w-0 truncate text-xs text-olive/70">
            {visibleMembers.map((m) => m.displayName).join(", ")}
            {overflow > 0 ? ` +${overflow}` : ""}
          </p>
        </div>
      )}
    </li>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [roomName, setRoomName] = useState("");
  const [capacity, setCapacity] = useState<number>(4);
  const [joinCode, setJoinCode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userNooks, setUserNooks] = useState<UserNookSummary[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const userId = profile?.userId;

  useEffect(() => {
    if (!userId) return;
    const uid = userId;
    function refresh() {
      setUserNooks(backend.getUserNooks(uid));
    }
    refresh();
    return backend.subscribeToUserNooks(uid, refresh);
  }, [userId]);

  useEffect(() => {
    if (selectionMode && userNooks.length === 0) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [selectionMode, userNooks.length]);

  if (!profile) return null;

  const selectedCount = selectedIds.size;
  const allSelected = userNooks.length > 0 && selectedCount === userNooks.length;
  const currentRoomMatch = location.pathname.match(/^\/room\/([^/]+)/);
  const currentRoomId = currentRoomMatch?.[1] ?? null;

  function toggleSelect(roomId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  }

  async function handleDeleteSelected() {
    if (!userId || selectedCount === 0) return;
    setDeleting(true);
    setError(null);
    try {
      const roomIds = Array.from(selectedIds);
      await backend.removeNooksFromUser(userId, roomIds);
      if (currentRoomId && roomIds.includes(currentRoomId)) {
        navigate("/");
      }
      exitSelectionMode();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove nooks.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const room = await backend.createRoom(profile!.userId, roomName, capacity);
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setBusy(true);
    setError(null);
    try {
      const room = await backend.findRoomByCode(joinCode);
      if (!room) {
        setError("No nook found with that code.");
        return;
      }
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader />

      <main className="relative mx-auto flex max-w-lg flex-col gap-6 px-4 pb-6 sm:px-6">
        <div className="animate-pop-in">
          <h1 className="text-2xl font-extrabold text-brown">
            Hey, {profile.displayName}
          </h1>
          <p className="text-olive">Ready to focus?</p>
        </div>

        <section className="panel animate-pop-in flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-extrabold text-brown">Start studying</h2>
            <p className="text-sm text-olive/80">Open a nook or join one with a code.</p>
          </div>

          {error && (
            <p className="rounded-2xl bg-rose/20 px-4 py-2 text-sm font-semibold text-brown">
              {error}
            </p>
          )}

          {!showCreate && !showJoin && (
            <div className="flex flex-col gap-3">
              <button onClick={() => setShowCreate(true)} className="btn-primary text-lg">
                Create a nook
              </button>
              <button onClick={() => setShowJoin(true)} className="btn-secondary text-lg">
                Join with a code
              </button>
            </div>
          )}

          {showCreate && (
            <div className="flex flex-col gap-4 animate-pop-in">
              <div>
                <label className="mb-1 block text-sm font-bold text-olive">Nook name</label>
                <input
                  className="input-cozy"
                  placeholder="Cozy evening study"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-olive">
                  How many seats? {tableShapeLabel(capacity)}
                </label>
                <div className="flex flex-wrap gap-2">
                  {CAPACITY_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCapacity(n)}
                      className={`min-w-[2.5rem] flex-1 rounded-2xl py-3 text-sm font-extrabold transition-all ${
                        capacity === n
                          ? "scale-105 bg-peach text-white shadow-cozy"
                          : "bg-cream text-brown/60 hover:bg-cream/80"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="btn-ghost flex-1">
                  Back
                </button>
                <button onClick={handleCreate} disabled={busy} className="btn-primary flex-1">
                  {busy ? "Opening…" : "Open nook"}
                </button>
              </div>
            </div>
          )}

          {showJoin && (
            <div className="flex flex-col gap-3 animate-pop-in">
              <label className="text-sm font-bold text-olive">Room code</label>
              <input
                className="input-cozy uppercase tracking-widest"
                placeholder="ABC123"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <div className="flex gap-3">
                <button onClick={() => setShowJoin(false)} className="btn-ghost flex-1">
                  Back
                </button>
                <button onClick={handleJoin} disabled={busy} className="btn-primary flex-1">
                  {busy ? "Joining…" : "Join nook"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="panel animate-pop-in flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-brown">Your Nooks</h2>
              <p className="text-sm text-olive/80">
                Nooks you have opened or joined with friends.
              </p>
            </div>
            {userNooks.length > 0 && !selectionMode && (
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                className="btn-ghost shrink-0 !px-4 !py-2 text-sm"
              >
                Select
              </button>
            )}
          </div>

          {selectionMode && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (allSelected) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(userNooks.map((n) => n.id)));
                  }
                }}
                className="btn-ghost !px-4 !py-2 text-sm"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={selectedCount === 0 || deleting}
                className="rounded-full bg-rose/80 px-4 py-2 text-sm font-bold text-brown shadow-cozy transition-all hover:brightness-95 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                {deleting ? "Removing…" : `Delete (${selectedCount})`}
              </button>
              <button
                type="button"
                onClick={exitSelectionMode}
                className="btn-ghost !px-4 !py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          )}

          {userNooks.length === 0 ? (
            <p className="rounded-2xl bg-cream/60 px-4 py-5 text-center text-sm text-olive/70">
              No nooks yet. Create one above or join a friend&apos;s nook with a code.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {userNooks.map((nook) => (
                <NookCard
                  key={nook.id}
                  nook={nook}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(nook.id)}
                  onToggleSelect={() => toggleSelect(nook.id)}
                  onJoin={() => navigate(`/room/${nook.id}`)}
                />
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-xs font-semibold text-olive/50">{APP_VERSION_LABEL}</p>
      </main>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-pop-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-nooks-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-brown/40 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="panel relative z-10 flex w-full max-w-sm flex-col gap-4 p-6 shadow-cozy-lg">
            <h3 id="delete-nooks-title" className="text-lg font-extrabold text-brown">
              Remove selected nooks from your list?
            </h3>
            <p className="text-sm text-olive/80">
              {selectedCount === 1
                ? "This nook will be removed from your list."
                : `${selectedCount} nooks will be removed from your list.`}
              {" "}
              Nooks you own with other members will stay open for them. Empty nooks you own
              will be deleted.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-ghost flex-1"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex-1 rounded-full bg-rose/80 px-4 py-3 text-sm font-bold text-brown shadow-cozy transition-all hover:brightness-95 active:scale-95 disabled:opacity-50"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
