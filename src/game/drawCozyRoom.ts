import Phaser from "phaser";

/** Cozy kawaii palette — cream walls, warm wood, sage pastels, brown outlines. */
export const C = {
  wall: 0xf8f2e8,
  wallWarm: 0xf5ebe0,
  wallSpeck: 0xe8ddd0,
  floorBase: 0xd4b896,
  plank1: 0xc9a87c,
  plank2: 0xddb892,
  plank3: 0xc4a070,
  plank4: 0xe0c4a0,
  plankLine: 0x9a7048,
  outline: 0x4a3728,
  outlineSoft: 0x5c4838,
  wood: 0xb8895a,
  woodDark: 0x8b6342,
  woodLight: 0xd4a870,
  woodMid: 0xa07850,
  shelf: 0xf5ebe0,
  shelfShadow: 0xe0d4c4,
  sage: 0xa8c4a0,
  sageDark: 0x8fb088,
  sageLight: 0xc8dcc0,
  pink: 0xf0b8c8,
  pinkSoft: 0xf8d0dc,
  mint: 0xb8d8c8,
  rugCream: 0xe8d8c8,
  rugCreamBorder: 0xc8b0a0,
  rugSage: 0xc0d4b8,
  rugSageBorder: 0xa0b898,
  rugDot: 0xfaf5ec,
  lampGlow: 0xffe8b8,
  warmGlow: 0xffd89b,
  sky: 0xa8d8f0,
  skyDeep: 0x6a98c0,
  plant: 0x7ab870,
  plantDark: 0x5a9850,
  plantMint: 0x98d0a8,
  pot: 0xc88860,
  potBlue: 0x88b8d8,
  rose: 0xe8a0b0,
  cream: 0xfaf5ec,
  creamDark: 0xe8dfd4,
  table: 0xc49060,
  tableTop: 0xd8a878,
  chairEmpty: 0xd4a880,
  chairHover: 0xe8c8a8,
  chairTaken: 0xa88060,
  candle: 0xffcc88,
  fire: 0xffa060,
  fireCore: 0xffd888,
  warmTint: 0xffe8c8,
  backdrop: 0x342a22,
  backdropEdge: 0x241c16,
  roomShadow: 0x1a140f,
  text: "#4a3728",
  books: [
    0xc88860, 0x88a8c0, 0xd8a8b0, 0xa0b890, 0xe0c090, 0x9098b0, 0xd0b0a0,
  ] as number[],
};

const STROKE = 2.5;

/** Round to integer for crisp HiDPI rendering. */
export function r(n: number): number {
  return Math.round(n);
}

export function drawOutlinedRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  stroke = C.outline,
  radius = 0,
  lineW = STROKE
): void {
  const rx = r(x);
  const ry = r(y);
  const rw = r(w);
  const rh = r(h);
  g.fillStyle(fill, 1);
  if (radius > 0) {
    g.fillRoundedRect(rx, ry, rw, rh, r(radius));
    g.lineStyle(lineW, stroke, 1);
    g.strokeRoundedRect(rx, ry, rw, rh, r(radius));
  } else {
    g.fillRect(rx, ry, rw, rh);
    g.lineStyle(lineW, stroke, 1);
    g.strokeRect(rx, ry, rw, rh);
  }
}

export function drawOutlinedEllipse(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fill: number,
  stroke = C.outline,
  lineW = STROKE
): void {
  g.fillStyle(fill, 1);
  g.fillEllipse(r(cx), r(cy), r(w), r(h));
  g.lineStyle(lineW, stroke, 1);
  g.strokeEllipse(r(cx), r(cy), r(w), r(h));
}

export function drawOutlinedCircle(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  radius: number,
  fill: number,
  stroke = C.outline,
  lineW = STROKE
): void {
  g.fillStyle(fill, 1);
  g.fillCircle(r(cx), r(cy), r(radius));
  g.lineStyle(lineW, stroke, 1);
  g.strokeCircle(r(cx), r(cy), r(radius));
}

export function drawWarmGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  alpha = 0.08,
  depth = 1
): Phaser.GameObjects.Graphics {
  return scene.add
    .graphics()
    .setDepth(depth)
    .fillStyle(C.warmGlow, alpha)
    .fillCircle(r(x), r(y), r(radius * 0.75));
}

