// Wheels and trucks as display models (scaled up ~2.5× so they read on a shop wall). Everything is
// built from code, no model files. Their 2D thumbnails live in thumbs.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const part = (geo, mat) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
};

// Invisible box over the whole product so a click anywhere on it counts, including the gaps between
// the four wheels of a set (raycasts still hit meshes whose material is invisible).
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
HIT_MAT.userData.shared = true;
function hitBox(group) {
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  const pad = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), HIT_MAT);
  pad.position.copy(center);
  group.add(pad);
  return group;
}

// A set of four wheels standing in a 2×2 block, faces toward the viewer (+Z).
export function makeWheels(p) {
  const r = 0.075 * (p.size / 54), w = 0.07;
  const profile = [
    [0.03, -w / 2], [r - 0.014, -w / 2], [r - 0.004, -w / 2 + 0.005], [r, -w / 2 + 0.016],
    [r, w / 2 - 0.016], [r - 0.004, w / 2 - 0.005], [r - 0.014, w / 2], [0.03, w / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const urethane = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55 });
  const coreMat = new THREE.MeshStandardMaterial({ color: p.core, roughness: 0.45 });
  const bearing = new THREE.MeshStandardMaterial({ color: '#1a1b1e', metalness: 0.8, roughness: 0.3 });
  const tire = new THREE.LatheGeometry(profile, 48);
  const core = new THREE.CylinderGeometry(0.031, 0.031, w * 0.9, 32);
  const hole = new THREE.CylinderGeometry(0.014, 0.014, w + 0.002, 24);
  const group = new THREE.Group();
  for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Group();
    wheel.add(part(tire, urethane), part(core, coreMat), part(hole, bearing));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x * (r + 0.006), y * (r + 0.006), 0);
    group.add(wheel);
  }
  return hitBox(group);
}

// One truck hanging baseplate-to-wall: baseplate behind, hanger and axle in front (+Z).
export function makeTruck(p) {
  const s = p.size / 149;
  const metal = new THREE.MeshStandardMaterial({ color: p.finish, metalness: 0.85, roughness: 0.32 });
  const steel = new THREE.MeshStandardMaterial({ color: '#8e9398', metalness: 0.9, roughness: 0.25 });
  const bush = new THREE.MeshStandardMaterial({ color: p.bushing, roughness: 0.6 });
  const group = new THREE.Group();

  const base = part(new RoundedBoxGeometry(0.17, 0.12, 0.018, 2, 0.008), metal);
  const king = part(new THREE.CylinderGeometry(0.009, 0.009, 0.1, 16), steel);
  king.rotation.x = Math.PI / 2;
  king.position.z = 0.05;
  const b1 = part(new THREE.CylinderGeometry(0.024, 0.026, 0.022, 24), bush);
  b1.rotation.x = Math.PI / 2;
  b1.position.z = 0.035;
  const b2 = b1.clone();
  b2.position.z = 0.085;
  const hanger = part(new RoundedBoxGeometry(0.22 * s, 0.055, 0.05, 3, 0.02), metal);
  hanger.position.set(0, -0.012, 0.06);
  const axle = part(new THREE.CylinderGeometry(0.0075, 0.0075, 0.4 * s, 16), steel);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0, -0.03, 0.06);
  group.add(base, king, b1, b2, hanger, axle);
  for (const side of [-1, 1]) {
    const nut = part(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6), steel);
    nut.rotation.z = Math.PI / 2;
    nut.position.set(side * 0.2 * s, -0.03, 0.06);
    group.add(nut);
  }
  return hitBox(group);
}
