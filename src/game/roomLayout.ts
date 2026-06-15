import type { Obstacle } from "./pathfinding";

export const VALID_CAPACITIES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type RoomCapacity = (typeof VALID_CAPACITIES)[number];

export interface RoundTableLayout {
  shape: "round";
  outerW: number;
  outerH: number;
  innerW: number;
  innerH: number;
  seatOffset: number;
}

export interface RectTableLayout {
  shape: "square" | "rect";
  tw: number;
  th: number;
  seatOffset: number;
  sideCounts: [number, number, number, number];
}

export type TableLayout = RoundTableLayout | RectTableLayout;

/**
 * Global up-scale applied to seating, tables and lounge furniture (NOT
 * bookshelves or windows) so they read proportionally to the large windows.
 * Feeds the table/seat layout here and the furniture draws/obstacles, which all
 * multiply by it, keeping rendering and pathfinding in sync.
 */
export const FURNITURE_SCALE = 1.7;

/** Chair half-width and depth — matches LibraryScene.drawChair geometry. */
export const CHAIR_HALF_W = 24 * FURNITURE_SCALE;
export const CHAIR_BACK = 32 * FURNITURE_SCALE;
export const CHAIR_FRONT = 16 * FURNITURE_SCALE;

/** Padding around table+seats for the study rug — tight enough that the study
 * cluster reads as the dominant focal point without excess empty floor. */
export const RUG_PAD = 26 * FURNITURE_SCALE;

const ROUND_TABLE_SIZES: Record<number, Omit<RoundTableLayout, "shape" | "seatOffset">> = {
  1: { outerW: 80, outerH: 52, innerW: 64, innerH: 40 },
  2: { outerW: 96, outerH: 62, innerW: 76, innerH: 48 },
  3: { outerW: 112, outerH: 72, innerW: 88, innerH: 56 },
};

const SQUARE_TABLE_SIZE = 104;

/** Rectangle tables sized to fit the study zone with SEAT_OFFSET chairs. */
const RECT_TABLE_LAYOUTS: Record<
  number,
  { tw: number; th: number; sideCounts: [number, number, number, number] }
> = {
  5: { tw: 148, th: 62, sideCounts: [2, 1, 2, 0] },
  6: { tw: 158, th: 64, sideCounts: [2, 1, 2, 1] },
  7: { tw: 168, th: 66, sideCounts: [2, 2, 2, 1] },
  8: { tw: 178, th: 68, sideCounts: [3, 1, 3, 1] },
};

/** Pixels from table edge to chair center — used for every table shape. */
export const SEAT_OFFSET = 52 * FURNITURE_SCALE;

export interface StudyFootprint {
  halfW: number;
  halfH: number;
}

