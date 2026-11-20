import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PRODUCTS, productById, featured, CATEGORIES } from './catalog.js';
import { buildRoom, ROOM_X, WHEEL_SLOTS, TRUCK_SLOTS } from './scene.js';
import { COUNTER } from './counter.js';
import { makeGripTexture, DECK_L } from './deck.js';
import { LOW_POWER } from './texture-utils.js';
import { makeProductMesh, createMeshCache, disposeObject } from './product-mesh.js';
import { createBoard } from './board.js';
import { createBoardPreview } from './board-preview.js';
import { addItem, removeItem, hasItem, cartTotal, completeBoard, boardLines, thankYouLines, orderNumber } from './cart.js';
import { animate, ease, reducedMotion, wait } from './tween.js';
import { initAssistant } from './assistant.js';
import { initBrowse } from './browse-ui.js';
import { initCartPanel, showOrder, hideOrder } from './cart-ui.js';
import { fillCard, shareProduct } from './product-card.js';
import { loadCart, saveCart } from './cart-store.js';
import { parseRoute, formatRoute } from './router.js';
import { roll, morph, busyBeat, slidingPill } from './micro.js';
import { markShopReady, shopRevealed } from './loader.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const X_AXIS = new V3(1, 0, 0);
const Y_AXIS = new V3(0, 1, 0);
const touch = matchMedia('(pointer: coarse)').matches;
const money = (n) => `$${n}`;
const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
const storage = (() => { try { return window.localStorage; } catch { return undefined; } })();

// Canvas textures draw text once, so wait for the web fonts, but never more than 2 s (fallback fonts are fine).
await Promise.race([
  Promise.allSettled([
    document.fonts.load('400 100px "Saira Stencil One"'),
    document.fonts.load('500 40px "Space Grotesk"'),
    document.fonts.load('700 40px "Space Grotesk"'),
  ]),
  new Promise((resolve) => setTimeout(resolve, 2000)),
]);

// ── Renderer, camera, scene ──────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: $('stage'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_POWER ? 1.5 : 2)); // phones: fewer pixels to shade
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const aniso = renderer.capabilities.getMaxAnisotropy();

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 60);
const TAN = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
const camLook = new V3();

const room3d = buildRoom(aniso);
const { scene, plaque, veil } = room3d;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

// Depth of field while a product is picked: the wall behind it softens. Skipped on touch devices to
// spare phone GPUs (it renders the scene twice), and under reduced motion.
const dof = !touch && !reducedMotion() ? (() => {
  const composer = new EffectComposer(renderer);
  const bokeh = new BokehPass(scene, camera, { focus: 1.4, aperture: 0.004, maxblur: 0 });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  return { composer, bokeh, amount: 0 };
})() : null;

const board = createBoard(aniso);
board.object.position.set(0.42, COUNTER.top, COUNTER.z - 0.16);
board.object.rotation.x = -0.1;
scene.add(board.object);

const grip = makeGripTexture(aniso);
const makeMesh = (p) => makeProductMesh(p, grip, aniso);
const boardPreview = createBoardPreview(makeMesh);
const stageCache = createMeshCache(makeMesh, 6); // products shown on the 3D stage from Browse
const twins = new Map();                          // product id → its copy lying on the counter

// ── Featured products on the room walls ──────────────────────────────────
const HOME_Y = 1.75, HOME_Z = 0.05, SPACING = 0.5;
const items = [];
function hang(product, room, pos, quat = new THREE.Quaternion()) {
  const group = makeMesh(product);
  const item = { product, room, group, home: { pos, quat }, hover: 0, hoverVel: 0, hoverTarget: 0, atHome: true };
  group.userData.item = item;
  group.position.copy(pos);
  group.quaternion.copy(quat);
  scene.add(group);
  items.push(item);
  return item;
}
featured('decks').forEach((p, i, all) => {
  const x = ROOM_X.decks + (i - (all.length - 1) / 2) * SPACING;
  hang(p, 'decks', new V3(x, HOME_Y, HOME_Z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), (i % 2 ? 1 : -1) * 0.015));
  room3d.addPeg(x, HOME_Y - DECK_L / 2 - 0.012);
});
featured('wheels').forEach((p, i) => {
  const s = WHEEL_SLOTS[i];
  const item = hang(p, 'wheels', new V3(s.x, 0, s.z));
  item.home.pos.y = s.y - item.group.userData.minY; // stand it on the shelf
  item.group.position.copy(item.home.pos);
});
featured('trucks').forEach((p, i) => {
  const s = TRUCK_SLOTS[i];
  hang(p, 'trucks', new V3(s.x, s.y, s.z));
});
const itemGroups = items.map((i) => i.group);

// ── Camera poses, fitted to the viewport aspect ──────────────────────────
function wallPose(r = room) {
  const d = Math.max(1.12 / TAN, 1.42 / (TAN * camera.aspect));
  return { pos: new V3(ROOM_X[r], 2.15, d), look: new V3(ROOM_X[r], 2.25, 0) };
}

// Portrait screens frame just the board and checkout plate so both stay readable and tappable.
function counterPose() {
  const portrait = camera.aspect < 0.9;
  const look = new V3(portrait ? 0.4 : 0, 0.88, COUNTER.z);
  const dist = Math.max(2.3, (portrait ? 0.55 : 1.45) / (TAN * camera.aspect));
  return { pos: look.clone().add(new V3(0, 0.62, 1).normalize().multiplyScalar(dist)), look };
}

