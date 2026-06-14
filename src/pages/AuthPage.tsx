import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NookLogo from "../components/NookLogo";
import { useAuth } from "../lib/useAuth";
import { normalizeUsername } from "../lib/backend";

type Mode = "login" | "signup";

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [inviterUsername, setInviterUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "signup" || usernameTouched || !email.includes("@")) return;
    const suggested = normalizeUsername(email.split("@")[0] || "");
    setUsername(suggested);
  }, [email, mode, usernameTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const profile = await login(email, password);
        navigate(profile.avatarCreated ? "/home" : "/onboarding", { replace: true });
      } else {
        const inviter = inviterUsername.trim() || undefined;
        await signUp(email, password, username.trim() || undefined, inviter);
        navigate("/onboarding", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cozy-bg flex h-full items-center justify-center p-6">
      <div className="panel w-full max-w-md animate-pop-in">
        <div className="mb-6 flex justify-center">
          <NookLogo size={56} />
        </div>

        <div className="mb-6 flex rounded-full bg-cream p-1">
          {(["login", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded-full py-2 font-bold transition-colors ${
                mode === m ? "bg-peach text-white shadow-cozy" : "text-brown/60"
              }`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-olive">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-cozy"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-olive">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-cozy"
            />
          </div>

          {mode === "signup" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-bold text-olive">Username</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-olive/60">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsernameTouched(true);
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                    }}
                    placeholder="yourname"
                    className="input-cozy pl-8 font-mono text-sm"
                    minLength={3}
                    maxLength={20}
                  />
                </div>
                <p className="mt-1 text-xs text-olive/60">
                  3–20 characters: lowercase letters, numbers, underscores
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-olive">
                  Friend&apos;s @username{" "}
                  <span className="font-normal text-olive/60">(optional)</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-olive/60">
                    @
                  </span>
                  <input
                    type="text"
                    value={inviterUsername}
                    onChange={(e) =>
                      setInviterUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                    }
                    placeholder="friend_username"
                    className="input-cozy pl-8 font-mono text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="rounded-2xl bg-rose/20 px-4 py-2 text-sm font-semibold text-brown">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-2">
            {busy ? "One sec…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-brown/60">
          {mode === "login"
            ? "New here? Switch to Sign up to make your nook."
            : "After signing up you'll create your study avatar."}
        </p>
      </div>
    </div>
  );
}