export interface StudyPlacement {
  cx: number;
  cy: number;
  rugW: number;
  rugH: number;
  footprint: StudyFootprint;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Distance from ellipse center to perimeter along `angle` (radians). */
export function ellipseRadiusAtAngle(semiW: number, semiH: number, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (semiW * semiH) / Math.sqrt((semiH * cos) ** 2 + (semiW * sin) ** 2);
}

const CHAIR_CORNERS: [number, number][] = [
  [-CHAIR_HALF_W, -CHAIR_BACK],
  [CHAIR_HALF_W, -CHAIR_BACK],
  [-CHAIR_HALF_W, CHAIR_FRONT],
  [CHAIR_HALF_W, CHAIR_FRONT],
];

function expandFootprint(
  footprint: StudyFootprint,
  sx: number,
  sy: number,
  face: number
): StudyFootprint {
  let { halfW, halfH } = footprint;
  for (const [lx, ly] of CHAIR_CORNERS) {
    const wx = sx + lx * Math.cos(face) - ly * Math.sin(face);
    const wy = sy + lx * Math.sin(face) + ly * Math.cos(face);
    halfW = Math.max(halfW, Math.abs(wx));
    halfH = Math.max(halfH, Math.abs(wy));
  }
  return { halfW, halfH };
}

function roundTableFootprint(layout: RoundTableLayout, capacity: number): StudyFootprint {
  const semiW = layout.innerW / 2;
  const semiH = layout.innerH / 2;
  let footprint: StudyFootprint = { halfW: semiW, halfH: semiH };

  for (let i = 0; i < capacity; i++) {
    const angle = (Math.PI * 2 * i) / capacity - Math.PI / 2;
    const edgeR = ellipseRadiusAtAngle(semiW, semiH, angle);
    const seatR = edgeR + layout.seatOffset;
    const sx = Math.cos(angle) * seatR;
    const sy = Math.sin(angle) * seatR;
    footprint = expandFootprint(footprint, sx, sy, angle + Math.PI / 2);
  }

  return footprint;
}

function rectTableFootprint(layout: RectTableLayout): StudyFootprint {
  const { tw, th, seatOffset, sideCounts } = layout;
  const halfW = tw / 2;
  const halfH = th / 2;
  const [top, right, bottom, left] = sideCounts;
  let footprint: StudyFootprint = { halfW, halfH };

  const addSide = (
    count: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
    face: number
  ) => {
    if (count <= 0) return;
    if (count === 1) {
      footprint = expandFootprint(footprint, (start.x + end.x) / 2, (start.y + end.y) / 2, face);
      return;
    }
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      footprint = expandFootprint(
        footprint,
        start.x + (end.x - start.x) * t,
        start.y + (end.y - start.y) * t,
        face
      );
    }
  };

  addSide(
    top,
    { x: -halfW, y: -halfH - seatOffset },
    { x: halfW, y: -halfH - seatOffset },
    0
  );
  addSide(
    right,
    { x: halfW + seatOffset, y: -halfH },
    { x: halfW + seatOffset, y: halfH },
    Math.PI / 2
  );
  addSide(
    bottom,
    { x: halfW, y: halfH + seatOffset },
    { x: -halfW, y: halfH + seatOffset },
    Math.PI
  );
  addSide(
    left,
    { x: -halfW - seatOffset, y: halfH },
    { x: -halfW - seatOffset, y: -halfH },
    -Math.PI / 2
  );

  return footprint;
}

/** Bounding half-extents of table + all chairs (center-relative). */
export function computeStudyFootprint(layout: TableLayout, capacity: number): StudyFootprint {
  if (layout.shape === "round") {
    return roundTableFootprint(layout, capacity);
  }
  return rectTableFootprint(layout);
}

type CapacityTier = "small" | "medium" | "large";

function capacityTier(cap: RoomCapacity): CapacityTier {
  if (cap <= 2) return "small";
  if (cap <= 4) return "medium";
  return "large";
}

/** Study zone grows vertically for 3+ seats so tables and chairs fit. */
function studyZoneForCapacity(cap: RoomCapacity) {
  if (cap <= 2) return ZONES.study;
  return { ...ZONES.study, y0: 0.4, y1: 0.8 };
}

// Study seating is the room's centrepiece: nudged toward the visual hero zone
// (slightly right of centre) so the camera frames the table cluster first.
const DEFAULT_STUDY_CENTER: Record<CapacityTier, { x: number; y: number }> = {
  small: { x: 0.54, y: 0.5 },
  medium: { x: 0.53, y: 0.51 },
  large: { x: 0.52, y: 0.52 },
};

