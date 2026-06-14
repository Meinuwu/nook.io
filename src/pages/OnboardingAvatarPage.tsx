import { useNavigate } from "react-router-dom";
import CharacterBuilder from "../components/CharacterBuilder";
import { useAuth } from "../lib/useAuth";
import type { AvatarConfig } from "../lib/avatarTypes";

export default function OnboardingAvatarPage() {
  const navigate = useNavigate();
  const { profile, saveAvatar } = useAuth();

  if (!profile) return null;

  async function handleSave(config: AvatarConfig) {
    await saveAvatar(config, true);
    navigate("/home", { replace: true });
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-cream to-sage/40 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold text-brown">Create your character</h1>
          <p className="mt-1 text-olive">
            Welcome to Nook! Meet your study buddy before you head in.
          </p>
        </div>
        <CharacterBuilder
          initialConfig={profile.avatarConfig}
          saveLabel="Looks good!"
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