// The picked product comes forward to a stage in front of the counter and the veil (the veil sits
// between them), and the camera pushes in, framed by its size: left of the card on wide screens,
// above it on tall ones. `peek` = the phone's details sheet is collapsed, so the product gets the space.
// The stage is a full product radius in front of the veil, so however it is turned no part of it
// swings behind the veil and gets washed out.
function focusPose(item, peek = false) {
  const portrait = camera.aspect < 0.9;
  const x = item.home ? item.home.pos.x : ROOM_X[room];
  const pos = new V3(x, 1.8, veil.position.z + item.group.userData.radius + 0.08);
  const deck = item.product.category === 'decks';
  const quat = new THREE.Quaternion().setFromEuler(deck
    ? new THREE.Euler(0, portrait ? 0.12 : 0.24, -0.04)
    : new THREE.Euler(0.14, portrait ? 0.3 : 0.45, 0));
  const r = item.group.userData.radius;
  // Visible half-height at the product. Portrait leaves room for the two-row header and the details sheet.
  const halfH = portrait ? Math.max(peek ? 0.5 : 0.6, r * (peek ? 2.1 : 2.9)) : Math.max(0.3, r * 1.32);
  const look = portrait
    ? pos.clone().add(new V3(0, -(peek ? 0.05 : 0.38) * halfH, 0))
    : pos.clone().add(new V3(0.3 * halfH * camera.aspect, 0, 0));
  return { obj: { pos, quat }, cam: { pos: look.clone().add(new V3(0, 0.06, halfH / TAN)), look } };
}

// Eased camera move. `arc` pulls the camera back and up mid-move (a dolly), `roll` tilts it slightly.
function moveCamera(pose, ms, arc = 0, roll = 0) {
  const p0 = camera.position.clone(), l0 = camLook.clone();
  return animate(ms, (t) => {
    const e = ease.inOut(t);
    const swing = Math.sin(Math.PI * e);
    camera.position.lerpVectors(p0, pose.pos, e);
    camera.position.z += swing * arc;
    camera.position.y += swing * arc * 0.4;
    camLook.lerpVectors(l0, pose.look, e);
    camera.lookAt(camLook);
    camera.rotateZ(swing * roll);
  });
}

// `arc` bows the path toward the viewer, `lift` raises it mid-flight (clears the flip board on the counter).
function fly(group, to, ms, arc, lift = 0) {
  const p0 = group.position.clone(), q0 = group.quaternion.clone();
  return animate(ms, (t) => {
    const e = ease.inOut(t);
    group.position.lerpVectors(p0, to.pos, e);
    group.position.z += Math.sin(Math.PI * e) * arc;
    group.position.y += Math.sin(Math.PI * e) * lift;
    group.quaternion.slerpQuaternions(q0, to.quat, e);
  });
}

// ── Turning the picked product: drag to rotate (with a little inertia), pinch/scroll to zoom ──
// The viewer's rotation is two angles: `yaw` turns the product around the vertical axis, `pitch`
// tumbles it toward/away from the viewer. Both are unbounded, so it can go fully around either way.
const orbit = {
  yaw: 0, pitch: 0,
  quat: new THREE.Quaternion(), // derived from yaw/pitch each frame
  velX: 0, velY: 0,
  zoom: 1,
  pointers: new Map(),
  pinch: null,
  dragged: false,
};
const ORBIT_SPEED = 0.009; // radians per pixel of drag / scroll
const ZOOM_MIN = 0.55, ZOOM_MAX = 1.6;
const TAU = Math.PI * 2;
const yawQ = new THREE.Quaternion(), pitchQ = new THREE.Quaternion();

function turnProduct(dx, dy) {
  orbit.yaw += dx * ORBIT_SPEED;
  orbit.pitch += dy * ORBIT_SPEED;
  swayFrom = null; // the viewer is in charge now
}

function orbitQuat() {
  return orbit.quat.copy(yawQ.setFromAxisAngle(Y_AXIS, orbit.yaw)).multiply(pitchQ.setFromAxisAngle(X_AXIS, orbit.pitch));
}

const setZoom = (z) => { orbit.zoom = THREE.MathUtils.clamp(z, ZOOM_MIN, ZOOM_MAX); };

function resetOrbit() {
  orbit.yaw = orbit.pitch = 0;
  orbit.velX = orbit.velY = 0;
  orbit.zoom = 1;
}

async function fadeVeil(to, ms) {
  const from = veil.material.opacity;
  veil.visible = true;
  await animate(ms, (t) => { veil.material.opacity = from + (to - from) * ease.inOut(t); });
  veil.visible = to > 0;
}

function fadeDof(to, ms) {
  if (!dof) return Promise.resolve();
  const from = dof.amount;
  return animate(ms, (t) => { dof.amount = from + (to - from) * ease.inOut(t); });
}

// ── UI ───────────────────────────────────────────────────────────────────
const ui = { card: $('card'), checkout: $('checkout'), hint: $('hint'), add: $('cardAdd'), form: $('coForm') };
const HINTS = {
  wall: touch ? 'Tap a product · swipe up for the counter' : 'Pick a product · scroll for the counter',
  counter: touch ? 'Tap checkout · swipe down for the wall' : 'Click checkout · scroll up for the wall',
};

let mode = 'wall';  // wall | focus | counter | checkout
let room = 'decks'; // which stretch of wall the camera faces
let busy = false;
let current = null; // the product on the 3D stage: { product, group, home|null, fromBrowse }
let focusBase = null;
let swayFrom = null;
let cart = loadCart(storage, (id) => productById.has(id)); // survives refreshes and return visits
const landed = new Set(); // cart items whose counter copy has already flown down

// Opening a panel remembers what had focus; closing hands focus back before the panel goes inert.
let opener = null;
function panel(node, open) {
  if (open) opener = document.activeElement;
  else if (node.contains(document.activeElement)) {
    (opener?.isConnected && opener !== document.body && !opener.closest('[inert]') ? opener : $('cartLink')).focus({ preventScroll: true });
  }
  node.classList.toggle('open', open);
  node.inert = !open;
}
const say = (msg) => { $('live').textContent = msg; };

function setHint(text = HINTS[mode]) {
  ui.hint.classList.toggle('off', !text);
  if (text) ui.hint.textContent = text;
}

function clearHover() {
  for (const it of items) it.hoverTarget = 0;
  plaque.userData.setHover(false);
  renderer.domElement.style.cursor = '';
}