/** Table shape and size for a room capacity — shared by LibraryScene and pathfinding. */
export function getTableLayout(capacity: number): TableLayout {
  const cap = normalizeCapacity(capacity);
  const F = FURNITURE_SCALE;

  if (cap <= 3) {
    const t = ROUND_TABLE_SIZES[cap];
    return {
      shape: "round",
      outerW: t.outerW * F,
      outerH: t.outerH * F,
      innerW: t.innerW * F,
      innerH: t.innerH * F,
      seatOffset: SEAT_OFFSET,
    };
  }

  if (cap === 4) {
    return {
      shape: "square",
      tw: SQUARE_TABLE_SIZE * F,
      th: SQUARE_TABLE_SIZE * F,
      seatOffset: SEAT_OFFSET,
      sideCounts: [1, 1, 1, 1],
    };
  }

  const layout = RECT_TABLE_LAYOUTS[cap] ?? RECT_TABLE_LAYOUTS[8];
  return {
    shape: "rect",
    tw: layout.tw * F,
    th: layout.th * F,
    seatOffset: SEAT_OFFSET,
    sideCounts: layout.sideCounts,
  };
}

export function normalizeCapacity(capacity: number): RoomCapacity {
  return (VALID_CAPACITIES as readonly number[]).includes(capacity)
    ? (capacity as RoomCapacity)
    : 4;
}

/**
 * Room world-size multiplier by capacity. Applied to the fixed reference rect
 * (REFERENCE_ROOM_W/H) so furniture — which uses absolute pixel sizes — reads
 * larger relative to the floor in small nooks and the room grows gently for
 * bigger groups while staying cozy.
 */
const ROOM_SCALE: Record<RoomCapacity, number> = {
  1: 0.7,
  2: 0.74,
  3: 0.8,
  4: 0.86,
  5: 0.93,
  6: 0.98,
  7: 1.02,
  8: 1.06,
};

export function roomScaleForCapacity(capacity: number): number {
  return ROOM_SCALE[normalizeCapacity(capacity)] ?? 1.3;
}

/** Largest room scale across all capacities. */
export function maxRoomScale(): number {
  return Math.max(...Object.values(ROOM_SCALE));
}

/** Fixed reference room rect (3:2) — layout lives in stable world units so
 * resize and browser zoom only change the camera, never furniture proportions. */
export const REFERENCE_ROOM_W = 840;
export const REFERENCE_ROOM_H = 560;

export interface RoomSize {
  w: number;
  h: number;
}

/** Logical room rect for a capacity in fixed world coordinates. */
export function getRoomSize(capacity: number): RoomSize {
  const s = roomScaleForCapacity(capacity);
  return { w: REFERENCE_ROOM_W * s, h: REFERENCE_ROOM_H * s };
}

/** Gentle per-capacity camera nudge on top of the fit-to-viewport zoom. */
const ROOM_ZOOMS: Record<RoomCapacity, number> = {
  1: 1.04,
  2: 1.03,
  3: 1.02,
  4: 1.01,
  5: 1.0,
  6: 1.0,
  7: 0.99,
  8: 0.98,
};

export function roomZoomForCapacity(capacity: number): number {
  return ROOM_ZOOMS[normalizeCapacity(capacity)] ?? 1;
}

export interface FurniturePlan {
  loungeRug: boolean;
  /** Campfire is now decorative only — no seats ring it (campfireChairs is 0). */
  campfire: boolean;
  campfireChairs: number;
  /** Fire pit visual scale by capacity tier. */
  campfireScale: number;
  sofaH: boolean;
  sofaV: boolean;
  coffeeTable: boolean;
  sideTableLeft: boolean;
  sideTableRight: boolean;
  floorLamp: boolean;
  fireplace: boolean;
  /** @deprecated lower-floor decor removed — always 0 */
  readingNooks: number;
}

export interface CampChairSpot {
  x: number;
  y: number;
  face: number;
}

export interface CampfireLayout {
  fireX: number;
  fireY: number;
  chairs: CampChairSpot[];
}

/**
 * Which lounge/decor pieces to place for a capacity. Every room gets a campfire
 * as a decorative hearth (no seats ring it); wall bookshelves, plants and
 * windows scale with room fractions.
 */
