import { useState } from "react";

export default function NookIdBadge({
  userId,
  compact = false,
}: {
  userId: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl bg-cream/80 ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-olive/70">
          Your Nook ID
        </p>
        <p className={`truncate font-mono font-bold text-brown ${compact ? "text-xs" : "text-sm"}`}>
          {userId}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-xl bg-peach/20 px-3 py-1.5 text-xs font-extrabold text-brown transition-colors hover:bg-peach/35"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
