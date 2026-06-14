import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import ProfileAvatar from "../components/ProfileAvatar";
import { useAuth } from "../lib/useAuth";

const MAX_BIO_LENGTH = 150;
const MAX_PHOTO_BYTES = 512 * 1024;

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    profile?.profilePhotoUrl ?? null
  );
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!profile) return null;

  function handlePickPhoto() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo must be under 512 KB.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      setPhotoRemoved(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleRemovePhoto() {
    setPhotoPreview(null);
    setPhotoRemoved(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        profilePhotoUrl: photoRemoved ? null : photoPreview,
      });
      navigate("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }

  const username = profile.username ?? profile.email.split("@")[0];

  return (
    <>
      <PageHeader variant="back" title="Edit profile" backTo="/profile" />
      <main className="mx-auto max-w-lg px-4 pb-6 sm:px-6">
        <form onSubmit={handleSave} className="panel animate-pop-in flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3">
            <ProfileAvatar
              displayName={displayName || profile.displayName}
              profilePhotoUrl={photoPreview}
              size={96}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex gap-2">
              <button type="button" onClick={handlePickPhoto} className="btn-secondary text-sm">
                Change photo
              </button>
              {(photoPreview || profile.profilePhotoUrl) && !photoRemoved && (
                <button type="button" onClick={handleRemovePhoto} className="btn-ghost text-sm">
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-olive/70">@{username}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-olive">Nickname</label>
            <input
              className="input-cozy"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              maxLength={40}
              required
            />
            <p className="mt-1 text-xs text-olive/60">
              This is how friends see you — your @username stays the same.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-olive">Bio</label>
            <textarea
              className="input-cozy min-h-[96px] resize-y"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO_LENGTH))}
              placeholder="Tell friends a little about you…"
              maxLength={MAX_BIO_LENGTH}
            />
            <p className="mt-1 text-right text-xs text-olive/60">
              {bio.length}/{MAX_BIO_LENGTH}
            </p>
          </div>

          {error && (
            <p className="rounded-2xl bg-rose/20 px-4 py-2 text-sm font-semibold text-brown">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => navigate("/profile")} className="btn-ghost flex-1">
              Cancel
            </button>
            <button type="submit" disabled={busy || !displayName.trim()} className="btn-primary flex-1">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