export function getFurniturePlan(capacity: number): FurniturePlan {
  const cap = normalizeCapacity(capacity);
  // Campfire is decorative only now — no stools ring it, so usable seats are
  // exactly the study chairs (0 campfire chairs keeps totalSeatCount === cap).
  const campfireChairs = 0;
  const campfireScale =
    cap <= 2 ? 0.55 : cap <= 4 ? 0.7 : cap <= 6 ? 0.8 : 0.88;

  return {
    loungeRug: true,
    campfire: true,
    campfireChairs,
    campfireScale,
    sofaH: false,
    sofaV: false,
    coffeeTable: false,
    sideTableLeft: false,
    sideTableRight: false,
    floorLamp: true,
    fireplace: false,
    readingNooks: 0,
  };
}

/**
 * Non-overlapping room zones (fractions of room W/H).
 * Fireplace lounge 0–28% left · Study center-right · Bookshelves line the top
 * wall (either side of the windows) and the full right wall.
 */
export const ZONES = {
  lounge: { x0: 0, x1: 0.3, y0: 0.34, y1: 0.8 },
  fireplace: { x0: 0.02, x1: 0.18, y0: 0.26, y1: 0.46 },
  study: { x0: 0.3, x1: 0.78, y0: 0.36, y1: 0.7 },
  shelfTop: { y0: 0, y1: 0.2 },
  shelfRight: { x0: 0.88, x1: 1.0 },
} as const;

/**
 * Shared furniture anchors — keep LibraryScene drawing and pathfinding in sync.
 * The lounge is a tight cluster on the left: hearth at the top, a coffee table
 * and rug below it, and the couch facing up toward the fire, with the reading
 * lamp at the couch's side.
 */
export const L = {
  floorTop: 0.22,
  loungeRugCx: 0.13,
  loungeRugCy: 0.58,
  loungeRugW: 0.28,
  loungeRugH: 0.3,
  fireplaceX: 0.1,
  fireplaceY: 0.34,
  sofaHX: 0.04,
  sofaHY: 0.66,
  sofaVX: 0.2,
  sofaVY: 0.5,
  coffeeX: 0.11,
  coffeeY: 0.56,
  sideTableLeftX: 0.04,
  sideTableLeftY: 0.5,
  sideTableRightX: 0.21,
  sideTableRightY: 0.7,
  // Reading floor lamp now stands just left of the study (between the lounge and
  // the study cluster) to light the study area — no longer in the lounge.
  floorLampX: 0.31,
  floorLampY: 0.5,
  // Bookshelves sized to read in proportion with the central seating cluster.
  shelfTopY: 0.02,
  shelfTopH: 0.14,
  shelfRightX: 0.91,
  shelfRightW: 0.065,
} as const;

// Bookshelves pack the top wall on both sides of the three windows (centres at
// 0.33 / 0.5 / 0.67), giving a dense, library-like back wall.
export const TOP_SHELVES = [
  { x: 0.03, w: 0.062 },
  { x: 0.1, w: 0.062 },
  { x: 0.17, w: 0.062 },
  { x: 0.76, w: 0.062 },
  { x: 0.83, w: 0.062 },
  { x: 0.9, w: 0.062 },
] as const;

// Four stacked rows line the full right wall like library stacks.
export const RIGHT_SHELVES = [
  { y: 0.27, h: 0.135 },
  { y: 0.43, h: 0.135 },
  { y: 0.59, h: 0.135 },
  { y: 0.75, h: 0.11 },
] as const;

// Plants along the right wall only — no floor decor in the campfire lounge.
export const PLANT_SPOTS = [
  { x: 0.82, y: 0.48, scale: 0.85, variant: "round" as const },
  { x: 0.82, y: 0.66, scale: 0.8, variant: "yucca" as const },
] as const;

/**
 * Reading-nook clusters placed in distinct, intentional spots (not a uniform
 * row): three along the lower floor plus one in the right-centre gap between
 * the study and the bookshelves. Each is drawn with a different composition
 * (variant = index) so no two look copy-pasted. The first N (plan.readingNooks)
 * are placed, so density rises with capacity. All sit clear of the study seats.
 */
