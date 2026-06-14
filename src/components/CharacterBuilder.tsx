import { useState } from "react";
import VinylAvatar from "./VinylAvatar";
import { AVATAR_CATALOG } from "../lib/avatarCatalog";
import type { AvatarConfig, AvatarSlot } from "../lib/avatarTypes";

interface CharacterBuilderProps {
  initialConfig: AvatarConfig;
  saveLabel: string;
  onSave: (config: AvatarConfig) => void | Promise<void>;
  onCancel?: () => void;
}

export default function CharacterBuilder({
  initialConfig,
  saveLabel,
  onSave,
  onCancel,
}: CharacterBuilderProps) {
  const [config, setConfig] = useState<AvatarConfig>(initialConfig);
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>("expression");
  const [busy, setBusy] = useState(false);

  const slotDef = AVATAR_CATALOG.find((s) => s.slot === activeSlot)!;

  async function handleSave() {
    setBusy(true);
    try {
      await onSave(config);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* preview */}
      <div className="panel flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-white/80 to-sage/30">
        <span className="text-sm font-bold uppercase tracking-wide text-olive">
          Preview
        </span>
        <div className="rounded-4xl bg-cream/70 p-8 shadow-cozy">
          <VinylAvatar size={220} bob />
        </div>
        <p className="text-center text-sm text-brown/60">
          This is your starter look. More styles are on the way!
        </p>
      </div>

      {/* slots */}
      <div className="panel flex flex-col">
        <div className="mb-4 flex flex-wrap gap-2">
          {AVATAR_CATALOG.map((s) => (
            <button
              key={s.slot}
              onClick={() => setActiveSlot(s.slot)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                activeSlot === s.slot
                  ? "bg-peach text-white shadow-cozy"
                  : "bg-cream text-brown/70 hover:bg-cream/70"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-3 gap-3 sm:grid-cols-4">
          {slotDef.parts.map((part) => {
            const selected = config[activeSlot] === part.id;
            return (
              <button
                key={part.id}
                onClick={() => setConfig({ ...config, [activeSlot]: part.id })}
                className={`flex aspect-square flex-col items-center justify-center rounded-2xl border-2 p-2 text-center text-xs font-bold transition-all ${
                  selected
                    ? "border-peach bg-peach/15 text-brown"
                    : "border-wood/20 bg-white/60 text-brown/70 hover:border-wood/40"
                }`}
              >
                <span className="text-lg">{part.id === "none" ? "🚫" : "✓"}</span>
                {part.label}
              </button>
            );
          })}

          {Array.from({ length: slotDef.placeholderCount }).map((_, i) => (
            <div
              key={`ph-${i}`}
              className="flex aspect-square flex-col items-center justify-center rounded-2xl border-2 border-dashed border-wood/25 bg-cream/40 p-2 text-center text-[10px] font-bold text-brown/35"
            >
              <span className="mb-1 text-base">🔒</span>
              Coming soon
            </div>
          ))}
        </div>

        {slotDef.parts.length === 1 && slotDef.parts[0].id === "none" && (
          <p className="mt-3 text-center text-sm text-brown/50">
            Nothing here yet — check back soon!
          </p>
        )}

        <div className="mt-5 flex gap-3">
          {onCancel && (
            <button onClick={onCancel} className="btn-ghost flex-1">
              Cancel
            </button>
          )}
          <button onClick={handleSave} disabled={busy} className="btn-primary flex-1">
            {busy ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
