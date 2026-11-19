// The shop counter: walnut slab on a steel frame, slatted walnut front, brass name plate,
// under-counter glow, a couple of props, and the clickable brass CHECKOUT plate.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, rng, addNoise } from './texture-utils.js';

export const COUNTER = { z: 1.3, top: 0.95 };

const TOP_W = 2.2, TOP_D = 0.62, TOP_T = 0.06;
const BODY_W = 2.06, BODY_D = 0.5, LEG = 0.045;
const BODY_H = COUNTER.top - TOP_T;

export const BRASS = new THREE.MeshStandardMaterial({ color: '#b8893a', metalness: 0.9, roughness: 0.32 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#25292d', metalness: 0.7, roughness: 0.4 });

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function woodTexture(aniso, base, seed) {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    const rand = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const y = rand() * h, amp = 1 + rand() * 4, f = 0.004 + rand() * 0.01;
      ctx.strokeStyle = rand() > 0.5 ? `rgba(30,15,6,${0.1 + rand() * 0.25})` : `rgba(210,150,90,${0.05 + rand() * 0.12})`;
      ctx.lineWidth = 0.5 + rand() * 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * f + i) * amp);
      ctx.stroke();
    }
    addNoise(ctx, w, h, 8, rand);
  }, aniso);
}

function namePlateTexture(aniso) {
  return canvasTexture(1024, 440, (ctx, w, h) => {
    ctx.fillStyle = '#c9a45c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7d6230';
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.fillStyle = '#231d14';
    ctx.textAlign = 'center';
    ctx.font = '400 190px "Saira Stencil One", Impact, sans-serif';
    ctx.fillText('SLAB', w / 2, 225);
    ctx.font = '500 34px "Space Grotesk", sans-serif';
    ctx.letterSpacing = '10px';
    ctx.fillText('DECK WORKS · SHOP 04', w / 2, 310);
    ctx.fillText('OPEN LATE · RIDE SAFE', w / 2, 370);
    addNoise(ctx, w, h, 12, rng(9));
  }, aniso);
}

function checkoutLabelTexture(aniso) {
  return canvasTexture(1024, 264, (ctx, w, h) => {
    ctx.fillStyle = '#17130f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a45c';
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = '#e8c27a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 104px "Space Grotesk", sans-serif';
    ctx.letterSpacing = '18px';
    ctx.fillText('CHECKOUT', w / 2, h / 2 + 4);
  }, aniso);
}

// Steel frame: four legs, a top rail and a recessed kick plate around a dark carcass.
function frame() {
  const g = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(LEG, BODY_H, LEG);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = mesh(legGeo, STEEL);
      leg.position.set(sx * (BODY_W / 2 - LEG / 2), BODY_H / 2, sz * (BODY_D / 2 - LEG / 2));
      g.add(leg);
    }
  }
  const rail = mesh(new THREE.BoxGeometry(BODY_W, 0.04, LEG), STEEL);
  rail.position.set(0, BODY_H - 0.02, BODY_D / 2 - LEG / 2);
  const kick = mesh(new THREE.BoxGeometry(BODY_W - 2 * LEG, 0.07, 0.02), STEEL);
  kick.position.set(0, 0.035, BODY_D / 2 - 0.07);
  const carcass = mesh(new THREE.BoxGeometry(BODY_W - 2 * LEG, BODY_H - 0.1, BODY_D - 0.08), new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.8 }));
  carcass.position.set(0, (BODY_H - 0.1) / 2 + 0.07, -0.02);
  g.add(rail, kick, carcass);
  return g;
}

// Vertical walnut slats across the front, one instanced mesh.
function slats(aniso) {
  const span = BODY_W - 2 * LEG - 0.02, pitch = 0.046, h = BODY_H - 0.16;
  const count = Math.floor(span / pitch);
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(aniso, '#5a3720', 15), roughness: 0.5 });
  const inst = new THREE.InstancedMesh(new RoundedBoxGeometry(0.036, h, 0.026, 2, 0.006), wood, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(-span / 2 + pitch / 2 + i * pitch, 0.08 + h / 2, BODY_D / 2 - 0.035);
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = inst.receiveShadow = true;
  return inst;
}

