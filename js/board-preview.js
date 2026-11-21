// A small turntable of the assembled board for the checkout and the order receipt. It sways on its
// own until the shopper takes over: drag (or the arrow keys) turns it, double-click hands it back.
// It has its own renderer and canvas (the shop's canvas is busy behind the panel) and moves between
// containers, so only one WebGL context is ever added. It stops by itself when its panel closes.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { assembleBoard } from './assemble-board.js';
import { disposeObject } from './product-mesh.js';
import { reducedMotion } from './tween.js';

const FOV = 28;
const TILT = -0.4; // top edge leans back, so the trucks and wheels show
const REST_YAW = 0.35;     // the still pose (reduced motion, and where a reset lands without a sway)
const DRAG_RAD_PER_PX = 0.012;
const KEY_STEP = 0.2;

export function createBoardPreview(makeMesh) {
  let renderer, scene, camera, pivot, box, raf = 0;
  let size = new THREE.Vector3(), key = '', fitted = '';
  let auto = true, yaw = REST_YAW; // auto: the sway drives the angle; otherwise the shopper's `yaw` does

  function init() {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      const lost = box;
      stop();
      if (lost) lost.hidden = true;
      renderer = null; // the next show() builds a fresh renderer and context
    });
    addControls(renderer.domElement);
    scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.position.set(-1, 1.5, 2);
    scene.add(light);
    camera = new THREE.PerspectiveCamera(FOV);
  }

  const currentYaw = () => (pivot ? pivot.rotation.y : yaw);
  const takeOver = () => { if (auto) { yaw = currentYaw(); auto = false; } };

  function addControls(canvas) {
    let drag = null;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Rotate the board: drag, or use the left and right arrow keys. Double-click to reset.');
    canvas.addEventListener('pointerdown', (ev) => {
      if (!ev.isPrimary || ev.button) return;
      canvas.setPointerCapture(ev.pointerId);
      takeOver();
      drag = ev.clientX;
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (drag === null) return;
      yaw += (ev.clientX - drag) * DRAG_RAD_PER_PX;
      drag = ev.clientX;
    });
    for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { drag = null; });
    canvas.addEventListener('dblclick', () => { auto = true; yaw = REST_YAW; });
    canvas.addEventListener('keydown', (ev) => {
      const turn = { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }[ev.key];
      if (turn === undefined && ev.key !== 'Home') return;
      ev.preventDefault();
      if (turn === undefined) { auto = true; yaw = REST_YAW; return; }
      takeOver();
      yaw += turn;
    });
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (pivot) {
      scene.remove(pivot);
      disposeObject(pivot);
      pivot = null;
    }
    box = null;
    key = fitted = '';
  }

  // Sizes the canvas to its container and backs the camera off until the whole board fits.
  // False while the container has no size (display: none, a collapsed panel).
  function fit() {
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return false;
    if (`${w}x${h}` === fitted) return true;
    fitted = `${w}x${h}`;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan((FOV / 2) * (Math.PI / 180));
    const reach = size.x / 2; // the board can turn end-on, so its length sweeps toward the camera and, tilted, up and down
    const halfH = (size.y * Math.cos(TILT) + size.x * Math.abs(Math.sin(TILT))) / 2;
    camera.position.set(0, 0, Math.max(halfH / t, reach / (t * camera.aspect)) * 1.1 + reach * 0.4);
    camera.updateProjectionMatrix();
    return true;
  }

  function frame(now) {
    if (!box?.closest('.open')) { stop(); return; } // its panel closed (Keep browsing, Esc, cart emptied)
    if (fit()) {
      pivot.rotation.y = !auto ? yaw : reducedMotion() ? REST_YAW : Math.sin(now / 1600) * 0.6;
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
  }

  // `parts` is { deck, wheels, truck }; `container` is an element inside an open panel. Showing the
  // same parts in the same container again does nothing, so cart edits that don't change the board
  // don't rebuild its textures.
  function show(parts, container) {
    const next = `${parts.deck.id}|${parts.wheels.id}|${parts.truck.id}`;
    if (raf && box === container && key === next) { container.hidden = false; return; }
    if (box !== container) { auto = true; yaw = REST_YAW; } // a fresh opening starts on its own again
    stop();
    const made = [];
    try {
      if (!renderer) init();
      const board = assembleBoard(parts, (p) => { const m = makeMesh(p); made.push(m); return m; });
      board.rotation.z = -Math.PI / 2; // nose to tail now runs along X
      pivot = new THREE.Group();
      pivot.add(board);
      scene.add(pivot);
      const bounds = new THREE.Box3().setFromObject(board); // measured untilted
      bounds.getSize(size);
      board.position.sub(bounds.getCenter(new THREE.Vector3()));
      pivot.rotation.x = TILT;
      container.hidden = false;
      container.replaceChildren(renderer.domElement);
      container.setAttribute('aria-label', `Your board: ${parts.deck.name} deck, ${parts.truck.name} trucks, ${parts.wheels.name} wheels`);
      box = container;
      key = next;
      raf = requestAnimationFrame(frame);
    } catch (err) { // no WebGL context, or the parts failed to build: the checkout works without the preview
      console.error(err);
      made.forEach(disposeObject); // parts that never reached the pivot
      stop();
      container.hidden = true;
    }
  }

  return { show, hide: (container) => { stop(); container.hidden = true; } };
}
