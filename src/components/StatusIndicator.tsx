export type OnlineStatus = "online" | "dnd" | "offline";

interface StatusIndicatorProps {
  status: OnlineStatus;
  /** Avatar diameter in px — dot scales to ~22% of this. */
  avatarSize?: number;
  /** "avatar" = badge on profile photo; "inline" = compact dot beside text. */
  variant?: "avatar" | "inline";
  className?: string;
}

const DOT_COLORS: Record<OnlineStatus, string> = {
  online: "bg-[#23a559]",
  dnd: "bg-[#f0b232]",
  offline: "bg-[#80848e]",
};

const STATUS_LABELS: Record<OnlineStatus, string> = {
  online: "Online",
  dnd: "Do not disturb",
  offline: "Offline",
};

export default function StatusIndicator({
  status,
  avatarSize = 40,
  variant = "avatar",
  className = "",
}: StatusIndicatorProps) {
  const dotSize =
    variant === "inline" ? 10 : Math.max(8, Math.round(avatarSize * 0.22));
  const ringWidth = variant === "inline" ? 1.5 : Math.max(2, Math.round(dotSize * 0.2));
  const offset = Math.round(dotSize * 0.12);

  const positionClass =
    variant === "inline" ? "relative inline-flex shrink-0" : "absolute z-10";

  return (
    <span
      className={`${positionClass} flex items-center justify-center rounded-full box-border ${DOT_COLORS[status]} ${className}`}
      style={{
        width: dotSize,
        height: dotSize,
        ...(variant === "avatar"
          ? { bottom: -offset, right: -offset }
          : {}),
        border: `${ringWidth}px solid white`,
      }}
      aria-label={STATUS_LABELS[status]}
    >
      {status === "dnd" && (
        <span
          className="font-black leading-none text-[#4a3728]"
          style={{ fontSize: Math.max(6, Math.round(dotSize * 0.45)) }}
        >
          −
        </span>
      )}
    </span>
  );
}