export const READING_NOOKS = [
  { x: 0.52, y: 0.83 },
  { x: 0.22, y: 0.83 },
  { x: 0.78, y: 0.55 },
  { x: 0.82, y: 0.84 },
] as const;

/** Total interactive seats: study chairs + campfire stools. */
export function totalSeatCount(capacity: number): number {
  const cap = normalizeCapacity(capacity);
  return cap + getFurniturePlan(cap).campfireChairs;
}

export function isCampfireSeatSlot(slot: number, capacity: number): boolean {
  const cap = normalizeCapacity(capacity);
  return slot >= cap && slot < totalSeatCount(capacity);
}

/** Camp chairs arranged in a semi-circle around the campfire, facing inward. */
export function getCampfireLayout(
  w: number,
  h: number,
  chairCount: number,
  fireScale = 1
): CampfireLayout {
  const fireX = w * L.loungeRugCx;
  const fireY = h * (L.loungeRugCy + 0.03);
  const radiusX = w * 0.072 * fireScale;
  const radiusY = h * 0.058 * fireScale;
  const startAngle = Math.PI * 0.12;
  const endAngle = Math.PI * 0.88;
  const chairs: CampChairSpot[] = [];
  for (let i = 0; i < chairCount; i++) {
    const t = chairCount === 1 ? 0.5 : i / (chairCount - 1);
    const angle = startAngle + t * (endAngle - startAngle);
    const x = fireX + Math.cos(angle) * radiusX;
    const y = fireY + Math.sin(angle) * radiusY;
    const face = Math.atan2(fireY - y, fireX - x);
    chairs.push({ x, y, face });
  }
  return { fireX, fireY, chairs };
}

/** Study table center + rug sized to wrap table and all seats for this capacity. */
export function getStudyPlacement(capacity: number, w: number, h: number): StudyPlacement {
  const cap = normalizeCapacity(capacity);
  const layout = getTableLayout(cap);
  const footprint = computeStudyFootprint(layout, cap);
  const zone = studyZoneForCapacity(cap);
  const tier = capacityTier(cap);
  const defaults = DEFAULT_STUDY_CENTER[tier];

  const rugHalfW = footprint.halfW + RUG_PAD;
  const rugHalfH = footprint.halfH + RUG_PAD;

  const minCx = w * zone.x0 + rugHalfW;
  const maxCx = w * zone.x1 - rugHalfW;
  const minCy = h * zone.y0 + rugHalfH;
  const maxCy = h * zone.y1 - rugHalfH;

  let cx = w * defaults.x;
  let cy = h * defaults.y;

  // Clear floor lamp on the lounge/study boundary (~31%, 58%).
  const lampRight = w * L.floorLampX + 28;
  const studyLeft = cx - footprint.halfW;
  if (studyLeft < lampRight) {
    cx = lampRight + footprint.halfW + 8;
  }

  cx = minCx <= maxCx ? clamp(cx, minCx, maxCx) : w * (zone.x0 + zone.x1) / 2;
  cy = minCy <= maxCy ? clamp(cy, minCy, maxCy) : h * (zone.y0 + zone.y1) / 2;

  return {
    cx,
    cy,
    rugW: rugHalfW * 2,
    rugH: rugHalfH * 2,
    footprint,
  };
}

export function studyCenter(
  capacity: number,
  w: number,
  h: number
): { x: number; y: number } {
  const { cx, cy } = getStudyPlacement(capacity, w, h);
  return { x: cx, y: cy };
}

/**
 * Static furniture obstacles (table added separately). Gated by the capacity
 * furniture plan so obstacles always match exactly what LibraryScene draws —
 * otherwise the nav grid would block walking through furniture that isn't there
 * (or let avatars walk through furniture that is).
 */