/** Subtle paper-grain speckle — crisp dots, not blur. */
export function drawGrainOverlay(
  scene: Phaser.Scene,
  w: number,
  h: number,
  depth = 4,
  alpha = 0.04
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth).setAlpha(alpha);
  const seed = 42;
  for (let i = 0; i < Math.floor((w * h) / 900); i++) {
    const px = ((seed * 17 + i * 73) % 997) / 997 * w;
    const py = ((seed * 31 + i * 47) % 991) / 991 * h;
    const sz = ((seed + i) % 3) + 1;
    g.fillStyle(C.outline, 0.6);
    g.fillRect(r(px), r(py), sz, sz);
  }
  return g;
}

/**
 * Dark cozy surround behind a centered room rect. Fills a generous area around
 * the [0,0]–[roomW,roomH] room so leftover canvas reads as an intentional
 * darkened border + soft shadow rather than empty space. `viewW/viewH` is the
 * full canvas so the surround always covers the viewport at any gentle zoom.
 */
export function drawRoomBackdrop(
  scene: Phaser.Scene,
  roomW: number,
  roomH: number,
  viewW: number,
  viewH: number
): void {
  const g = scene.add.graphics().setDepth(-10);
  const cx = roomW / 2;
  const cy = roomH / 2;
  const halfW = roomW / 2 + viewW;
  const halfH = roomH / 2 + viewH;

  g.fillStyle(C.backdrop, 1);
  g.fillRect(r(cx - halfW), r(cy - halfH), r(halfW * 2), r(halfH * 2));

  // Soft vignette: a touch darker beyond a margin around the room.
  const band = Math.max(40, Math.min(roomW, roomH) * 0.12);
  g.fillStyle(C.backdropEdge, 0.5);
  g.fillRect(r(cx - halfW), r(cy - halfH), r(halfW * 2), r(viewH - band));
  g.fillRect(r(cx - halfW), r(cy + roomH / 2 + band), r(halfW * 2), r(viewH - band));
  g.fillRect(r(cx - halfW), r(cy - halfH), r(viewW - band), r(halfH * 2));
  g.fillRect(r(cx + roomW / 2 + band), r(cy - halfH), r(viewW - band), r(halfH * 2));

  // Soft drop shadow hugging the room so it reads as a lifted, lit panel.
  const shadow = scene.add.graphics().setDepth(-9);
  shadow.fillStyle(C.roomShadow, 0.4);
  shadow.fillRoundedRect(r(-16), r(12), r(roomW + 32), r(roomH + 26), 20);
  shadow.fillStyle(C.roomShadow, 0.28);
  shadow.fillRoundedRect(r(-8), r(6), r(roomW + 16), r(roomH + 16), 14);
}

/** Thin warm frame around the room rect so its edges read crisply on backdrop. */
export function drawRoomFrame(
  scene: Phaser.Scene,
  roomW: number,
  roomH: number,
  depth = 3
): void {
  const g = scene.add.graphics().setDepth(depth);
  g.lineStyle(3, C.outline, 0.5);
  g.strokeRect(0, 0, r(roomW), r(roomH));
}

export function drawCreamWalls(
  scene: Phaser.Scene,
  w: number,
  wallH: number,
  depth = 0
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(C.wall, 1);
  g.fillRect(0, 0, r(w), r(wallH));

  const plankW = 28;
  for (let col = 0; col < Math.ceil(w / plankW) + 1; col++) {
    const px = col * plankW;
    const shade = col % 3;
    const color = shade === 0 ? C.wallWarm : shade === 1 ? C.wall : C.wallSpeck;
    g.fillStyle(color, 0.35);
    g.fillRect(r(px), 0, r(plankW - 2), r(wallH));
    g.lineStyle(1, C.outlineSoft, 0.15);
    g.lineBetween(r(px + plankW - 1), 0, r(px + plankW - 1), r(wallH));
  }

  drawOutlinedRect(g, 0, r(wallH) - 2, w, 4, C.woodMid, C.outline, 2, 3);
  return g;
}