function markRoom() {
  for (const b of $('rooms').querySelectorAll('[data-room]')) {
    b.setAttribute('aria-current', String(b.dataset.room === room && mode !== 'counter' && mode !== 'checkout'));
  }
}

const showCard = (p) => fillCard(p, {
  inCart: hasItem(cart, p.id),
  backLabel: current?.fromBrowse ? '← Back to results' : '← Back to the wall',
});

// ── Links: every view has a URL (see router.js), so Back/Forward work and products can be shared ──
let routing = false; // true while applying a URL, so the navigation doesn't push it again
let pushedOver = null; // the hash the open product's entry was pushed on top of
function setRoute(route, replace = false) {
  if (routing) return;
  const hash = formatRoute(route);
  if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
}

// ── The counter: cart items lie on it. Decks lie nearly flat and parallel along the front strip,
// small gear stands in a row along the back edge, so no deck ever hides the gear behind it. ──
const deckSlot = (n) => ({
  pos: new V3(-0.6 + n * 0.08, COUNTER.top + 0.047 + n * 0.012, COUNTER.z + 0.14 - n * 0.015),
  quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 1.35 + n * 0.06)),
});
const GEAR_SCALE = 0.6;
const gearSlot = (k, twin) => ({
  pos: new V3(-1.0 + k * 0.21, COUNTER.top - twin.userData.minY * GEAR_SCALE, COUNTER.z - 0.25),
  quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.25, 0)),
});
const MAX_ON_COUNTER = 5; // per kind; the flip board still lists everything

function twinFor(id) {
  let twin = twins.get(id);
  if (!twin) {
    const p = productById.get(id);
    twin = makeMesh(p);
    if (p.category !== 'decks') twin.scale.setScalar(GEAR_SCALE);
    twin.visible = false;
    scene.add(twin);
    twins.set(id, twin);
  }
  return twin;
}

// Where each cart item sits on the counter, or null if that kind's spots are full.
function slotFor(id) {
  const isDeck = (x) => productById.get(x).category === 'decks';
  const same = cart.filter((x) => isDeck(x) === isDeck(id));
  const k = same.indexOf(id);
  if (k < 0 || k >= MAX_ON_COUNTER) return null;
  return isDeck(id) ? deckSlot(k) : gearSlot(k, twinFor(id));
}

function layoutCounter() {
  for (const id of landed) if (!cart.includes(id)) landed.delete(id); // re-added later → it drops in again
  for (const [id, twin] of twins) {
    if (cart.includes(id)) continue;
    twin.removeFromParent();
    disposeObject(twin);
    twins.delete(id);
  }
  for (const id of cart) {
    const slot = slotFor(id);
    if (!slot) { // no spot left on the counter: don't build (or keep showing) a copy
      if (twins.has(id)) twins.get(id).visible = false;
      continue;
    }
    const twin = twinFor(id);
    twin.visible = landed.has(id);
    twin.position.copy(slot.pos);
    twin.quaternion.copy(slot.quat);
  }
}

// New cart items drop in from above and land on the counter with a small hop.
async function flyToCounter(id, delay) {
  await wait(delay);
  const slot = slotFor(id);
  if (!slot) { landed.add(id); return; }
  const twin = twinFor(id);
  const from = slot.pos.clone().add(new V3(0.25, 1.2, -0.4));
  const q0 = slot.quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, 0.5, -0.6)));
  landed.add(id);
  twin.visible = true;
  await animate(750, (t) => {
    const e = ease.out(t);
    twin.position.set(
      from.x + (slot.pos.x - from.x) * e,
      from.y + (slot.pos.y - from.y) * ease.land(t),
      from.z + (slot.pos.z - from.z) * e,
    );
    twin.quaternion.slerpQuaternions(q0, slot.quat, ease.inOut(Math.min(1, t / 0.7)));
  });
}

const landNewItems = () => Promise.all(cart.filter((id) => !landed.has(id)).map((id, k) => flyToCounter(id, k * 140)));

const navLabel = (p) => `View ${p.name}, ${money(p.price)}${hasItem(cart, p.id) ? ', in cart' : ''}`;
const labelNav = () => items.forEach((it, i) => { $('deckNav').children[i].textContent = navLabel(it.product); });

function refreshCart() {
  labelNav();
  const count = $('cartCount');
  if (cart.length > Number(count.textContent)) { // a little bump on the badge when something is added
    count.classList.remove('bump');
    void count.offsetWidth;
    count.classList.add('bump');
  }
  roll(count, cart.length);
  roll($('coTotal'), money(cartTotal(cart, PRODUCTS)));
  layoutCounter();
  board.setLines(boardLines(cart, PRODUCTS));
  cartPanel.render(cart);
  saveCart(storage, cart);
  if (mode === 'checkout') showAssembledBoard(cart, $('coBoard'));
}

// The picked deck, trucks and wheels as one board, once the cart holds all three.
function showAssembledBoard(ids, container) {
  const parts = completeBoard(ids, PRODUCTS);
  if (parts) boardPreview.show(parts, container);
  else boardPreview.hide(container);
}

// ── Actions ──────────────────────────────────────────────────────────────
// `takeFocus` is false when the assistant drives the shop, so typing in the chat isn't interrupted.
async function openItem(item, { takeFocus = true, fromBrowse = false } = {}) {
  browse.close({ restoreFocus: false }); // e.g. a wall product clicked beside the open drawer
  cartPanel.close({ restoreFocus: false });
  hideOrder();
  mode = 'focus';
  current = { ...item, fromBrowse };
  const before = location.hash;
  setRoute({ view: 'product', id: item.product.id });
  pushedOver = !routing && location.hash !== before ? before : null;
  engage();
  clearHover();
  setHint(touch ? null : 'Drag or scroll to turn it · pinch or ⌘/Ctrl+scroll to zoom · double-click to reset');
  markRoom();
  resetOrbit();
  setPeek(false);
  showCard(item.product);
  const pose = focusPose(item);
  focusBase = pose.obj;
  if (item.home) {
    item.atHome = false;
  } else {
    // Not on the wall: rise into view from below, as if pulled from the stockroom.
    item.group.position.copy(focusBase.pos).add(new V3(0.2, -1.3, 0.5));
    item.group.quaternion.copy(focusBase.quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.8, 0.6, 0)));
    scene.add(item.group);
  }
  panel(ui.card, true);
  await Promise.all([
    fly(item.group, focusBase, 900, item.home ? 0.12 : 0, item.home ? 0.4 : 0),
    moveCamera(pose.cam, 950),
    fadeVeil(dof ? 0.55 : 0.82, 700), // no blur on phones, so a denser veil hides the counter
    fadeDof(1, 900),
  ]);
  swayFrom = clock.elapsedTime;
  if (takeFocus) ui.add.focus({ preventScroll: true });
}

