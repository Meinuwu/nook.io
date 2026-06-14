import { useNavigate } from "react-router-dom";
import CharacterBuilder from "../components/CharacterBuilder";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../lib/useAuth";
import type { AvatarConfig } from "../lib/avatarTypes";

export default function CharacterBuilderPage() {
  const navigate = useNavigate();
  const { profile, saveAvatar } = useAuth();

  if (!profile) return null;

  async function handleSave(config: AvatarConfig) {
    await saveAvatar(config, true);
    navigate("/profile");
  }

  return (
    <>
      <PageHeader variant="back" title="Edit study avatar" backTo="/profile" />
      <div className="mx-auto max-w-4xl px-4 pb-6 sm:px-6">
        <CharacterBuilder
          initialConfig={profile.avatarConfig}
          saveLabel="Save"
          onSave={handleSave}
          onCancel={() => navigate("/profile")}
        />
      </div>
    </>
  );
}