export function drawWoodFloor(
  scene: Phaser.Scene,
  w: number,
  h: number,
  floorY: number,
  depth = 0
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(C.floorBase, 1);
  g.fillRect(0, r(floorY), r(w), r(h - floorY));

  const plankW = 18;
  const plankH = 8;
  const rows = Math.ceil((h - floorY) / plankH) + 2;
  const cols = Math.ceil(w / plankW) + 2;
  const colors = [C.plank1, C.plank2, C.plank3, C.plank4];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const offset = (row % 2) * (plankW / 2);
      const px = col * plankW + offset - plankW;
      const py = floorY + row * plankH;
      const color = colors[(row + col) % colors.length];
      g.fillStyle(color, 1);
      g.fillRect(r(px), r(py), r(plankW - 1), r(plankH - 1));
      g.lineStyle(1, C.plankLine, 0.35);
      g.strokeRect(r(px), r(py), r(plankW - 1), r(plankH - 1));
    }
  }

  g.lineStyle(3, C.outline, 0.4);
  g.lineBetween(0, r(floorY), r(w), r(floorY));
  return g;
}

export function drawCozyRug(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  rw: number,
  rh: number,
  fill: number,
  border: number,
  dots = false
): void {
  drawOutlinedRect(g, cx - rw / 2, cy - rh / 2, rw, rh, fill, border, 14, 3);
  g.lineStyle(2, C.cream, 0.7);
  g.strokeRoundedRect(
    r(cx - rw / 2 + 8),
    r(cy - rh / 2 + 6),
    r(rw - 16),
    r(rh - 12),
    10
  );
  if (dots) {
    g.fillStyle(C.rugDot, 0.9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        g.fillCircle(
          r(cx - rw * 0.3 + col * (rw * 0.15)),
          r(cy - rh * 0.15 + row * (rh * 0.15)),
          3
        );
      }
    }
  }
}

export function drawCozyWindow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  depth = 1,
  round = false
): void {
  const frame = scene.add.graphics().setDepth(depth);
  const pad = 6;
  const wh = size;
  const ww = round ? size : size * 1.2;

  drawOutlinedRect(frame, x - ww / 2 - pad, y - pad, ww + pad * 2, wh + pad * 2 + 4, C.wood, C.outline, round ? ww / 2 : 16, 3);

  if (round) {
    drawOutlinedCircle(frame, x, y + wh / 2 - 2, ww / 2, C.cream, C.outline, 3);
    drawOutlinedCircle(frame, x, y + wh / 2 - 2, ww / 2 - 10, C.sky, C.outlineSoft, 2);
    frame.lineStyle(2, C.woodMid, 1);
    frame.lineBetween(r(x), r(y + 4), r(x), r(y + wh - 8));
    frame.lineBetween(r(x - ww / 2 + 12), r(y + wh / 2 - 2), r(x + ww / 2 - 12), r(y + wh / 2 - 2));
  } else {
    drawOutlinedRect(frame, x - ww / 2, y, ww, wh, C.cream, C.outline, 14, 3);
    drawOutlinedRect(frame, x - ww / 2 + 8, y + 8, ww - 16, wh - 16, C.sky, C.outlineSoft, 10, 2);
    frame.lineStyle(2, C.woodMid, 1);
    frame.lineBetween(r(x), r(y + 8), r(x), r(y + wh - 8));
    frame.lineBetween(r(x - ww / 2 + 8), r(y + wh / 2), r(x + ww / 2 - 8), r(y + wh / 2));
  }

  frame.fillStyle(0xffffff, 0.2);
  frame.fillCircle(r(x - ww * 0.15), r(y + 14), 5);
  drawWarmGlow(scene, x, y + wh / 2 + 16, ww * 0.35, 0.05, depth);
}