async function closeItem({ reopenBrowse = true } = {}) {
  const it = current;
  setPeek(false);
  // Swap the product link for where we're going back to (replace: Back shouldn't reopen what was just closed).
  if (!(reopenBrowse && it.fromBrowse)) {
    // Closed with the card's own button right after opening it from this room: step back in history
    // rather than adding a second copy of the room entry (which would make the next Back do nothing).
    const roomHash = formatRoute({ view: 'room', room });
    // (Only for the visitor's own closes: card button, Esc, click outside. Those are the calls that keep
    // the default reopenBrowse; programmatic closes on the way somewhere else pass false.)
    if (reopenBrowse && !routing && pushedOver !== null && (pushedOver || '#/decks') === roomHash) history.back();
    else setRoute({ view: 'room', room }, true);
  }
  pushedOver = null;
  panel(ui.card, false);
  swayFrom = null;
  mode = 'wall';
  setHint();
  markRoom();
  orbit.velX = orbit.velY = 0;
  const away = { pos: focusBase.pos.clone().add(new V3(0.2, -1.4, 0.5)), quat: focusBase.quat };
  await Promise.all([
    it.home ? fly(it.group, it.home, 800, 0.08, 0.4) : fly(it.group, away, 600, 0),
    moveCamera(wallPose(), 800),
    fadeVeil(0, 600),
    fadeDof(0, 600),
  ]);
  if (it.home) items.find((x) => x.group === it.group).atHome = true;
  else it.group.removeFromParent(); // stays in the cache for a quick re-open
  current = null;
  resetOrbit();
  if (reopenBrowse && it.fromBrowse) browse.open();
}

// Spins from wherever the sway or the viewer left the product, settling exactly on the showcase pose.
// A deck's long axis is local Y, so for decks this reads as a kickflip; for gear, a turntable spin.
async function spin() {
  const g = current.group;
  const p0 = g.position.clone(), q0 = g.quaternion.clone();
  const turn = new THREE.Quaternion();
  swayFrom = null;
  orbit.velX = orbit.velY = 0;
  await animate(720, (t) => {
    const e = ease.inOut(t);
    g.quaternion.slerpQuaternions(q0, focusBase.quat, e).multiply(turn.setFromAxisAngle(Y_AXIS, e * Math.PI * 2));
    g.position.lerpVectors(p0, focusBase.pos, e).addScaledVector(Y_AXIS, Math.sin(Math.PI * t) * 0.14);
  });
  orbit.yaw = orbit.pitch = 0; // the spin lands on the showcase pose, so the viewer's rotation starts fresh
  swayFrom = clock.elapsedTime;
}

// Eases the viewer's rotation and zoom back to the showcase pose (double-click / double-tap).
async function resetView() {
  // Ease to the nearest full turn, so a product spun around five times doesn't unwind five times.
  const y0 = orbit.yaw, p0 = orbit.pitch, z0 = orbit.zoom;
  const y1 = Math.round(y0 / TAU) * TAU, p1 = Math.round(p0 / TAU) * TAU;
  orbit.velX = orbit.velY = 0;
  await animate(450, (t) => {
    const e = ease.inOut(t);
    orbit.yaw = y0 + (y1 - y0) * e;
    orbit.pitch = p0 + (p1 - p0) * e;
    orbit.zoom = z0 + (1 - z0) * e;
  });
  orbit.yaw = orbit.pitch = 0;
}

// Phones: the details sheet collapses to a slim bar so the product can be seen whole, and the camera
// reframes to use the freed space. Tapping the handle (or the bar) brings the details back.
let peek = false;
function setPeek(on) {
  peek = on;
  ui.card.classList.toggle('peek', on);
  const handle = $('cardToggle');
  handle.setAttribute('aria-expanded', String(!on));
  handle.setAttribute('aria-label', on ? 'Show details' : 'Hide details');
}

async function toggleCart() {
  const { id, name } = current.product;
  if (hasItem(cart, id)) {
    cart = removeItem(cart, id);
    say(`${name} removed from cart`);
  } else {
    await spin();
    cart = addItem(cart, id);
    say(`${name} added to cart`);
    refreshCart();
    morph(ui.add, 'Added ✓'); // a beat of confirmation before the button becomes "Remove from cart"
    await wait(650);
    if (current) showCard(current.product);
    return;
  }
  refreshCart();
  showCard(current.product);
}

// Pan along the wall to a category room (from the wall, a picked product, the counter or checkout).
async function goRoom(r) {
  if (!(r in ROOM_X)) return;
  browse.close({ restoreFocus: false }); // the 3D scene is taking over
  cartPanel.close({ restoreFocus: false });
  hideOrder();
  if (mode === 'checkout') closeCheckout();
  if (mode === 'focus') await closeItem({ reopenBrowse: false });
  const from = mode;
  if (from === 'wall' && r === room) return;
  room = r;
  mode = 'wall';
  room3d.aimSun(ROOM_X[r]);
  setRoute({ view: 'room', room: r });
  clearHover();
  setHint();
  markRoom();
  await moveCamera(wallPose(), from === 'counter' ? 1100 : 1000, 0.25, from === 'counter' ? -0.015 : 0);
}

