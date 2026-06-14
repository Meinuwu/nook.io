import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import NookLogo from "../components/NookLogo";
import { useAuth } from "../lib/useAuth";
import { supabase } from "../lib/supabase/client";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword, profile, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setRecoveryReady(true);
        setChecking(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setRecoveryReady(true);
        setChecking(false);
      }
    });

    const timeout = setTimeout(() => {
      if (active) setChecking(false);
    }, 2500);

    return () => {
      active = false;
      clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      navigate(profile?.avatarCreated ? "/home" : "/onboarding", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  if (checking || loading) {
    return (
      <div className="cozy-bg flex h-full items-center justify-center">
        <p className="text-olive animate-pulse text-sm font-semibold">Loading…</p>
      </div>
    );
  }

  if (!recoveryReady) {
    return (
      <div className="cozy-bg flex h-full items-center justify-center p-6">
        <div className="panel w-full max-w-md animate-pop-in text-center">
          <div className="mb-6 flex justify-center">
            <NookLogo size={56} />
          </div>
          <h1 className="mb-2 text-xl font-extrabold text-brown">Link expired or invalid</h1>
          <p className="mb-6 text-sm text-olive/80">
            Request a new password reset link from the log in page.
          </p>
          <Link to="/auth/forgot" className="btn-primary inline-block">
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cozy-bg flex h-full items-center justify-center p-6">
      <div className="panel w-full max-w-md animate-pop-in">
        <div className="mb-6 flex justify-center">
          <NookLogo size={56} />
        </div>

        <h1 className="mb-2 text-center text-xl font-extrabold text-brown">Choose a new password</h1>
        <p className="mb-6 text-center text-sm text-olive/80">
          Pick something cozy but hard to guess.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-olive">New password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-cozy"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-olive">Confirm password</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="input-cozy"
            />
          </div>

          {error && (
            <p className="rounded-2xl bg-rose/20 px-4 py-2 text-sm font-semibold text-brown">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-2">
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
