import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/useAuth";
import { findRoomByCode, initBackend } from "../lib/backend";

const PENDING_JOIN_KEY = "nook.pendingJoinCode";

/** Redirect /join/ABC123 → /room/:id after looking up the shared room code. */
export default function JoinPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    let active = true;
    (async () => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        setError("Missing room code.");
        return;
      }

      if (!profile) {
        sessionStorage.setItem(PENDING_JOIN_KEY, trimmed);
        navigate("/auth", { replace: true });
        return;
      }

      if (!profile.avatarCreated) {
        sessionStorage.setItem(PENDING_JOIN_KEY, trimmed);
        navigate("/onboarding", { replace: true });
        return;
      }

      await initBackend();
      if (!active) return;

      try {
        const room = await findRoomByCode(trimmed);
        if (!room) {
          setError("No nook found with that code.");
          return;
        }
        sessionStorage.removeItem(PENDING_JOIN_KEY);
        navigate(`/room/${room.id}`, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not join nook.");
      }
    })();

    return () => {
      active = false;
    };
  }, [code, navigate, profile, loading]);

  if (loading) {
    return (
      <div className="cozy-bg flex h-full items-center justify-center p-6">
        <p className="text-xl font-extrabold text-brown">Finding your nook…</p>
      </div>
    );
  }

  return (
    <div className="cozy-bg flex h-full flex-col items-center justify-center gap-4 p-6">
      {error ? (
        <>
          <p className="text-lg font-bold text-brown">{error}</p>
          <button type="button" onClick={() => navigate("/home")} className="btn-primary">
            Back home
          </button>
        </>
      ) : (
        <div className="animate-bob text-center">
          <p className="text-xl font-extrabold text-brown">Finding your nook…</p>
          <p className="mt-2 text-brown/70">Code: {code.toUpperCase()}</p>
        </div>
      )}
    </div>
  );
}

export function consumePendingJoinCode(): string | null {
  const code = sessionStorage.getItem(PENDING_JOIN_KEY);
  if (code) sessionStorage.removeItem(PENDING_JOIN_KEY);
  return code;
}
