import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, rng, hash, addNoise } from './texture-utils.js';
import { drawDeckArt } from './deck-art.js';

// Deck dimensions in metres: length along local Y (nose at +Y), width along X, graphic facing +Z,
// grip facing -Z. Real decks are built from the catalogue's inches; DECK_L / DECK_W are the
// reference 31.5" × 8.07" shape, and every deck's tail tip sits at -DECK_L / 2 so the wall pegs
// (placed from DECK_L) hold any length.
export const DECK_L = 0.8;
export const DECK_W = 0.205;
const IN = 0.0254;
const DECK_T = 0.012;   // seven 1/16" veneers, pressed
const RAIL_R = 0.0045;  // how far the rounded rail reaches out past the flat faces
// Nose a little longer and steeper than the tail, as on a real popsicle shape. Lengths scale with the deck.
const NOSE = { len: 0.15, rise: 0.042 };
const TAIL = { len: 0.135, rise: 0.035 };
// Dish depth at the rails. All of it lifts toward the grip side.
const CONCAVE = { Mellow: 0.0035, Medium: 0.0055, Steep: 0.0075 };
// Truck bolt pattern: holes 1-5/8" apart across the width, 2-1/8" apart along it; the wheelbase is the
// distance between the inner holes. The pattern sits slightly toward the tail, which is shorter.
const HOLE_X = (1.625 * IN) / 2, HOLE_Y = 2.125 * IN, PATTERN_SHIFT = -0.005;

// A kick that curves up out of the flat, then runs straight, like a pressed tail (not a parabola).
function kick(a, { len, rise }) {
  if (a <= 0) return [0, 0];
  const t = a / len, t0 = 0.45, k = rise / (1 - t0 / 2);
  return t < t0 ? [k * (t * t) / (2 * t0), (k * t) / (t0 * len)] : [k * (t - t0 / 2), k / len];
}

// The deck's mid-surface z(x, y) and its slope; z goes negative toward the grip side.
function surfaceFn(W, L, concave) {
  const s = L / DECK_L, nose = { len: NOSE.len * s, rise: NOSE.rise }, tail = { len: TAIL.len * s, rise: TAIL.rise };
  const dish = CONCAVE[concave] ?? CONCAVE.Medium, half = W / 2;
  return (x, y) => {
    const [zn, dn] = kick(y - (L / 2 - nose.len), nose);
    const [zt, dt] = kick(-y - (L / 2 - tail.len), tail);
    const u = x / half;
    const z = -(zn + zt + dish * u * u);
    const zx = (-2 * dish * u) / half, zy = -(dn - dt);
    return { z, n: new THREE.Vector3(-zx, -zy, 1).normalize(), zx, zy };
  };
}

// Outline of the flat faces as rows of [y, halfWidth]: a straight middle and superellipse nose/tail
// caps, inset by the rail so the rounded rail brings it back to the full width and length.
function outline(W, L) {
  const hw = W / 2 - RAIL_R, flat = L / 2 - RAIL_R, cap = W * 0.62, p = 2.4, capSteps = 18;
  const capRow = (i, sign) => {
    const th = (i / capSteps) * (Math.PI / 2);
    return [sign * (flat - cap + cap * Math.sin(th) ** (2 / p)), hw * Math.cos(th) ** (2 / p)];
  };
  const rows = [];
  for (let i = capSteps; i > 0; i--) rows.push(capRow(i, -1));
  const midSteps = Math.round((2 * (flat - cap)) / 0.012);
  for (let i = 0; i <= midSteps; i++) rows.push([-(flat - cap) + (2 * (flat - cap) * i) / midSteps, hw]);
  for (let i = 1; i <= capSteps; i++) rows.push(capRow(i, 1));
  return rows.map(([y, w]) => [y, Math.max(w, 0.0015)]);
}

function geometry(pos, nrm, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Graphic (+1) or grip (-1) face: a grid over the outline, offset half the thickness along the normal.
function face(rows, cols, surf, W, L, side) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const [y, hw] of rows) {
    for (let j = 0; j <= cols; j++) {
      const x = -hw + (2 * hw * j) / cols, { z, n } = surf(x, y);
      pos.push(x + side * n.x * DECK_T / 2, y + side * n.y * DECK_T / 2, z + side * n.z * DECK_T / 2);
      nrm.push(side * n.x, side * n.y, side * n.z);
      uv.push(x / W + 0.5, y / L + 0.5);
    }
  }
  const s = cols + 1;
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * s + j, b = a + 1, c = a + s, d = c + 1;
      if (side > 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
  }
  return geometry(pos, nrm, uv, idx);
}

