// Browse-grid and cart thumbnails, drawn on 2D canvases and cached. No three.js, so they also work
// in the 2D lite store. Each one is a little product photo: a light studio sweep, light from the top
// left, a soft floor shadow. Newer catalog fields (finish, shape, height...) are optional and every
// one falls back to a sensible default.
import { drawDeckArt } from './deck-art.js';
import { rng, hash } from './random.js';

const TAU = Math.PI * 2;

// ── Colour helpers ──
function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// amt > 0 mixes toward white, amt < 0 toward black.
function shade(hex, amt, alpha = 1) {
  const t = amt > 0 ? 255 : 0, k = Math.abs(amt);
  const [r, g, b] = rgbOf(hex).map((c) => Math.round(c + (t - c) * k));
  return `rgba(${r},${g},${b},${alpha})`;
}

const isDark = (hex) => {
  const [r, g, b] = rgbOf(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 < 120;
};

// ── Studio ──
// The sweep stays close to the cards' flat #ece7df at the sides, so letterboxed thumbs show no seam;
// the key light is a glow kept inside the frame.
function drawBackdrop(ctx, w, h) {
  const sweep = ctx.createLinearGradient(0, 0, 0, h);
  sweep.addColorStop(0, '#f0ece5');
  sweep.addColorStop(0.7, '#ece7df');
  sweep.addColorStop(1, '#e4ded4');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);
  const key = ctx.createRadialGradient(w * 0.4, h * 0.22, 0, w * 0.4, h * 0.22, w * 0.5);
  key.addColorStop(0, 'rgba(255,255,255,0.6)');
  key.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, w, h);
}