// Brass service bell on a round walnut base.
function bell(walnut) {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.05, 0.054, 0.016, 32), walnut);
  base.position.y = 0.008;
  const dome = mesh(new THREE.SphereGeometry(0.038, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), BRASS);
  dome.position.y = 0.016;
  const plunger = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.018, 12), BRASS);
  plunger.position.y = 0.062;
  const knob = mesh(new THREE.SphereGeometry(0.007, 16, 8), BRASS);
  knob.position.y = 0.072;
  g.add(base, dome, plunger, knob);
  return g;
}

// A roll of black grip tape on its cardboard core.
function gripRoll() {
  const g = new THREE.Group();
  const tape = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.11, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.95, side: THREE.DoubleSide }));
  const core = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.112, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#b08a5c', roughness: 0.9, side: THREE.DoubleSide }));
  const ring = mesh(new THREE.RingGeometry(0.035, 0.065, 40), new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.0551;
  g.add(tape, core, ring);
  g.position.y = 0.055;
  return g;
}

export function buildCounter(aniso) {
  const counter = new THREE.Group();
  counter.position.set(0, 0, COUNTER.z);
  const walnut = new THREE.MeshStandardMaterial({ map: woodTexture(aniso, '#6e4426', 5), roughness: 0.38 });

  const top = mesh(new RoundedBoxGeometry(TOP_W, TOP_T, TOP_D, 4, 0.014), walnut);
  top.position.y = COUNTER.top - TOP_T / 2;
  const trim = mesh(new THREE.BoxGeometry(TOP_W - 0.04, 0.006, 0.006), BRASS);
  trim.position.set(0, COUNTER.top - TOP_T - 0.003, TOP_D / 2 - 0.02);

  // Warm LED strip hidden under the overhang, washing down the slats.
  const led = new THREE.Mesh(new THREE.BoxGeometry(BODY_W - 0.1, 0.008, 0.008), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb45a', emissiveIntensity: 3 }));
  led.position.set(0, BODY_H - 0.012, BODY_D / 2 + 0.01);
  const wash = new THREE.PointLight('#ffb45a', 0.6, 1.4, 2);
  wash.position.set(0, BODY_H - 0.05, BODY_D / 2 + 0.12);

  const plate = mesh(new THREE.PlaneGeometry(0.6, 0.258), new THREE.MeshStandardMaterial({ map: namePlateTexture(aniso), metalness: 0.6, roughness: 0.35 }), { cast: false });
  plate.position.set(0, 0.47, BODY_D / 2 - 0.02);

  const ding = bell(walnut);
  ding.position.set(0.95, COUNTER.top, 0.16);
  const roll = gripRoll();
  roll.position.set(0.97, COUNTER.top, -0.17);

  counter.add(top, trim, frame(), slats(aniso), plate, led, wash, ding, roll);
  return counter;
}

// The clickable brass CHECKOUT plate that lies on the counter.
export function buildPlaque(aniso) {
  const label = new THREE.MeshStandardMaterial({
    map: checkoutLabelTexture(aniso), roughness: 0.5, metalness: 0.3,
    emissive: '#e8c27a', emissiveIntensity: 0,
  });
  label.emissiveMap = label.map;
  const plaque = new THREE.Group();
  const plate = mesh(new THREE.BoxGeometry(0.36, 0.02, 0.11), BRASS);
  const face = mesh(new THREE.PlaneGeometry(0.33, 0.085), label, { cast: false });
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.0105;
  // Invisible, larger hit box so the plate is easy to tap on small screens (raycasts still hit it).
  const hitPad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
  plaque.add(plate, face, hitPad);
  plaque.position.set(0.42, COUNTER.top + 0.01, COUNTER.z + 0.19);
  plaque.rotation.y = -0.08;
  plaque.userData.setHover = (on) => { label.emissiveIntensity = on ? 0.6 : 0; };
  return plaque;
}
