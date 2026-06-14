import StatusIndicator, { type OnlineStatus } from "./StatusIndicator";

interface ProfileAvatarProps {
  displayName?: string;
  profilePhotoUrl?: string | null;
  size?: number;
  showStatus?: boolean;
  status?: OnlineStatus;
  className?: string;
  onClick?: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileAvatar({
  displayName = "Friend",
  profilePhotoUrl,
  size = 40,
  showStatus = false,
  status = "offline",
  className = "",
  onClick,
}: ProfileAvatarProps) {
  const inner = profilePhotoUrl ? (
    <img
      src={profilePhotoUrl}
      alt=""
      className="h-full w-full object-cover"
      draggable={false}
    />
  ) : (
    <span
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sage/40 to-peach/30 text-brown/70"
      style={{ fontSize: Math.max(size * 0.32, 10) }}
      aria-hidden
    >
      {initials(displayName)}
    </span>
  );

  const avatarCircleClass = `h-full w-full overflow-hidden rounded-full border-2 border-white bg-cream shadow-cozy ${className}`;

  const content = (
    <>
      <div className={avatarCircleClass}>{inner}</div>
      {showStatus && <StatusIndicator status={status} avatarSize={size} />}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative shrink-0"
        style={{ width: size, height: size }}
        aria-label={`${displayName}'s profile photo`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      {content}
    </span>
  );
}
