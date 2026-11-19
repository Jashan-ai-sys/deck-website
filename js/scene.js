import * as THREE from 'three';
import { canvasTexture, rng, addNoise, LOW_POWER } from './texture-utils.js';
import { COUNTER, buildCounter, buildPlaque, mesh } from './counter.js';

const WALL_W = 20; // three rooms side by side: wheels · decks · trucks
const WALL_H = 6; // tall enough to fill a portrait phone's view
const STEEL = new THREE.MeshStandardMaterial({ color: '#9aa0a4', metalness: 0.9, roughness: 0.35 });

function blotches(ctx, w, h, rand, count) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w, y = rand() * h, r = 40 + rand() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,30,20,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

// Board-formed concrete: panel seams every 1.2 × 0.6 m with tie holes.
function wallTexture(aniso) {
  return canvasTexture(4096, Math.round((4096 * WALL_H) / WALL_W), (ctx, w, h) => {
    const rand = rng(11), ppm = w / WALL_W;
    ctx.fillStyle = '#bab5ad';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rand, 320);
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 1.2 * ppm) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = h; y > 0; y -= 0.6 * ppm) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 0.3 * ppm; x < w; x += 0.6 * ppm) {
      for (let y = h - 0.3 * ppm; y > 0; y -= 0.6 * ppm) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(x, y, 0.016 * ppm, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(30,26,22,0.55)';
        ctx.beginPath(); ctx.arc(x, y, 0.011 * ppm, 0, Math.PI * 2); ctx.fill();
      }
    }
    addNoise(ctx, w, h, 22, rand);
  }, aniso);
}

function floorTexture(aniso) {
  const tex = canvasTexture(1024, 1024, (ctx, w, h) => {
    const rand = rng(23);
    ctx.fillStyle = '#6f6a63';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rand, 120);
    addNoise(ctx, w, h, 18, rand);
  }, aniso);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2.5);
  return tex;
}

// Spray-painted stencil lettering, speckled so it reads as paint on concrete.
function paintTexture(aniso, title, sub, size, seed) {
  return canvasTexture(2048, 800, (ctx, w) => {
    const rand = rng(seed);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c98a1b';
    ctx.shadowColor = 'rgba(201,138,27,0.35)';
    ctx.shadowBlur = 18;
    ctx.font = `400 ${size}px "Saira Stencil One", Impact, sans-serif`;
    ctx.fillText(title, w / 2, 560);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2a2622';
    ctx.font = '500 64px "Space Grotesk", sans-serif';
    ctx.letterSpacing = '22px';
    ctx.fillText(sub, w / 2, 720);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9000; i++) {
      ctx.globalAlpha = rand() * 0.6;
      ctx.fillRect(rand() * w, rand() * 800, 1 + rand() * 3, 1 + rand() * 3);
    }
  }, aniso);
}

// ── Room layout: each category has a stretch of wall, centred at ROOM_X ──
export const ROOM_X = { wheels: -5, decks: 0, trucks: 5 };
const SHELF_TOPS = [1.4, 2.02];
const TRUCK_ROWS = [1.55, 2.2];
// Where the featured wheels stand (on shelves) and trucks hang (on backer boards).
export const WHEEL_SLOTS = SHELF_TOPS.flatMap((y) => [-0.9, -0.3, 0.3, 0.9].map((dx) => ({ x: ROOM_X.wheels + dx, y, z: 0.12 })));
export const TRUCK_SLOTS = TRUCK_ROWS.flatMap((y) => [-0.7, 0, 0.7].map((dx) => ({ x: ROOM_X.trucks + dx, y, z: 0.03 })));

function roomFixtures(aniso) {
  const g = new THREE.Group();
  const walnut = new THREE.MeshStandardMaterial({ color: '#6e4426', roughness: 0.45 });
  for (const y of SHELF_TOPS) {
    const shelf = mesh(new THREE.BoxGeometry(2.5, 0.035, 0.26), walnut);
    shelf.position.set(ROOM_X.wheels, y - 0.0175, 0.13);
    g.add(shelf);
    for (const dx of [-1.05, 1.05]) {
      const bracket = mesh(new THREE.BoxGeometry(0.02, 0.12, 0.2), STEEL);
      bracket.position.set(ROOM_X.wheels + dx, y - 0.095, 0.1);
      g.add(bracket);
    }
  }
  for (const y of TRUCK_ROWS) {
    const board = mesh(new THREE.BoxGeometry(2.1, 0.32, 0.02), walnut);
    board.position.set(ROOM_X.trucks, y, 0.01);
    g.add(board);
  }
  for (const [x, title, sub] of [[ROOM_X.wheels, 'WHEELS', 'URETHANE · 50–60 MM'], [ROOM_X.trucks, 'TRUCKS', 'CAST & FORGED · PAIRS']]) {
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.9),
      new THREE.MeshStandardMaterial({ map: paintTexture(aniso, title, sub, 380, x + 50), transparent: true, depthWrite: false, roughness: 0.85 }),
    );
    label.position.set(x, 2.78, 0.004);
    g.add(label);
  }
  return g;
}


export function buildRoom(aniso) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2826');

  const wall = mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), new THREE.MeshStandardMaterial({ map: wallTexture(aniso), roughness: 0.92 }), { cast: false });
  wall.position.set(0, WALL_H / 2, 0);

  const floor = mesh(new THREE.PlaneGeometry(WALL_W, 10), new THREE.MeshStandardMaterial({ map: floorTexture(aniso), roughness: 0.5 }), { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 5);

  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.56, 1.0),
    new THREE.MeshStandardMaterial({ map: paintTexture(aniso, 'SLAB', 'DECK WORKS · EST. 2026', 560, 7), transparent: true, depthWrite: false, roughness: 0.85 }),
  );
  logo.position.set(0, 2.72, 0.004);

  const glowStrip = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_W, 0.02, 0.02),
    new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffb347', emissiveIntensity: 2 }),
  );
  glowStrip.position.set(0, 0.01, 0.02);

  scene.add(wall, floor, logo, glowStrip, roomFixtures(aniso), buildCounter(aniso));

  // Fades in over the wall while a deck is picked, so the floating deck stands out.
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_W, WALL_H),
    new THREE.MeshBasicMaterial({ color: '#e9e4dc', transparent: true, opacity: 0, depthWrite: false }),
  );
  veil.position.set(0, WALL_H / 2, 1.85); // in front of the counter (z ≤ 1.61), behind the picked product (stage z = veil z + its radius + 0.08, main.js)
  veil.visible = false;
  scene.add(veil);

  scene.add(new THREE.HemisphereLight('#fff4e6', '#3b352f', 0.45));
  const sun = new THREE.DirectionalLight('#fff0dc', 2.8);
  sun.position.set(2.2, 4.6, 4.2);
  sun.target.position.set(0, 1.6, 0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(LOW_POWER ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -2.5, near: 0.5, far: 14 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const lamp = new THREE.PointLight('#ffd6a0', 3, 3.5, 2);
  lamp.position.set(0, 2.1, COUNTER.z + 0.4);
  scene.add(sun, sun.target, lamp);

  const plaque = buildPlaque(aniso);
  scene.add(plaque);

  const pegGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.075, 12);
  const addPeg = (x, y) => {
    const peg = mesh(pegGeo, STEEL);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(x, y, 0.0375);
    scene.add(peg);
  };

  // The shadow map covers one room at a time (crisper than stretching it over the whole wall),
  // so the sun follows the camera from room to room.
  const aimSun = (x) => {
    sun.position.x = x + 2.2;
    sun.target.position.x = x;
  };

  return { scene, plaque, veil, addPeg, aimSun };
}
