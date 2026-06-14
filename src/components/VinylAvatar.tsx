interface VinylAvatarProps {
  size?: number;
  bob?: boolean;
  className?: string;
}

const FROG_AVATAR_SRC = "/assets/avatar/frog.png";

export default function VinylAvatar({
  size = 160,
  bob = false,
  className = "",
}: VinylAvatarProps) {
  return (
    <div
      className={`${bob ? "animate-bob" : ""} ${className}`}
      style={{ width: size, height: size }}
      aria-label="Your frog avatar"
    >
      <img
        src={FROG_AVATAR_SRC}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="avatar-crisp h-full w-full object-contain"
      />
    </div>
  );
}
