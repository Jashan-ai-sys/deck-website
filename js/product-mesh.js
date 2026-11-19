// Builds any catalog product as a 3D object on demand and keeps a small cache of recent ones within a
// memory budget. This is what lets ~300 products share one scene.
import * as THREE from 'three';
import { makeDeck } from './deck.js';
import { makeWheels, makeTruck } from './gear.js';

export function makeProductMesh(p, grip, aniso) {
  const group = p.category === 'decks' ? makeDeck(p, grip, aniso) : p.category === 'wheels' ? makeWheels(p) : makeTruck(p);
  const box = new THREE.Box3().setFromObject(group);
  group.userData.productId = p.id;
  group.userData.radius = box.getSize(new THREE.Vector3()).length() / 2; // for camera framing
  group.userData.minY = box.min.y;                                       // for standing it on a shelf
  return group;
}

// Frees GPU memory for one product. Geometry/materials/textures marked `shared` belong to many products.
export function disposeObject(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.userData.shared) o.geometry.dispose();
    for (const m of [].concat(o.material)) {
      if (m.userData.shared) continue;
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    }
  });
}

// Least-recently-used cache: at most `limit` built products are kept; anything older that isn't
// currently in the scene is disposed. Deck textures are the big cost (~5 MB each on the GPU).
export function createMeshCache(make, limit) {
  const cache = new Map();
  return {
    get(p) {
      let group = cache.get(p.id);
      if (group) cache.delete(p.id);
      else group = make(p);
      cache.set(p.id, group);
      for (const [id, old] of cache) {
        if (cache.size <= limit) break;
        if (old.parent) continue; // on screen right now
        cache.delete(id);
        disposeObject(old);
      }
      return group;
    },
  };
}