// The rail: a half-round swept around the outline joining the two faces. u runs along the edge
// (the ply texture repeats every 6 cm), v across the thickness from graphic to grip.
function rail(rows, surf, segs = 8) {
  const loop = [...rows.map(([y, hw]) => [-hw, y]), ...rows.slice().reverse().map(([y, hw]) => [hw, y])];
  const n = loop.length, pos = [], nrm = [], uv = [], idx = [];
  let run = 0;
  // One ring per outline point, plus the first again at the end so u keeps counting across the seam.
  for (let k = 0; k <= n; k++) {
    const [x, y] = loop[k % n], [px, py] = loop[(k - 1 + n) % n], [qx, qy] = loop[(k + 1) % n];
    if (k) run += Math.hypot(x - px, y - py);
    const ox = -(qy - py), oy = qx - px; // outward in plan (the loop runs clockwise seen from +Z)
    const { z, n, zx, zy } = surf(x, y);
    const d = new THREE.Vector3(ox, oy, zx * ox + zy * oy).normalize(); // outward, in the tangent plane
    for (let s = 0; s <= segs; s++) {
      const phi = (s / segs) * Math.PI, c = Math.cos(phi), si = Math.sin(phi);
      pos.push(x + n.x * c * DECK_T / 2 + d.x * si * RAIL_R, y + n.y * c * DECK_T / 2 + d.y * si * RAIL_R, z + n.z * c * DECK_T / 2 + d.z * si * RAIL_R);
      const m = n.clone().multiplyScalar(c / (DECK_T / 2)).addScaledVector(d, si / RAIL_R).normalize();
      nrm.push(m.x, m.y, m.z);
      uv.push(run / 0.06, s / segs);
    }
  }
  const s = segs + 1;
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < segs; j++) {
      const a = k * s + j, b = a + 1, c = a + s, d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
  }
  return geometry(pos, nrm, uv, idx);
}

// Shared geometry per deck shape. The catalogue only has a few dozen (width, length, concave)
// combinations, so these are built once and never disposed.
const shapes = new Map();
function shapeFor(W, L, concave) {
  const key = `${W}|${L}|${concave}`;
  if (!shapes.has(key)) {
    const rows = outline(W, L), surf = surfaceFn(W, L, concave);
    const g = { graphic: face(rows, 14, surf, W, L, 1), grip: face(rows, 14, surf, W, L, -1), rail: rail(rows, surf) };
    for (const geo of Object.values(g)) geo.userData.shared = true;
    shapes.set(key, g);
  }
  return shapes.get(key);
}

// The eight truck-bolt positions [x, y]; index 0 is the front-left nose bolt.
function boltHoles(wheelbase) {
  const holes = [];
  for (const end of [1, -1]) {
    for (const dy of [HOLE_Y, 0]) for (const x of [-HOLE_X, HOLE_X]) holes.push([x, PATTERN_SHIFT + end * (wheelbase / 2 + dy)]);
  }
  return holes;
}

// Countersunk bolt heads sitting flush in the grip: a shallow dome with a hex socket. Seven black
// bolts and one silver on the nose, the way skaters mark which end is which.
const BOLT_MATS = [
  new THREE.MeshStandardMaterial({ color: '#2b2c30', metalness: 0.7, roughness: 0.42 }),
  new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: 0.9, roughness: 0.3 }),
  new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.8 }),
];
for (const m of BOLT_MATS) m.userData.shared = true;
const HEAD = new THREE.LatheGeometry(
  [[0.0049, 0], [0.0046, 0.00035], [0.0036, 0.0006], [0.002, 0.0007], [0, 0.00072]].map(([r, h]) => new THREE.Vector2(r, h)), 16);
const SOCKET = new THREE.CircleGeometry(0.0016, 6).rotateX(-Math.PI / 2).translate(0, 0.00075, 0);
const bolts = new Map();
function boltsFor(W, L, concave, wheelbase) {
  const key = `${W}|${L}|${concave}|${wheelbase}`;
  if (!bolts.has(key)) {
    const surf = surfaceFn(W, L, concave), up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4();
    const placed = boltHoles(wheelbase).map(([x, y], k) => {
      const { z, n } = surf(x, y), out = n.clone().negate();
      const q = new THREE.Quaternion().setFromUnitVectors(up, out).multiply(new THREE.Quaternion().setFromAxisAngle(up, k * 0.9));
      return m.clone().compose(new THREE.Vector3(x, y, z).addScaledVector(out, DECK_T / 2), q, new THREE.Vector3(1, 1, 1));
    });
    const geo = mergeGeometries([
      mergeGeometries(placed.slice(1).map((pm) => HEAD.clone().applyMatrix4(pm))),
      HEAD.clone().applyMatrix4(placed[0]),
      mergeGeometries(placed.map((pm) => SOCKET.clone().applyMatrix4(pm))),
    ], true);
    geo.userData.shared = true;
    bolts.set(key, geo);
  }
  return bolts.get(key);
}