const goWall = () => goRoom(room);

async function goCounter() {
  hideIntro();
  hideOrder();
  browse.close({ restoreFocus: false });
  cartPanel.close({ restoreFocus: false });
  if (mode === 'checkout') return closeCheckout(); // the camera is already at the counter
  if (mode === 'focus') await closeItem({ reopenBrowse: false });
  if (mode !== 'wall') return;
  mode = 'counter';
  room3d.aimSun(0);
  setRoute({ view: 'counter' });
  clearHover();
  setHint();
  markRoom();
  await moveCamera(counterPose(), 1300, 0.35, 0.02);
  await landNewItems();
}

function openCheckout(takeFocus = true) {
  if (!cart.length) {
    setHint('Cart is empty · pick something first');
    say('Your cart is empty. Pick something from the wall or Browse all first.');
    return;
  }
  mode = 'checkout';
  clearHover();
  setHint(null);
  panel(ui.checkout, true);
  showAssembledBoard(cart, $('coBoard'));
  if (takeFocus) ui.form.elements.email.focus({ preventScroll: true });
}

function closeCheckout() {
  panel(ui.checkout, false);
  mode = 'counter';
  setHint();
}

// Shows any product: its wall copy if it hangs in a room, otherwise a staged copy in its category's room.
async function showProduct(p, { takeFocus = true, fromBrowse = false } = {}) {
  if (mode === 'focus' && current.product.id === p.id) return;
  // Picked from Browse: don't touch the URL on the way to its room, so the #/browse?… entry stays right
  // under the product and browser Back returns to the results.
  const wasRouting = routing;
  if (fromBrowse) routing = true;
  try {
    browse.close({ restoreFocus: false });
    if (mode === 'focus') await closeItem({ reopenBrowse: false });
    if (mode === 'checkout') closeCheckout();
    if (mode !== 'wall' || room !== p.category) await goRoom(p.category);
  } finally {
    routing = wasRouting;
  }
  if (mode !== 'wall') return;
  const onWall = items.find((it) => it.product.id === p.id);
  await openItem(onWall ?? { product: p, group: stageCache.get(p), home: null }, { takeFocus, fromBrowse });
}

async function goCheckout(takeFocus = true) {
  if (mode === 'wall' || mode === 'focus') await goCounter();
  if (mode === 'counter') openCheckout(takeFocus);
}

ui.form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!cart.length) { closeCheckout(); return; } // never place an empty order
  if (!(await busyBeat(ui.form.querySelector('[type=submit]'), 'Placing order…'))) return; // already placing
  if (!cart.length || mode !== 'checkout') return; // emptied or closed during the beat
  const order = { id: orderNumber(Math.random), items: cart.map((id) => productById.get(id)), total: cartTotal(cart, PRODUCTS) };
  cart = [];
  refreshCart(); // also saves the now-empty cart
  board.setLines(thankYouLines(order.id, order.total));
  ui.form.reset();
  closeCheckout();
  setHint(null);
  say(`Demo order ${order.id} placed. Nothing was charged.`);
  showOrder(order, () => { setHint(); run(() => goRoom(room)); });
  showAssembledBoard(order.items.map((p) => p.id), $('cfBoard'));
});

// One animated action at a time; input during a transition is ignored.
function run(action) {
  if (busy) return Promise.resolve();
  busy = true;
  return Promise.resolve()
    .then(action)
    .catch(console.error)
    .finally(() => { busy = false; resize(); });
}

// The assistant queues instead of being ignored: wait for the current transition, then run.
async function runWhenIdle(action) {
  while (busy) await new Promise((resolve) => requestAnimationFrame(resolve));
  return run(action);
}

const sceneRoute = () => (mode === 'counter' || mode === 'checkout' ? { view: 'counter' } : { view: 'room', room });

const browse = initBrowse({
  products: PRODUCTS,
  onPick: (p) => run(() => showProduct(p, { fromBrowse: true })),
  onChange: (filters) => { if (browse?.isOpen() && mode !== 'focus') setRoute({ view: 'browse', filters }, true); },
  onClose: () => { if (mode !== 'focus') setRoute(sceneRoute(), true); },
});

// `runner` is runWhenIdle for the assistant, so its request waits for a running animation instead of being dropped.
function openBrowse(filters, runner = run) {
  return runner(async () => {
    if (mode === 'focus') await closeItem({ reopenBrowse: false });
    if (mode === 'checkout') closeCheckout();
    cartPanel.close({ restoreFocus: false });
    hideOrder();
    setRoute({ view: 'browse', filters: filters ?? {} }); // a new history entry; filter edits then replace it
    browse.open(filters);
  });
}

// The cart drawer: see what's in the cart without the camera trip. Checkout still goes via the counter.
const cartPanel = initCartPanel({
  onCheckout: () => run(() => goCheckout()),
  onBrowse: () => openBrowse(),
  onUndo: (id) => {
    cart = addItem(cart, id);
    say(`${productById.get(id).name} is back in your cart`);
    refreshCart();
    if (current) showCard(current.product);
  },
  onRemove: (id) => {
    cart = removeItem(cart, id);
    say(`${productById.get(id).name} removed from cart`);
    refreshCart();
    if (current) showCard(current.product);
    if (mode === 'checkout' && !cart.length) closeCheckout();
  },
  onShow: (p) => run(() => showProduct(p)),
});

function toggleCartPanel() {
  if (cartPanel.isOpen()) { cartPanel.close(); return; }
  browse.close({ restoreFocus: false });
  cartPanel.open();
}

