import { useState } from "react";
import { Link } from "react-router-dom";
import NookLogo from "../components/NookLogo";
import { useAuth } from "../lib/useAuth";

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPasswordForEmail(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
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

        <h1 className="mb-2 text-center text-xl font-extrabold text-brown">Reset password</h1>
        <p className="mb-6 text-center text-sm text-olive/80">
          Enter your email and we&apos;ll send a link to choose a new password.
        </p>

        {sent ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="rounded-2xl bg-sage/25 px-4 py-3 text-sm font-semibold text-brown">
              If an account exists for that email, a reset link is on its way. Check your inbox
              (and spam folder).
            </p>
            <Link to="/auth" className="btn-primary text-center">
              Back to log in
            </Link>
          </div>
        ) : (
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

            {error && (
              <p className="rounded-2xl bg-rose/20 px-4 py-2 text-sm font-semibold text-brown">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary mt-2">
              {busy ? "Sending…" : "Send reset link"}
            </button>

            <Link to="/auth" className="text-center text-sm font-semibold text-peach hover:underline">
              Back to log in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