export function buildFurnitureObstacles(
  w: number,
  h: number,
  plan: FurniturePlan = getFurniturePlan(8)
): Obstacle[] {
  const obstacles: Obstacle[] = [];

  for (const shelf of TOP_SHELVES) {
    obstacles.push({
      type: "rect",
      x: w * shelf.x,
      y: h * L.shelfTopY,
      w: w * shelf.w,
      h: h * L.shelfTopH,
      pad: 6,
    });
  }

  for (const shelf of RIGHT_SHELVES) {
    obstacles.push({
      type: "rect",
      x: w * L.shelfRightX,
      y: h * shelf.y,
      w: w * L.shelfRightW,
      h: h * shelf.h,
      pad: 6,
    });
  }

  // Furniture obstacle bounds track the FURNITURE_SCALE up-scaling of the draws.
  const F = FURNITURE_SCALE;
  if (plan.campfire) {
    const layout = getCampfireLayout(
      w,
      h,
      plan.campfireChairs,
      plan.campfireScale
    );
    obstacles.push({
      type: "ellipse",
      cx: layout.fireX,
      cy: layout.fireY,
      rx: 38 * F * plan.campfireScale,
      ry: 32 * F * plan.campfireScale,
      pad: 10,
    });
    for (const chair of layout.chairs) {
      obstacles.push({
        type: "ellipse",
        cx: chair.x,
        cy: chair.y,
        rx: 22 * F,
        ry: 16 * F,
        pad: 6,
      });
    }
  }
  if (plan.fireplace) {
    // Grand fireplace (back-left, mantel clear).
    obstacles.push({ type: "rect", x: w * L.fireplaceX - 65 * F, y: h * L.fireplaceY - 18 * F, w: 130 * F, h: 122 * F, pad: 8 });
  }
  if (plan.sofaH) {
    obstacles.push({ type: "rect", x: w * L.sofaHX, y: h * L.sofaHY - 16 * F, w: 104 * F, h: 58 * F, pad: 8 });
  }
  if (plan.sofaV) {
    obstacles.push({ type: "rect", x: w * L.sofaVX - 14 * F, y: h * L.sofaVY, w: 56 * F, h: 104 * F, pad: 8 });
  }
  if (plan.coffeeTable) {
    obstacles.push({ type: "rect", x: w * L.coffeeX - 30 * F, y: h * L.coffeeY - 18 * F, w: 60 * F, h: 42 * F, pad: 6 });
  }
  if (plan.sideTableLeft) {
    obstacles.push({ type: "rect", x: w * L.sideTableLeftX - 20 * F, y: h * L.sideTableLeftY, w: 40 * F, h: 30 * F, pad: 4 });
  }
  if (plan.sideTableRight) {
    obstacles.push({ type: "rect", x: w * L.sideTableRightX - 20 * F, y: h * L.sideTableRightY, w: 40 * F, h: 30 * F, pad: 4 });
  }
  if (plan.floorLamp) {
    // Floor lamp (lounge zone, clear of fireplace)
    obstacles.push({ type: "ellipse", cx: w * L.floorLampX, cy: h * L.floorLampY, rx: 16 * F, ry: 18 * F, pad: 4 });
  }

  // Lower-floor decor removed — readingNooks is always 0 (loop is inert).
  for (let i = 0; i < plan.readingNooks; i++) {
    const nook = READING_NOOKS[i];
    if (!nook) continue;
    // Generous box covering every nook composition (armchair/loveseat + side
    // table + plant), so avatars route around whichever variant. Bounds are in
    // final px (the nook pieces bake in FURNITURE_SCALE themselves).
    obstacles.push({
      type: "rect",
      x: w * nook.x - 150,
      y: h * nook.y - 60,
      w: 300,
      h: 120,
      pad: 6,
    });
  }

  for (const plant of PLANT_SPOTS) {
    obstacles.push({
      type: "ellipse",
      cx: w * plant.x,
      cy: h * plant.y,
      rx: 14 * plant.scale,
      ry: 18 * plant.scale,
      pad: 4,
    });
  }

  return obstacles;
}
