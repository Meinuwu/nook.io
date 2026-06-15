import Phaser from "phaser";
import { getDisplayDpi } from "./displayDpi";
import { C, r } from "./drawCozyRoom";

export const FROG_TEXTURE_KEY = "frog-avatar";
export const FROG_TEXTURE_PATH = "/assets/avatar/frog.png";

/** Display the frog PNG sprite at room seat positions. */
export function createFrogAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  displayScale = 0.9
): Phaser.GameObjects.Image {
  const img = scene.add.image(r(x), r(y), FROG_TEXTURE_KEY);
  const targetHeight = r(80 * displayScale);
  img.setScale(targetHeight / img.height);
  img.setOrigin(0.5, 0.72);
  return img;
}

/**
 * Fraction of the frog texture (from the top) that counts as the "head" — the
 * big domed face. The seam sits in plain body-green below the cheeks/mouth so a
 * head-only reading bob shows no edge: anything below stays put on the body.
 */
export const FROG_HEAD_CROP_FRACTION = 0.6;

/**
 * A head-only overlay built from the same frog texture, cropped to the upper
 * dome and placed exactly over `createFrogAvatar`'s body image. Because it
 * shares the body's transform (position, scale, origin) and the full body image
 * sits behind it, gently tweening just this overlay's Y makes only the head bob
 * while reading — the lifted gap is backfilled by the identical body pixels, so
 * there is no seam and the torso/paws/book stay perfectly still.
 */
export function createFrogHead(
  scene: Phaser.Scene,
  x: number,
  y: number,
  displayScale = 0.9
): Phaser.GameObjects.Image {
  const head = createFrogAvatar(scene, x, y, displayScale);
  const cropH = Math.round(head.height * FROG_HEAD_CROP_FRACTION);
  head.setCrop(0, 0, head.width, cropH);
  return head;
}

/** Vertical offset of the reading book within the avatar container (held at the frog's lower-front). */
export const READING_BOOK_Y = -2;

/**
 * Open book held in the frog's paws — the "studying" pose. Cozy kawaii style:
 * cream pages fanning up from a warm-brown bound cover, thick #4A3728 outline,
 * with little green paws brought forward to grip the lower corners as if reading.
 * Local coords are centered on the book; the caller adds it as a child of the
 * avatar container and toggles visibility with the studying state.
 */
export function drawReadingBook(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();

  const outline = C.outline; // 0x4a3728 warm brown outline
  const cover = 0x8b6342; // warm-brown book cover / spine
  const page = C.cream; // 0xfaf5ec page cream
  const textLine = 0x9a7048; // faint "words" on the pages
  const pawFill = 0xbfdfb0; // frog body green
  const pawOutline = 0x98d0a2; // frog edge green

  // Bound cover / spine base — the part the paws hold.
  g.fillStyle(cover, 1);
  g.fillRoundedRect(r(-18), r(2), r(36), r(9), 3);
  g.lineStyle(2.5, outline, 1);
  g.strokeRoundedRect(r(-18), r(2), r(36), r(9), 3);

  // Two cream pages fanning up and out from the central spine.
  const leftPage = [
    { x: r(-16), y: r(-6) },
    { x: r(-1), y: r(-2) },
    { x: r(-1), y: r(5) },
    { x: r(-16), y: r(2) },
  ];
  const rightPage = [
    { x: r(16), y: r(-6) },
    { x: r(1), y: r(-2) },
    { x: r(1), y: r(5) },
    { x: r(16), y: r(2) },
  ];
  g.fillStyle(page, 1);
  g.fillPoints(leftPage, true);
  g.fillPoints(rightPage, true);
  g.lineStyle(2.5, outline, 1);
  g.strokePoints(leftPage, true);
  g.strokePoints(rightPage, true);

  // Central fold.
  g.lineBetween(r(0), r(-2), r(0), r(5));

  // Faint lines of text on each page.
  g.lineStyle(1.2, textLine, 0.85);
  g.lineBetween(r(-13), r(-1), r(-4), r(0));
  g.lineBetween(r(-13), r(2), r(-4), r(3));
  g.lineBetween(r(13), r(-1), r(4), r(0));
  g.lineBetween(r(13), r(2), r(4), r(3));

  // Little paws brought forward to grip the book's lower corners.
  g.fillStyle(pawFill, 1);
  g.lineStyle(2, pawOutline, 1);
  g.fillEllipse(r(-15), r(8), r(11), r(9));
  g.strokeEllipse(r(-15), r(8), r(11), r(9));
  g.fillEllipse(r(15), r(8), r(11), r(9));
  g.strokeEllipse(r(15), r(8), r(11), r(9));

  g.setPosition(0, READING_BOOK_Y);
  return g;
}

const BUBBLE_Y = -75;

/** Speech bubble above frog (local coords — parent to avatar container). */
export function drawSpeechBubble(
  scene: Phaser.Scene,
  text: string
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, BUBBLE_Y);
  const maxW = 130;
  const display = text.length > 60 ? text.slice(0, 57) + "…" : text;
  const textDpi = getDisplayDpi();

  const label = scene.add
    .text(0, 0, display, {
      fontFamily: "Nunito, sans-serif",
      fontSize: "12px",
      color: "#5c4033",
      fontStyle: "bold",
      wordWrap: { width: maxW },
      align: "center",
      resolution: textDpi,
    })
    .setOrigin(0.5);

  const padX = 12;
  const padY = 8;
  const bw = Math.min(maxW + padX * 2, label.width + padX * 2);
  const bh = label.height + padY * 2;

  const bg = scene.add.graphics();
  bg.fillStyle(0xffffff, 0.95);
  bg.fillRoundedRect(r(-bw / 2), r(-bh / 2), r(bw), r(bh), 14);
  bg.lineStyle(2.5, 0x7bc74d, 0.8);
  bg.strokeRoundedRect(r(-bw / 2), r(-bh / 2), r(bw), r(bh), 14);
  bg.fillTriangle(r(-5), r(bh / 2), r(5), r(bh / 2), 0, r(bh / 2 + 8));

  c.add([bg, label]);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 250, ease: "Back.easeOut" });
  return c;
}

/** Animated typing indicator bubble (local coords — parent to avatar container). */
export function drawTypingBubble(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, BUBBLE_Y);
  const bw = 52;
  const bh = 28;

  const bg = scene.add.graphics();
  bg.fillStyle(0xffffff, 0.95);
  bg.fillRoundedRect(r(-bw / 2), r(-bh / 2), bw, bh, 14);
  bg.lineStyle(2.5, 0x7bc74d, 0.8);
  bg.strokeRoundedRect(r(-bw / 2), r(-bh / 2), bw, bh, 14);
  bg.fillTriangle(r(-5), r(bh / 2), r(5), r(bh / 2), 0, r(bh / 2 + 8));

  const dots: Phaser.GameObjects.Arc[] = [];
  for (let i = 0; i < 3; i++) {
    const dot = scene.add.circle(r(-10 + i * 10), 0, 3, 0x7bc74d, 1);
    dots.push(dot);
    scene.tweens.add({
      targets: dot,
      alpha: { from: 0.35, to: 1 },
      scale: { from: 0.85, to: 1.15 },
      duration: 420,
      delay: i * 140,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  c.add([bg, ...dots]);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 200, ease: "Back.easeOut" });
  return c;
}