// What the AI assistant can do. Ids are re-checked here; unknown ones are ignored.
const ASSISTANT_ACTIONS = {
  showProduct: ({ p }) => showProduct(p, { takeFocus: false }),
  addToCart: async ({ p }) => {
    if (hasItem(cart, p.id)) return;
    await showProduct(p, { takeFocus: false });
    if (current?.product.id === p.id) await toggleCart();
  },
  removeFromCart: ({ p }) => {
    cart = removeItem(cart, p.id);
    refreshCart();
    if (current) showCard(current.product);
    if (mode === 'checkout' && !cart.length) closeCheckout();
  },
  goRoom: ({ room: r }) => goRoom(r),
  goCounter: () => goCounter(),
  openCheckout: () => goCheckout(false),
};

const shop = {
  state: () => ({ cart: [...cart], view: mode, room, focused: current?.product.id ?? null }),
  perform({ type, product, room: r, filters }) {
    if (type === 'showResults') return openBrowse(filters ?? {}, runWhenIdle);
    const act = ASSISTANT_ACTIONS[type];
    const p = product === undefined ? null : productById.get(product);
    if (!act || (product !== undefined && !p)) return Promise.resolve();
    return runWhenIdle(() => act({ p, room: r }));
  },
};

// ── Input ────────────────────────────────────────────────────────────────
const canvas = renderer.domElement;
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function hit(ev, objects) {
  ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(objects, true)[0]?.object ?? null;
}

function itemOf(obj) {
  while (obj && !obj.userData.item) obj = obj.parent;
  return obj?.userData.item ?? null;
}

const hitsCurrent = (ev) => {
  let o = hit(ev, [current.group]);
  while (o && o !== current.group) o = o.parent;
  return Boolean(o);
};

const portrait = () => camera.aspect < 0.9;

// Dragging the picked product turns it; two fingers pinch-zoom. Runs before hover handling.
function orbitMove(ev) {
  const prev = orbit.pointers.get(ev.pointerId);
  const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
  orbit.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (orbit.pointers.size >= 2 && orbit.pinch) {
    const [a, b] = [...orbit.pointers.values()];
    setZoom(orbit.pinch.zoom * (orbit.pinch.dist / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))));
    return;
  }
  if (!orbit.dragged) {
    if (Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) < 6) return; // still a tap
    orbit.dragged = true;
    if (portrait()) setPeek(true); // get the details out of the way while turning
    canvas.style.cursor = 'grabbing';
  }
  turnProduct(dx, dy);
  orbit.velX = dx;
  orbit.velY = dy;
}

function orbitEnd(ev) {
  if (!orbit.pointers.delete(ev.pointerId)) return;
  if (orbit.pointers.size < 2) orbit.pinch = null;
  if (!orbit.pointers.size) canvas.style.cursor = '';
}
canvas.addEventListener('pointerup', orbitEnd);
canvas.addEventListener('pointercancel', orbitEnd);

canvas.addEventListener('pointermove', (ev) => {
  if (orbit.pointers.has(ev.pointerId)) { orbitMove(ev); return; }
  if (ev.pointerType !== 'mouse' || busy) return;
  let pointer = false;
  if (mode === 'wall') {
    const it = itemOf(hit(ev, itemGroups));
    for (const x of items) x.hoverTarget = x === it ? 1 : 0;
    pointer = Boolean(it);
  } else if (mode === 'counter') {
    pointer = Boolean(hit(ev, [plaque]));
    plaque.userData.setHover(pointer);
  } else if (mode === 'focus') {
    canvas.style.cursor = hitsCurrent(ev) ? 'grab' : '';
    return;
  }
  canvas.style.cursor = pointer ? 'pointer' : '';
});
canvas.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') clearHover(); });

// `downAt` survives until the click (pointerup clears `swipe` for touch first).
let swipe = null;
let downAt = null;
let ignoreClickUntil = 0;
let lastProductTap = -Infinity;
canvas.addEventListener('pointerdown', (ev) => {
  swipe = { x: ev.clientX, y: ev.clientY };
  downAt = { x: ev.clientX, y: ev.clientY };
  if (mode !== 'focus' || busy) return;
  orbit.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  canvas.setPointerCapture?.(ev.pointerId);
  orbit.velX = orbit.velY = 0;
  orbit.dragged = false;
  if (orbit.pointers.size === 2) {
    const [a, b] = [...orbit.pointers.values()];
    orbit.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: orbit.zoom };
  }
});
canvas.addEventListener('pointerup', (ev) => {
  if (mode === 'focus') { swipe = null; return; } // drags turn the product instead of navigating
  if (!swipe || ev.pointerType === 'mouse') return;
  const dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 50) return;
  ignoreClickUntil = performance.now() + 400;
  if (Math.abs(dy) > Math.abs(dx)) { run(dy < 0 ? goCounter : goWall); return; }
  // Horizontal swipe on the wall: next / previous room.
  if (mode !== 'wall') return;
  const order = CATEGORIES.map((c) => c.id);
  const next = order[order.indexOf(room) + (dx < 0 ? 1 : -1)];
  if (next) run(() => goRoom(next));
});

canvas.addEventListener('click', (ev) => {
  if (busy || performance.now() < ignoreClickUntil) return;
  if (downAt && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 6) return; // a drag, not a click
  if (mode === 'wall') {
    const it = itemOf(hit(ev, itemGroups));
    if (it) run(() => openItem(it));
  } else if (mode === 'focus') {
    // Tap off the product closes it; a double tap/click on it resets the view (dragging turns it).
    if (!hitsCurrent(ev)) { run(closeItem); return; }
    const now = performance.now();
    if (now - lastProductTap < 350) resetView();
    lastProductTap = now;
  } else if (mode === 'counter') {
    if (hit(ev, [plaque])) openCheckout();
  } else if (mode === 'checkout') {
    closeCheckout();
  }
});

