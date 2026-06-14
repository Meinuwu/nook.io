import type { AvatarSlot } from "./avatarTypes";

export interface AvatarPart {
  id: string;
  label: string;
  /** When true, the part is shipped and selectable. v1 ships only defaults. */
  available: boolean;
}

export interface AvatarSlotDef {
  slot: AvatarSlot;
  label: string;
  /** Number of "Coming soon" placeholder tiles to show in the builder. */
  placeholderCount: number;
  parts: AvatarPart[];
}

/**
 * v1 catalog: only the bare-bones default look is available per slot.
 * Adding real parts later is just appending entries here (and dropping art);
 * the builder and compositor already read from this registry.
 */
export const AVATAR_CATALOG: AvatarSlotDef[] = [
  {
    slot: "expression",
    label: "Expression",
    placeholderCount: 5,
    parts: [{ id: "default", label: "Default", available: true }],
  },
  {
    slot: "clothing",
    label: "Clothing",
    placeholderCount: 6,
    parts: [{ id: "default", label: "Cozy Tee", available: true }],
  },
  {
    slot: "hat",
    label: "Hats",
    placeholderCount: 6,
    parts: [{ id: "none", label: "None", available: true }],
  },
  {
    slot: "held_item",
    label: "Held Items",
    placeholderCount: 5,
    parts: [{ id: "none", label: "None", available: true }],
  },
  {
    slot: "shoes",
    label: "Shoes",
    placeholderCount: 5,
    parts: [{ id: "default", label: "Sneakers", available: true }],
  },
];

export function getSlotDef(slot: AvatarSlot): AvatarSlotDef {
  return AVATAR_CATALOG.find((s) => s.slot === slot)!;
}
