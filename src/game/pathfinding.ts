/** Grid-based A* navigation for the study room floor. */

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface NavGridConfig {
  width: number;
  height: number;
  cellSize?: number;
  floorTop: number;
  /** Lowest walkable world-y. Keeps avatars out of the floor strip that the
   * camera reserves for the bottom HUD bar, so they can never path off-view. */
  floorBottom?: number;
  obstacles: Obstacle[];
}

export type Obstacle =
  | { type: "rect"; x: number; y: number; w: number; h: number; pad?: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; pad?: number };

export class NavGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly floorTop: number;
  readonly floorBottom: number;
  private walkable: boolean[][];

  constructor(config: NavGridConfig) {
    this.cellSize = config.cellSize ?? 18;
    this.cols = Math.ceil(config.width / this.cellSize);
    this.rows = Math.ceil(config.height / this.cellSize);
    this.floorTop = config.floorTop;
    this.floorBottom = config.floorBottom ?? this.rows * this.cellSize - 8;
    this.walkable = this.buildWalkability(config);
  }

  private buildWalkability(config: NavGridConfig): boolean[][] {
    const grid: boolean[][] = [];
    for (let row = 0; row < this.rows; row++) {
      grid[row] = [];
      for (let col = 0; col < this.cols; col++) {
        const wx = col * this.cellSize + this.cellSize / 2;
        const wy = row * this.cellSize + this.cellSize / 2;
        grid[row][col] = this.isWorldPointWalkable(wx, wy, config.obstacles);
      }
    }
    return grid;
  }

  private isWorldPointWalkable(
    wx: number,
    wy: number,
    obstacles: Obstacle[]
  ): boolean {
    if (wy < this.floorTop + 8) return false;
    if (wx < 12 || wy > this.floorBottom) return false;
    if (wx > this.cols * this.cellSize - 12) return false;

    for (const obs of obstacles) {
      const pad = obs.pad ?? 4;
      if (obs.type === "rect") {
        if (
          wx >= obs.x - pad &&
          wx <= obs.x + obs.w + pad &&
          wy >= obs.y - pad &&
          wy <= obs.y + obs.h + pad
        ) {
          return false;
        }
      } else {
        const dx = (wx - obs.cx) / (obs.rx + pad);
        const dy = (wy - obs.cy) / (obs.ry + pad);
        if (dx * dx + dy * dy <= 1) return false;
      }
    }
    return true;
  }

  worldToGrid(wx: number, wy: number): { col: number; row: number } {
    return {
      col: clamp(Math.floor(wx / this.cellSize), 0, this.cols - 1),
      row: clamp(Math.floor(wy / this.cellSize), 0, this.rows - 1),
    };
  }

  gridToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: col * this.cellSize + this.cellSize / 2,
      y: row * this.cellSize + this.cellSize / 2,
    };
  }

  isWalkableWorld(wx: number, wy: number): boolean {
    const { col, row } = this.worldToGrid(wx, wy);
    return this.walkable[row]?.[col] ?? false;
  }

  findNearestWalkable(wx: number, wy: number, maxRadius = 8): { x: number; y: number } | null {
    const { col, row } = this.worldToGrid(wx, wy);
    if (this.walkable[row]?.[col]) return this.gridToWorld(col, row);

    for (let r = 1; r <= maxRadius; r++) {
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;
          const c = col + dc;
          const rr = row + dr;
          if (c < 0 || rr < 0 || c >= this.cols || rr >= this.rows) continue;
          if (this.walkable[rr][c]) return this.gridToWorld(c, rr);
        }
      }
    }
    return null;
  }

  findPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): { x: number; y: number }[] {
    const start = this.worldToGrid(startX, startY);
    const end = this.worldToGrid(endX, endY);

    if (!this.walkable[start.row]?.[start.col] || !this.walkable[end.row]?.[end.col]) {
      const nearEnd = this.findNearestWalkable(endX, endY);
      if (!nearEnd) return [];
      const nearStart = this.findNearestWalkable(startX, startY);
      if (!nearStart) return [{ x: nearEnd.x, y: nearEnd.y }];
      return this.findPath(nearStart.x, nearStart.y, nearEnd.x, nearEnd.y);
    }

    const open: { col: number; row: number; f: number; g: number }[] = [];
    const cameFrom = new Map<string, { col: number; row: number }>();
    const gScore = new Map<string, number>();
    const key = (c: number, r: number) => `${c},${r}`;

    const h = (c: number, r: number) =>
      Math.abs(c - end.col) + Math.abs(r - end.row);

    open.push({ col: start.col, row: start.row, f: h(start.col, start.row), g: 0 });
    gScore.set(key(start.col, start.row), 0);

    const dirs = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift()!;

      if (current.col === end.col && current.row === end.row) {
        const path: { x: number; y: number }[] = [];
        let c = current.col;
        let r = current.row;
        while (true) {
          path.unshift(this.gridToWorld(c, r));
          const prev = cameFrom.get(key(c, r));
          if (!prev) break;
          c = prev.col;
          r = prev.row;
        }
        return simplifyPath(path);
      }

      for (const [dc, dr] of dirs) {
        const nc = current.col + dc;
        const nr = current.row + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        if (!this.walkable[nr][nc]) continue;

        const moveCost = dc !== 0 && dr !== 0 ? 1.414 : 1;
        const tentative = current.g + moveCost;
        const nk = key(nc, nr);
        if (tentative >= (gScore.get(nk) ?? Infinity)) continue;

        cameFrom.set(nk, { col: current.col, row: current.row });
        gScore.set(nk, tentative);
        open.push({ col: nc, row: nr, f: tentative + h(nc, nr), g: tentative });
      }
    }

    return [];
  }

  findRandomWalkable(excludeX?: number, excludeY?: number, minDist = 40): { x: number; y: number } | null {
    const candidates: { x: number; y: number }[] = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (!this.walkable[row][col]) continue;
        const pos = this.gridToWorld(col, row);
        if (excludeX != null && excludeY != null) {
          if (dist(pos.x, pos.y, excludeX, excludeY) < minDist) continue;
        }
        candidates.push(pos);
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}

function simplifyPath(path: { x: number; y: number }[]): { x: number; y: number }[] {
  if (path.length <= 2) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = path[i];
    const next = path[i + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    if (Math.abs(dx1 * dy2 - dy1 * dx2) > 0.01) out.push(curr);
  }
  out.push(path[path.length - 1]);
  return out;
}

import { buildFurnitureObstacles, type FurniturePlan } from "./roomLayout";

/** Build obstacle list matching LibraryScene furniture layout. */
export function buildRoomObstacles(
  w: number,
  h: number,
  cx: number,
  cy: number,
  table:
    | { shape: "round"; outerW: number; outerH: number }
    | { shape: "rect"; tw: number; th: number },
  plan?: FurniturePlan
): Obstacle[] {
  const obstacles: Obstacle[] = buildFurnitureObstacles(w, h, plan);

  if (table.shape === "round") {
    obstacles.push({
      type: "ellipse",
      cx,
      cy,
      rx: table.outerW / 2 + 8,
      ry: table.outerH / 2 + 8,
      pad: 0,
    });
  } else {
    obstacles.push({
      type: "rect",
      x: cx - table.tw / 2 - 8,
      y: cy - table.th / 2 - 4,
      w: table.tw + 16,
      h: table.th + 16,
      pad: 0,
    });
  }

  return obstacles;
}