let wheelLock = 0;
addEventListener('wheel', (ev) => {
  if (ev.target.closest?.('.panel, .assistant, .drawer')) return;
  if (mode === 'focus') {
    // Picked product: scroll / two-finger swipe turns it (sideways = turn, up-down = tumble);
    // pinch on a trackpad (reported as ctrl+wheel) or ⌘/Ctrl+scroll zooms.
    ev.preventDefault(); // stops ctrl+wheel from zooming the whole page
    if (ev.ctrlKey || ev.metaKey) setZoom(orbit.zoom * (1 + ev.deltaY * 0.01));
    else {
      orbit.velX = orbit.velY = 0;
      turnProduct(-ev.deltaX * 0.6, -ev.deltaY * 0.6);
    }
    return;
  }
  if (Math.abs(ev.deltaY) < 8) return;
  const now = performance.now();
  if (now < wheelLock) return;
  wheelLock = now + 700; // swallow trackpad inertia
  if (ev.deltaY > 0 && (mode === 'wall' || mode === 'focus')) run(goCounter);
  else if (ev.deltaY < 0 && (mode === 'counter' || mode === 'focus')) run(goWall);
}, { passive: false }); // not passive: it must be able to cancel ctrl+wheel page zoom over the product

addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (mode === 'checkout') closeCheckout();
    else if (mode === 'focus') run(closeItem);
    return;
  }
  if (mode === 'checkout' || ev.target.closest?.('input, select, .drawer, .assistant')) return;
  if (ev.key === ' ' && ev.target.closest?.('button')) return; // let Space press the focused button
  if (mode === 'focus') { // keyboard turning: arrows rotate, + / - zoom, 0 resets
    const step = { ArrowLeft: [-25, 0], ArrowRight: [25, 0], ArrowUp: [0, -25], ArrowDown: [0, 25] }[ev.key];
    if (step) { ev.preventDefault(); turnProduct(...step); }
    else if (ev.key === '+' || ev.key === '=') setZoom(orbit.zoom * 0.9);
    else if (ev.key === '-') setZoom(orbit.zoom / 0.9);
    else if (ev.key === '0') resetView();
    return;
  }
  const order = CATEGORIES.map((c) => c.id);
  if (['ArrowDown', 'PageDown', ' ', 'End'].includes(ev.key)) { ev.preventDefault(); run(goCounter); }
  else if (['ArrowUp', 'PageUp', 'Home'].includes(ev.key)) { ev.preventDefault(); run(goWall); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && mode === 'wall') {
    const next = order[order.indexOf(room) + (ev.key === 'ArrowRight' ? 1 : -1)];
    if (next) { ev.preventDefault(); run(() => goRoom(next)); }
  }
});

// Safari reports trackpad pinch as gesture events rather than ctrl+wheel.
let gestureZoom = 1;
addEventListener('gesturestart', (ev) => { if (mode === 'focus') { ev.preventDefault(); gestureZoom = orbit.zoom; } });
addEventListener('gesturechange', (ev) => { if (mode === 'focus') { ev.preventDefault(); setZoom(gestureZoom / ev.scale); } });

ui.add.addEventListener('click', () => run(toggleCart));
$('cardBack').addEventListener('click', () => run(closeItem));
$('cardToggle').addEventListener('click', () => setPeek(!peek));
// Tapping the collapsed bar (anywhere but its buttons) brings the details back.
ui.card.addEventListener('click', (ev) => { if (peek && !ev.target.closest('button')) setPeek(false); });
$('coBack').addEventListener('click', closeCheckout);
$('cartLink').addEventListener('click', toggleCartPanel);
$('cardShare').addEventListener('click', async () => {
  const msg = await shareProduct(current.product);
  if (msg) { say(msg); setHint(msg); setTimeout(() => { if (mode === 'focus') setHint(null); }, 1800); }
});
$('brand').addEventListener('click', () => { browse.close({ restoreFocus: false }); run(() => goRoom('decks')); });
$('browseOpen').addEventListener('click', () => (browse.isOpen() ? browse.close() : openBrowse(undefined)));
for (const b of $('rooms').querySelectorAll('[data-room]')) {
  b.addEventListener('click', () => { browse.close({ restoreFocus: false }); run(() => goRoom(b.dataset.room)); });
}

// Keyboard / screen-reader route through the featured products.
function navButton(label, action, onFocus) {
  const b = el('button', label);
  b.type = 'button';
  b.addEventListener('click', () => run(action));
  if (onFocus) {
    b.addEventListener('focus', onFocus);
    b.addEventListener('blur', clearHover);
  }
  return b;
}
$('deckNav').append(
  ...items.map((it) => navButton(navLabel(it.product), () => showProduct(it.product), () => {
    if (mode === 'wall' && it.room === room) for (const x of items) x.hoverTarget = x === it ? 1 : 0;
  })),
  navButton('Go to the counter', goCounter),
  navButton('Checkout', () => goCheckout()),
);

// ── Resize + render loop ─────────────────────────────────────────────────
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  dof?.composer.setPixelRatio(renderer.getPixelRatio());
  dof?.composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (busy) return; // run() calls resize() again once the transition ends
  let pose = mode === 'counter' || mode === 'checkout' ? counterPose() : wallPose();
  if (mode === 'focus') {
    const f = focusPose(current, peek);
    pose = f.cam;
    focusBase = f.obj;
    current.group.position.copy(focusBase.pos);
    current.group.quaternion.copy(focusBase.quat);
  }
  camera.position.copy(pose.pos);
  camLook.copy(pose.look);
  camera.lookAt(camLook);
}
addEventListener('resize', resize);

