import * as THREE from 'three';

// Seeded randomness lives in random.js (no three.js, so tests and the server can use it too).
export { rng, hash } from './random.js';

// Phones and small screens get half-resolution generated textures: a quarter of the memory and of the
// time spent painting them on load, with no visible loss at phone sizes.
export const LOW_POWER = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
const TEX_SCALE = LOW_POWER ? 0.5 : 1;

// `draw` always works in the logical w × h space; the canvas itself may be smaller (`scale`).
export function canvasTexture(w, h, draw, anisotropy = 1, scale = TEX_SCALE) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.scale(scale, scale);
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

// Pixel noise over the whole canvas (in real pixels, so it is the same at any texture scale).
export function addNoise(ctx, w, h, amount, rand) {
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