export function drawCozyBookshelf(
  scene: Phaser.Scene,
  x: number,
  y: number,
  bw: number,
  bh: number,
  rows: number,
  depth = 2
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  drawOutlinedRect(g, x + 2, y + 2, bw, bh, C.shelfShadow, C.outlineSoft, 10, 2);
  drawOutlinedRect(g, x, y, bw, bh, C.woodLight, C.outline, 10, 3);

  const rowH = bh / rows;
  const seed = Math.floor(x * 7 + y * 3);

  for (let row = 0; row < rows; row++) {
    const ry = y + rowH * (row + 1) - 3;
    drawOutlinedRect(g, x + 4, ry, bw - 8, 4, C.woodMid, C.outlineSoft, 2, 1.5);

    let bx = x + 6;
    while (bx < x + bw - 8) {
      const bookW = 5 + ((seed + bx) % 7);
      const bookH = rowH - 12 + ((seed + row) % 5);
      const color = C.books[(seed + Math.floor(bx) + row) % C.books.length];
      drawOutlinedRect(g, bx, ry - bookH, bookW, bookH, color, C.outlineSoft, 2, 1);
      bx += bookW + 2;
    }
  }
  return g;
}

export function drawCozyPlant(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale = 1,
  variant: "round" | "monstera" | "yucca" = "round",
  depth = 2
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  const s = scale;
  const potColor = variant === "round" ? C.potBlue : C.pot;
  drawOutlinedRect(g, x - 10 * s, y, 20 * s, 14 * s, potColor, C.outline, 6, 2.5);

  if (variant === "yucca") {
    for (let i = -2; i <= 2; i++) {
      drawOutlinedEllipse(g, x + i * 5 * s, y - 22 * s, 6 * s, 18 * s, C.plantMint, C.plantDark, 1.5);
    }
  } else if (variant === "monstera") {
    drawOutlinedEllipse(g, x - 10 * s, y - 6 * s, 14 * s, 10 * s, C.plant, C.plantDark, 1.5);
    drawOutlinedEllipse(g, x + 8 * s, y - 10 * s, 12 * s, 14 * s, C.plantMint, C.plantDark, 1.5);
  } else {
    drawOutlinedCircle(g, x - 7 * s, y - 8 * s, 9 * s, C.plant, C.plantDark, 2);
    drawOutlinedCircle(g, x + 7 * s, y - 10 * s, 10 * s, C.plantMint, C.plantDark, 2);
    drawOutlinedCircle(g, x, y - 16 * s, 11 * s, C.plant, C.plantDark, 2);
  }
  return g;
}

export function drawCozyMug(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  color = C.cream
): void {
  drawOutlinedCircle(g, x, y, 6, color, C.outline, 2);
  g.lineStyle(2, C.outline, 1);
  g.strokeCircle(r(x + 7), r(y), 4);
}

export function drawCozyLamp(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale = 1,
  depth = 3
): void {
  const g = scene.add.graphics().setDepth(depth);
  const s = scale;
  drawOutlinedRect(g, x - 2 * s, y, 4 * s, 12 * s, C.woodDark, C.outline, 1, 2);
  g.fillStyle(C.pinkSoft, 1);
  g.fillTriangle(r(x - 9 * s), r(y), r(x + 9 * s), r(y), r(x), r(y - 14 * s));
  g.lineStyle(2.5, C.outline, 1);
  g.strokeTriangle(r(x - 9 * s), r(y), r(x + 9 * s), r(y), r(x), r(y - 14 * s));
  drawWarmGlow(scene, x, y + 4, 22 * s, 0.08, depth - 1);
}

export function drawCozyAtmosphere(
  scene: Phaser.Scene,
  w: number,
  h: number,
  floorTop: number,
  depth = 4
): void {
  const warm = scene.add.graphics().setDepth(depth).setAlpha(0.035);
  warm.fillStyle(C.warmTint, 1);
  warm.fillRect(0, 0, r(w), r(h));

  const ceiling = scene.add.graphics().setDepth(depth).setAlpha(0.025);
  ceiling.fillStyle(C.warmGlow, 1);
  ceiling.fillRect(r(w * 0.22), 0, r(w * 0.56), r(h * floorTop));

  const vignette = scene.add.graphics().setDepth(depth).setAlpha(0.04);
  vignette.fillStyle(C.outline, 1);
  vignette.fillRect(0, 0, r(w), r(h * 0.06));
  vignette.fillRect(0, r(h * 0.94), r(w), r(h * 0.06));

  drawGrainOverlay(scene, w, h, depth + 1, 0.02);
}