// A soft contact shadow: a radial gradient squashed into an ellipse (much cheaper than shadowBlur).
function floorShadow(ctx, x, y, rx, ry, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(48,38,28,${alpha})`);
  g.addColorStop(1, 'rgba(48,38,28,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
  ctx.restore();
}

// Polished steel for axles, washers, nuts and bearing races: a vertical band of highlights.
function steel(ctx, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#7d8288');
  g.addColorStop(0.3, '#eef0f2');
  g.addColorStop(0.55, '#a3a8ae');
  g.addColorStop(1, '#5d6268');
  return g;
}

// ── Decks ──
const CONCAVE = { Mellow: 0.6, Medium: 1, Steep: 1.4 };
const MAPLE = ['#ead8b0', '#d4b783'];

// Popsicle outline, nose up: the nose is a touch longer and rounder than the tail.
function deckPath(ctx, w, h, dx = 0) {
  const nose = w * 0.62, tail = w * 0.54;
  ctx.beginPath();
  ctx.moveTo(dx, nose);
  ctx.ellipse(dx + w / 2, nose, w / 2, nose, 0, Math.PI, TAU);
  ctx.lineTo(dx + w, h - tail);
  ctx.ellipse(dx + w / 2, h - tail, w / 2, tail, 0, 0, Math.PI);
  ctx.closePath();
}

// The board turned a few degrees so its right rail shows: grip at the back, then seven plies, each
// drawn as the whole outline shifted a little, so only a sliver of each shows past the one in front.
function deckEdge(ctx, w, h, p, edge) {
  const dipped = p.finish === 'dipped';
  deckPath(ctx, w, h, edge + 0.9);
  ctx.save();
  ctx.shadowColor = 'rgba(48,38,28,0.32)';
  ctx.shadowBlur = 9;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#17171a';
  ctx.fill();
  ctx.restore();
  for (let i = 6; i >= 0; i--) {
    ctx.fillStyle = dipped && (i === 1 || i === 5) ? p.colors.accent : MAPLE[i % 2];
    deckPath(ctx, w, h, (edge * (i + 1)) / 7);
    ctx.fill();
  }
}

// Eight truck-bolt holes: two 4-hole patterns, 1-5/8" across by 2-1/8" along, one wheelbase apart.
function boltHoles(ctx, w, h, p) {
  const ppi = h / (p.length || 32);
  const wb = (p.wheelbase || 14.25) * ppi;
  ctx.fillStyle = 'rgba(20,16,12,0.6)';
  for (const end of [-1, 1]) {
    for (const along of [-1, 1]) {
      for (const across of [-1, 1]) {
        const x = w / 2 + across * 0.8125 * ppi;
        const y = h / 2 + end * wb / 2 + along * 1.0625 * ppi;
        ctx.beginPath(); ctx.arc(x, y, 0.85, 0, TAU); ctx.fill();
      }
    }
  }
}

// Concave and kicks under the key light, then a clear-coat streak.
function deckLight(ctx, w, h, p) {
  const k = CONCAVE[p.concave] ?? 1;
  const across = ctx.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, `rgba(255,255,255,${0.22 * k})`);
  across.addColorStop(0.18, 'rgba(255,255,255,0)');
  across.addColorStop(0.7, 'rgba(0,0,0,0)');
  across.addColorStop(1, `rgba(0,0,0,${0.24 * k})`);
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, w, h);
  const kicks = ctx.createLinearGradient(0, 0, 0, h);
  kicks.addColorStop(0, 'rgba(255,255,255,0.16)');
  kicks.addColorStop(0.13, 'rgba(255,255,255,0)');
  kicks.addColorStop(0.89, 'rgba(0,0,0,0)');
  kicks.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = kicks;
  ctx.fillRect(0, 0, w, h);
  const coat = ctx.createLinearGradient(0, h * 0.2, w, h * 0.3);
  coat.addColorStop(0.3, 'rgba(255,255,255,0)');
  coat.addColorStop(0.48, 'rgba(255,255,255,0.3)');
  coat.addColorStop(0.62, 'rgba(255,255,255,0)');
  ctx.fillStyle = coat;
  ctx.fillRect(0, 0, w, h);
}

function drawDeckThumb(ctx, W, H, p) {
  const h = 172, w = h * ((p.size || 8.25) / (p.length || 32)), edge = 3.6;
  const floor = H - 12;
  floorShadow(ctx, W / 2 + 4, floor, w * 0.85, 5, 0.4);
  ctx.save();
  ctx.translate(W / 2 - 2, floor);
  ctx.rotate(-0.05);
  ctx.translate(-w / 2, -h);
  deckEdge(ctx, w, h, p, edge);
  deckPath(ctx, w, h);
  ctx.clip();
  ctx.save();
  ctx.scale(w / 512, h / 2048);
  drawDeckArt(ctx, p);
  ctx.restore();
  boltHoles(ctx, w, h, p);
  deckLight(ctx, w, h, p);
  ctx.restore();
}

// ── Wheels ──
// How each profile reads: where the rounded lip starts on the face, and how hard the tread edges fall off.
const WHEEL_SHAPES = {
  Classic: { lip: 0.8, edge: 0.3 },
  Conical: { lip: 0.88, edge: 0.15 },
  Radial: { lip: 0.72, edge: 0.4 },
  Cruiser: { lip: 0.7, edge: 0.45 },
};
const YAW = 0.36; // radians the set is turned, so the riding surface shows on the right

// Letters spaced around an arc: across the top they read clockwise, across the bottom anticlockwise,
// so both rows stay upright.
function arcText(ctx, text, r, px, bottom) {
  ctx.font = `700 ${px.toFixed(1)}px "Space Grotesk", sans-serif`;
  const step = (px * 0.8) / r;
  for (let i = 0; i < text.length; i++) {
    ctx.save();
    ctx.rotate((bottom ? -1 : 1) * (i - (text.length - 1) / 2) * step);
    ctx.fillText(text[i], 0, bottom ? r : -r);
    ctx.restore();
  }
}

// The riding surface: the face ellipse swept sideways, shaded like a cylinder.
function wheelTread(ctx, R, p, shape, t) {
  const rx = R * Math.cos(YAW);
  ctx.beginPath();
  ctx.moveTo(0, -R);
  ctx.lineTo(t, -R);
  ctx.ellipse(t, 0, rx, R, 0, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(0, R);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -R, 0, R);
  g.addColorStop(0, shade(p.color, 0.25));
  g.addColorStop(0.45, shade(p.color, 0));
  g.addColorStop(1, shade(p.color, -0.45));
  ctx.fillStyle = g;
  ctx.fill();
  // Rounded lips darken both edges of the tread; a conical wheel only falls off on its inner side.
  const lip = ctx.createLinearGradient(rx * 0.6, 0, t + rx, 0);
  lip.addColorStop(0, 'rgba(0,0,0,0)');
  lip.addColorStop(0.75 - shape.edge * 0.6, 'rgba(0,0,0,0)');
  lip.addColorStop(1, `rgba(0,0,0,${0.15 + shape.edge * 0.5})`);
  ctx.fillStyle = lip;
  ctx.fill();
}

function wheelFace(ctx, R, p, shape, mm) {
  const g = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.1, 0, 0, R);
  g.addColorStop(0, shade(p.color, 0.18));
  g.addColorStop(shape.lip, shade(p.color, 0));
  g.addColorStop(1, shade(p.color, -0.32));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  if (p.shape === 'Conical') {
    ctx.strokeStyle = shade(p.color, 0.3, 0.6);
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(0, 0, R * shape.lip, Math.PI, TAU * 0.9); ctx.stroke();
  }
  // Sidewall print.
  const print = p.print || (isDark(p.color) ? '#f1ece2' : '#1c1c1e');
  ctx.fillStyle = print;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rText = (R + 17 * mm) / 2;
  arcText(ctx, 'SLAB', rText, Math.max(5, R * 0.2), false);
  arcText(ctx, `${p.durometer || 99}A ${p.size || 54}MM`, rText, Math.max(4, R * 0.13), true);
}

// Core and bearing at true scale: 22 mm bearing, 8 mm bore, inside a slightly recessed core.
function wheelHub(ctx, p, mm) {
  const coreR = (p.shape === 'Cruiser' ? 17 : 14.5) * mm;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.arc(0.6, 0.8, coreR + 1, 0, TAU); ctx.fill();
  const core = ctx.createRadialGradient(-coreR * 0.4, -coreR * 0.4, 0, 0, 0, coreR);
  core.addColorStop(0, shade(p.core || '#f4f1ea', 0.2));
  core.addColorStop(1, shade(p.core || '#f4f1ea', -0.2));
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, coreR, 0, TAU); ctx.fill();
  const rings = [[11, steel(ctx, -11 * mm, 11 * mm)], [9.6, '#26282c'], [5.4, steel(ctx, -5.4 * mm, 5.4 * mm)], [4, '#0f1012']];
  for (const [r, fill] of rings) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(0, 0, r * mm, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; // the shield's pressed ring
  ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.arc(0, 0, 7.6 * mm, 0, TAU); ctx.stroke();
}

function drawWheel(ctx, x, y, R, p) {
  const shape = WHEEL_SHAPES[p.shape] ?? WHEEL_SHAPES.Classic;
  const mm = R / ((p.size || 54) / 2);
  const t = ((p.contact || 30) + 6) * mm * Math.sin(YAW);
  ctx.save();
  ctx.translate(x, y);
  wheelTread(ctx, R, p, shape, t);
  ctx.scale(Math.cos(YAW), 1);
  wheelFace(ctx, R, p, shape, mm);
  wheelHub(ctx, p, mm);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; // gloss off the urethane
  ctx.beginPath(); ctx.ellipse(-R * 0.45, -R * 0.55, R * 0.28, R * 0.12, -0.7, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawWheelsThumb(ctx, W, H, p) {
  const R = 30 * ((p.size || 54) / 56);
  // Two at the back (smaller, higher: further away under a high camera), two in front.
  const set = [[54, 78, 0.86], [102, 72, 0.86], [48, 128, 1], [98, 122, 1]];
  floorShadow(ctx, 80, 126 + R, 74, 9, 0.42);
  for (const [x, y, k] of set) drawWheel(ctx, x, y, R * k, p);
}

// ── Trucks ──
const MM = 0.78; // px per mm in the front view
const TRUCK_HEIGHTS = { Low: 49, Mid: 52, High: 55 };

const isRaw = (p) => /raw|polish|silver|chrome/i.test(p.finishName || p.name || '');

// Hex nut seen side-on: a block with its facets picked out.
function nut(ctx, x, y, w, h) {
  ctx.fillStyle = steel(ctx, y, y + h);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + w * 0.3, y, 0.7, h);
  ctx.fillRect(x + w * 0.7, y, 0.7, h);
}

function bushing(ctx, cx, y0, y1, r0, r1, color) {
  const g = ctx.createLinearGradient(cx - r0, 0, cx + r0, 0);
  g.addColorStop(0, shade(color, -0.1));
  g.addColorStop(0.3, shade(color, 0.3));
  g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - r0, y0);
  ctx.lineTo(cx - r1, y1 + 1.5);
  ctx.quadraticCurveTo(cx, y1 - 1, cx + r1, y1 + 1.5);
  ctx.lineTo(cx + r0, y0);
  ctx.closePath();
  ctx.fill();
}

// Baseplate seen a little from above: four mounting holes on its flange.
function baseplate(ctx, p, raw) {
  const fin = p.finish || '#b9bcc0';
  ctx.fillStyle = shade(fin, raw ? -0.25 : -0.3);
  ctx.beginPath(); ctx.roundRect(-27, -5, 54, 5, 1.5); ctx.fill();
  ctx.fillStyle = shade(fin, raw ? 0.15 : 0.08);
  ctx.beginPath();
  ctx.moveTo(-27, -5); ctx.lineTo(-23, -14); ctx.lineTo(23, -14); ctx.lineTo(27, -5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a2724';
  for (const [x, y] of [[-17, -7.5], [17, -7.5], [-14.5, -11.5], [14.5, -11.5]]) {
    ctx.beginPath(); ctx.ellipse(x, y, 1.9, 1.1, 0, 0, TAU); ctx.fill();
  }
  // Cast housing round the kingpin and pivot, peeking out either side of the bushing.
  const boss = ctx.createLinearGradient(-12, 0, 12, 0);
  boss.addColorStop(0, shade(fin, raw ? 0.2 : 0.05));
  boss.addColorStop(1, shade(fin, -0.3));
  ctx.fillStyle = boss;
  ctx.beginPath(); ctx.roundRect(-12, -21, 24, 10, 4); ctx.fill();
}

// Cast hanger: thin at the axle ends, deepening to the bushing seat in the middle.
function hanger(ctx, p, raw, half, axleY, rand) {
  const fin = p.finish || '#b9bcc0';
  ctx.beginPath();
  ctx.moveTo(-half, axleY - 4.5);
  ctx.quadraticCurveTo(0, axleY - 7.5, half, axleY - 4.5);
  ctx.lineTo(half, axleY + 4.5);
  ctx.bezierCurveTo(half * 0.45, axleY + 5.5, 16, -30, 11, -27);
  ctx.lineTo(-11, -27);
  ctx.bezierCurveTo(-16, -30, -half * 0.45, axleY + 5.5, -half, axleY + 4.5);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, axleY - 7, 0, -27);
  if (raw) {
    g.addColorStop(0, '#f4f5f6');
    g.addColorStop(0.18, shade(fin, 0.1));
    g.addColorStop(0.55, shade(fin, -0.35));
    g.addColorStop(0.85, shade(fin, -0.1));
    g.addColorStop(1, shade(fin, -0.4));
  } else {
    g.addColorStop(0, shade(fin, 0.22));
    g.addColorStop(0.25, shade(fin, 0.04));
    g.addColorStop(1, shade(fin, -0.3));
  }
  ctx.fillStyle = g;
  ctx.fill();
  if (raw) {
    // Cast-aluminium pitting: a sprinkle of tiny light and dark specks inside the hanger.
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.35)';
      ctx.fillRect(-half + rand() * half * 2, axleY - 8 + rand() * (axleY * -1 - 18), 0.8, 0.8);
    }
    ctx.restore();
  }
}

function drawTruck(ctx, x, floor, k, p, rand) {
  const raw = isRaw(p);
  const axleHalf = ((p.size || 149) / 2) * MM;
  const half = axleHalf - 15 * MM;
  const axleY = -(p.heightMm || TRUCK_HEIGHTS[p.height] || 52) * MM;
  const bush = p.bushing || '#c4361b';
  ctx.save();
  ctx.translate(x, floor);
  ctx.scale(k, k);
  baseplate(ctx, p, raw);
  ctx.fillStyle = steel(ctx, -18, -8);
  ctx.fillRect(-1.8, -18, 3.6, 10); // kingpin
  ctx.fillStyle = steel(ctx, -18, -16);
  ctx.fillRect(-9.5, -18, 19, 2); // cup washer
  bushing(ctx, 0, -18, -29, 9, 8.5, bush); // boardside barrel
  ctx.fillStyle = steel(ctx, axleY - 2, axleY + 2);
  ctx.fillRect(-axleHalf, axleY - 2, axleHalf * 2, 4);
  hanger(ctx, p, raw, half, axleY, rand);
  for (const s of [-1, 1]) {
    ctx.fillStyle = steel(ctx, axleY - 4, axleY + 4);
    ctx.beginPath(); ctx.ellipse(s * (half + 1.2), axleY, 1, 4, 0, 0, TAU); ctx.fill(); // speed washers
    ctx.beginPath(); ctx.ellipse(s * (axleHalf - 6.5), axleY, 1, 4, 0, 0, TAU); ctx.fill();
    nut(ctx, s > 0 ? axleHalf - 5.5 : -axleHalf, axleY - 3.5, 5.5, 7);
  }
  const seat = axleY - 6;
  bushing(ctx, 0, seat, seat - 9, 8, 5.5, bush); // roadside cone
  ctx.fillStyle = steel(ctx, seat - 11, seat - 9);
  ctx.fillRect(-7, seat - 11, 14, 2);
  nut(ctx, -4.5, seat - 16, 9, 5);
  ctx.fillStyle = steel(ctx, seat - 18, seat - 16);
  ctx.fillRect(-1.8, seat - 18, 3.6, 2); // kingpin thread past the nut
  ctx.restore();
}

function drawTruckThumb(ctx, W, H, p) {
  const rand = rng(hash(p.id || 'truck'));
  // Sold as a pair: the second one further back, so it sits higher and smaller.
  floorShadow(ctx, 84, 104, 40, 5, 0.3);
  drawTruck(ctx, 86, 102, 0.8, p, rand);
  floorShadow(ctx, 78, 168, 52, 7, 0.45);
  drawTruck(ctx, 76, 166, 1, p, rand);
}

// ── Thumbnails ──
const THUMB_W = 160, THUMB_H = 200, THUMB_LIMIT = 220;
const thumbs = new Map();

function renderThumb(p) {
  const c = document.createElement('canvas');
  c.width = THUMB_W;
  c.height = THUMB_H;
  const ctx = c.getContext('2d');
  drawBackdrop(ctx, THUMB_W, THUMB_H);
  if (p.category === 'decks') drawDeckThumb(ctx, THUMB_W, THUMB_H, p);
  else if (p.category === 'wheels') drawWheelsThumb(ctx, THUMB_W, THUMB_H, p);
  else drawTruckThumb(ctx, THUMB_W, THUMB_H, p);
  return c;
}

// Paints a product's thumbnail into a card's canvas, rendering it once and caching the result.
export function paintThumb(canvas, p) {
  let src = thumbs.get(p.id);
  if (!src) {
    src = renderThumb(p);
    thumbs.set(p.id, src);
    if (thumbs.size > THUMB_LIMIT) thumbs.delete(thumbs.keys().next().value);
  }
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
}
