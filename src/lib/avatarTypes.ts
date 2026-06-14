export type AvatarSlot =
  | "expression"
  | "clothing"
  | "hat"
  | "held_item"
  | "shoes";

export type AvatarConfig = Record<AvatarSlot, string>;

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  expression: "default",
  clothing: "default",
  hat: "none",
  held_item: "none",
  shoes: "default",
};

export type PresenceStatus = "idle" | "studying" | "break";
