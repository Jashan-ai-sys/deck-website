import * as THREE from 'three';
import { createFlaps, setTarget, tick, active } from './flaps.js';
import { canvasTexture } from './texture-utils.js';
import { reducedMotion } from './tween.js';
import { BOARD_WIDTH } from './cart.js';

const ROWS = 6;           // five items + total
const COLS = BOARD_WIDTH; // one cell per board character
const W = 1024, H = 600;
const CELL_W = 43, CELL_H = 72, STEP_X = 47, STEP_Y = 84;
const TICK_MS = 70;  // one character step
const FOLD_MS = 60;  // the flap falling over the middle hinge, inside one step

const cellY = (r) => 66 + r * STEP_Y + (r === ROWS - 1 ? 14 : 0);

// The split-flap cart board that stands on the counter.
export function createBoard(aniso) {
  const flaps = createFlaps(ROWS, COLS);
  const prev = Array(ROWS * COLS).fill(' ');
  const changedAt = Array(ROWS * COLS).fill(-Infinity);
  let ctx;
  const tex = canvasTexture(W, H, (c) => { ctx = c; }, aniso, 1); // always full resolution: it's text

  // One half (top or bottom) of a flap showing `ch`, squashed toward the hinge by `scaleY` (0–1).
  function half(ch, x, y, top, scaleY, shade) {
    const mid = y + CELL_H / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top ? y : mid, CELL_W, CELL_H / 2);
    ctx.clip();
    ctx.translate(0, mid);
    ctx.scale(1, scaleY);
    ctx.translate(0, -mid);
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.fillStyle = '#f2efe8';
    ctx.fillText(ch, x + CELL_W / 2, mid + 2);
    if (shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(x, y, CELL_W, CELL_H); }
    ctx.restore();
  }

  // Mid-fold: new top and old bottom are static; the old top falls, then the new bottom swings down.
  function cell(i, x, y, now) {
    const ch = flaps.shown[i];
    const p = (now - changedAt[i]) / FOLD_MS;
    if (p >= 1) {
      half(ch, x, y, true, 1, 0);
      half(ch, x, y, false, 1, 0);
    } else {
      half(ch, x, y, true, 1, 0);
      half(prev[i], x, y, false, 1, 0);
      if (p < 0.5) half(prev[i], x, y, true, Math.cos(p * Math.PI), p * 0.6);
      else half(ch, x, y, false, -Math.cos(p * Math.PI), (1 - p) * 0.6);
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y + CELL_H / 2 - 1, CELL_W, 2);
  }

  function draw(now) {
    ctx.fillStyle = '#0d0d0e';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c9a45c';
    ctx.font = '600 26px "Space Grotesk", sans-serif';
    ctx.letterSpacing = '6px';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('YOUR CART', 40, 46);
    ctx.fillRect(40, cellY(ROWS - 1) - 12, W - 80, 3);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 40px "Space Grotesk", sans-serif';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) cell(r * COLS + c, 40 + c * STEP_X, cellY(r), now);
    }
    tex.needsUpdate = true;
  }
  draw(0);

  const brass = new THREE.MeshStandardMaterial({ color: '#b8893a', metalness: 0.9, roughness: 0.35 });
  const object = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.47, 0.035), brass);
  frame.position.y = 0.27;
  frame.castShadow = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.433), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, 0.27, 0.0181);
  object.add(frame, face);
  for (const x of [-0.3, 0.3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.12), brass);
    leg.position.set(x, 0.02, 0);
    object.add(leg);
  }

  let nextTick = 0;
  let foldingUntil = 0;
  return {
    object,
    setLines(lines) {
      setTarget(flaps, lines, Math.random);
      if (!reducedMotion()) return;
      flaps.shown.splice(0, flaps.shown.length, ...flaps.target); // no flip flicker under reduced motion
      flaps.left.fill(0);
      draw(Infinity);
    },
    // Called every frame: steps the flaps on their own clock and redraws only while something moves.
    update(now) {
      if (active(flaps) && now >= nextTick) {
        nextTick = now + TICK_MS;
        const before = flaps.shown.slice();
        for (const i of tick(flaps, Math.random)) {
          prev[i] = before[i];
          changedAt[i] = now;
          foldingUntil = now + FOLD_MS;
        }
      }
      if (now <= foldingUntil + 16) draw(now);
    },
  };
}
