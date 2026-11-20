// Puts a deck, a truck set and a wheel set together into one skateboard. Pure geometry: the parts come
// from the same makers the shop wall uses, so the board matches what the shopper picked.
import * as THREE from 'three';

const IN = 0.0254;
const GEAR_SCALE = 0.37; // wheels and trucks are modelled ~2.7× real size for the shop wall; this brings them to deck scale
const MOUNT_Z = 0.015;   // baseplate height above the deck's graphic face (riser pad plus concave clearance)

// The board lies along Y (nose to tail) with its graphic and trucks on the +Z face. `makeMesh(product)`
// must return a fresh object each call, because the parts are re-parented into the board.
export function assembleBoard({ deck, wheels, truck }, makeMesh) {
  const board = new THREE.Group();
  const deckMesh = makeMesh(deck);
  board.add(deckMesh);
  const centre = new THREE.Box3().setFromObject(deckMesh).getCenter(new THREE.Vector3());
  const tires = makeMesh(wheels).children.filter((c) => c.isGroup); // the four wheels; the invisible hit box is a Mesh
  const halfAxle = 0.2 * (truck.size / 149);                        // display units, before GEAR_SCALE
  for (const end of [-1, 1]) {
    const mount = new THREE.Group();
    mount.scale.setScalar(GEAR_SCALE);
    mount.position.set(centre.x, centre.y + end * (deck.wheelbase * IN) / 2, MOUNT_Z);
    mount.rotation.z = end > 0 ? Math.PI : 0; // hangers sit outboard at both ends
    mount.add(makeMesh(truck));
    for (const side of [-1, 1]) {
      const wheel = tires.pop();
      wheel.rotation.set(0, 0, Math.PI / 2); // axle along X, like the truck's
      wheel.position.set(side * (halfAxle - 0.045), -0.03, 0.06); // on the axle, inside the nut
      mount.add(wheel);
    }
    board.add(mount);
  }
  return board;
}