function graphicTexture(deck, W, L, wheelbase, aniso) {
  return canvasTexture(512, 2048, (ctx, w, h) => {
    const rand = rng(hash(deck.id));
    drawDeckArt(ctx, deck, rand);
    // Bolt holes show on the graphic: a dark drilled ring around the bolt's threaded end.
    for (const [x, y] of boltHoles(wheelbase)) {
      const cx = (x / W + 0.5) * w, cy = (0.5 - y / L) * h;
      ctx.fillStyle = 'rgba(20,16,12,0.8)';
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6f7378';
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    }
    addNoise(ctx, w, h, 10, rand);
  }, aniso);
}

// Black grip tape: fine silicon-carbide grit with a few brighter grains and a faint blotchy sheen.
// One 10 cm tile repeated over every deck, also used as a bump map so the grit catches the light.
export function makeGripTexture(aniso) {
  const tex = canvasTexture(512, 512, (ctx, w, h) => {
    const rand = rng(3);
    ctx.fillStyle = '#19191b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      const x = rand() * w, y = rand() * h, r = 60 + rand() * 120;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.015 + rand() * 0.025})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.14})`;
      ctx.fillRect(rand() * w, rand() * h, 0.8 + rand(), 0.8 + rand());
    }
    addNoise(ctx, w, h, 46, rand);
  }, aniso);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 8);
  tex.userData.shared = true;
  return tex;
}

// Seven pressed veneers seen on the rail: long-grain plies with streaks, two cross-grain plies with
// end-grain flecks, thin glue lines. Dipped decks take the stain on the outer plies and a coloured core.
function plyTexture(dye, aniso) {
  const tex = canvasTexture(256, 64, (ctx, w, h) => {
    const rand = rng(7), ply = h / 7;
    for (let i = 0; i < 7; i++) {
      const y = i * ply, cross = i === 2 || i === 4;
      ctx.fillStyle = cross ? '#c9a676' : i % 2 ? '#dcc092' : '#e2c89c';
      ctx.fillRect(0, y, w, ply);
      ctx.fillStyle = 'rgba(110,70,35,0.22)';
      for (let k = 0; k < (cross ? 160 : 30); k++) {
        if (cross) ctx.fillRect(rand() * w, y + rand() * ply, 1, 1 + rand() * 2);
        else ctx.fillRect(0, y + rand() * ply, w, 0.6);
      }
      const color = dye && (i === 0 || i === 6 ? dye.base : i === 3 ? dye.accent : null);
      if (color) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = color;
        ctx.fillRect(0, y, w, ply);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = 'rgba(70,45,20,0.45)';
      ctx.fillRect(0, y, w, 0.8);
    }
  }, aniso);
  tex.wrapS = THREE.RepeatWrapping;
  tex.userData.shared = true;
  return tex;
}

// Rail materials are shared per dye colour (a dozen at most), so the ply texture is never per deck.
const railMats = new Map();
function railMaterial(deck, aniso) {
  const dye = deck.finish === 'dipped' ? deck.colors : null;
  const key = dye ? `${dye.base}|${dye.accent}` : 'maple';
  if (!railMats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ map: plyTexture(dye, aniso), roughness: 0.45 });
    m.userData.shared = true;
    railMats.set(key, m);
  }
  return railMats.get(key);
}

let gripMat; // one grip material for every deck
function gripMaterial(grip) {
  if (gripMat?.map !== grip) {
    gripMat = new THREE.MeshStandardMaterial({ map: grip, bumpMap: grip, bumpScale: 1.5, roughness: 0.92 });
    gripMat.userData.shared = true;
  }
  return gripMat;
}

export function makeDeck(deck, grip, aniso) {
  const W = deck.size ? deck.size * IN : DECK_W;
  const L = deck.length ? deck.length * IN : DECK_L;
  const wheelbase = (deck.wheelbase ?? 14.25) * IN;
  const concave = deck.concave ?? 'Medium';
  const shape = shapeFor(W, L, concave);
  // Clear-coated graphic: a glossy lacquer layer over a satin print.
  const graphic = new THREE.MeshPhysicalMaterial({
    map: graphicTexture(deck, W, L, wheelbase, aniso), roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.18,
  });
  const group = new THREE.Group();
  for (const mesh of [
    new THREE.Mesh(shape.graphic, graphic),
    new THREE.Mesh(shape.grip, gripMaterial(grip)),
    new THREE.Mesh(shape.rail, railMaterial(deck, aniso)),
    new THREE.Mesh(boltsFor(W, L, concave, wheelbase), BOLT_MATS),
  ]) {
    mesh.castShadow = true;
    mesh.position.y = (L - DECK_L) / 2; // tail tip on -DECK_L / 2, see above
    group.add(mesh);
  }
  return group;
}