// Hover is a damped spring (stiffness/damping tuned by eye) so a product pops off the wall with a
// slight overshoot instead of easing out flatly. Reduced motion jumps straight to the target.
const SPRING_K = 190, SPRING_C = 16;
const tilt = new THREE.Quaternion();
const turn = new THREE.Quaternion();
function updateItems(dt, time) {
  for (const it of items) {
    if (reducedMotion()) {
      it.hover = it.hoverTarget;
      it.hoverVel = 0;
    } else {
      it.hoverVel += (SPRING_K * (it.hoverTarget - it.hover) - SPRING_C * it.hoverVel) * dt;
      it.hover += it.hoverVel * dt;
    }
    if (!it.atHome) continue;
    const h = it.hover;
    it.group.position.copy(it.home.pos);
    it.group.position.y += 0.025 * h;
    it.group.position.z += 0.14 * h;
    // Tip the top out and turn the face a little toward the middle of its room.
    it.group.quaternion.copy(it.home.quat)
      .multiply(turn.setFromAxisAngle(Y_AXIS, -Math.sign(it.home.pos.x - ROOM_X[it.room]) * 0.14 * h))
      .multiply(tilt.setFromAxisAngle(X_AXIS, 0.17 * h));
  }
  // The picked product: the viewer's rotation (with inertia after a flick) over a gentle idle sway.
  // Animations (fly, spin) own it while busy.
  if (mode === 'focus' && current && !busy) {
    if (!orbit.pointers.size && Math.abs(orbit.velX) + Math.abs(orbit.velY) > 0.05) {
      if (reducedMotion()) orbit.velX = orbit.velY = 0;
      else {
        turnProduct(orbit.velX, orbit.velY);
        orbit.velX *= 0.92;
        orbit.velY *= 0.92;
      }
    }
    const g = current.group;
    const s = swayFrom !== null && !reducedMotion() ? time - swayFrom : 0;
    g.quaternion.copy(focusBase.quat).multiply(tilt.setFromAxisAngle(Y_AXIS, Math.sin(s * 0.9) * 0.08)).premultiply(orbitQuat());
    g.position.copy(focusBase.pos);
    g.position.y += Math.sin(s * 1.3) * 0.008;
    followFocusCamera(dt);
  }
}

// While a product is picked the camera eases toward its framing, scaled by the zoom and adjusted
// for the phone's collapsed sheet. (During transitions moveCamera drives it instead.)
const camGoal = new V3(), lookGoal = new V3();
function followFocusCamera(dt) {
  const { cam } = focusPose(current, peek);
  lookGoal.copy(cam.look);
  camGoal.copy(cam.pos).sub(cam.look).multiplyScalar(orbit.zoom).add(cam.look);
  const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 9);
  camera.position.lerp(camGoal, k);
  camLook.lerp(lookGoal, k);
  camera.lookAt(camLook);
}

// ── Links in: Back/Forward and links opened from outside replay the view they point at ──
function applyRoute(route) {
  return runWhenIdle(async () => {
    routing = true;
    let fellBack = false;
    try {
      if (route.view === 'product' && productById.has(route.id)) await showProduct(productById.get(route.id), { takeFocus: false });
      else if (route.view === 'browse') {
        if (mode === 'focus') await closeItem({ reopenBrowse: false });
        cartPanel.close({ restoreFocus: false });
        browse.open(route.filters);
      } else if (route.view === 'counter') await goCounter();
      else {
        if (mode === 'focus') await closeItem({ reopenBrowse: false });
        browse.close({ restoreFocus: false });
        await goRoom(route.room ?? 'decks');
        fellBack = true;
      }
    } finally {
      routing = false;
    }
    if (fellBack) setRoute({ view: 'room', room }, true); // e.g. a stale #/p/<id>: show the real URL
  });
}
addEventListener('popstate', () => applyRoute(parseRoute(location.hash)));

// ── First visit: a short welcome, and until someone picks something up, the middle product of the
// room gives a little hop now and then so there's an obvious first thing to tap (phones have no hover). ──
const INTRO_KEY = 'slab-intro-v1';
let engaged = false;
function engage() {
  engaged = true;
  hideIntro();
}
let introDismissed = false;
function hideIntro() {
  introDismissed = true;
  $('intro').hidden = true;
  try { storage?.setItem(INTRO_KEY, '1'); } catch { /* fine: shows again next visit */ }
}
let introSeen = true;
try { introSeen = storage?.getItem(INTRO_KEY) === '1'; } catch { /* storage blocked: show it */ }
const linkedProduct = location.hash.startsWith('#/p/') && productById.has(parseRoute(location.hash).id);
// A shared product link goes straight to it. The welcome waits until the logo has landed.
if (!introSeen && !linkedProduct) shopRevealed.then(() => { if (!introDismissed) $('intro').hidden = false; });
$('introStart').addEventListener('click', hideIntro);
$('introBrowse').addEventListener('click', () => { hideIntro(); openBrowse(); });

let nextNudge = 3;
function nudge(time) {
  if (engaged || mode !== 'wall' || busy || reducedMotion() || time < nextNudge) return;
  nextNudge = time + 3.2;
  const inRoom = items.filter((it) => it.room === room);
  const pick = inRoom[Math.floor(inRoom.length / 2)];
  if (!pick || items.some((it) => it.hoverTarget)) return; // someone's already hovering
  pick.hoverTarget = 1;
  setTimeout(() => { if (pick.hoverTarget === 1 && !engaged) pick.hoverTarget = 0; }, 450);
}

const clock = new THREE.Clock();
$('browseCount').textContent = PRODUCTS.length;
resize();
refreshCart();
setHint(touch ? 'Tap a deck to pick it up' : undefined);
markRoom();
slidingPill($('rooms'), () => $('rooms').querySelector('.browse-open[aria-expanded="true"]') ?? $('rooms').querySelector('[aria-current="true"]'));
initAssistant(shop);
if (location.hash) applyRoute(parseRoute(location.hash)); // a shared link: open what it points at
renderer.setAnimationLoop(() => {
  try {
    const dt = Math.min(clock.getDelta(), 0.05);
    nudge(clock.elapsedTime);
    updateItems(dt, clock.elapsedTime);
    board.update(performance.now());
    if (dof && dof.amount > 0.001) {
      dof.bokeh.uniforms.focus.value = camera.position.distanceTo(current ? current.group.position : camLook);
      dof.bokeh.uniforms.maxblur.value = 0.012 * dof.amount;
      dof.composer.render();
    } else {
      renderer.render(scene, camera);
    }
  } finally {
    // After the first frame, shaders are compiled and the room is on screen behind the loader. In a
    // finally, so a frame that throws still lifts the loader: the header, Browse and cart keep working.
    markShopReady();
  }
});
