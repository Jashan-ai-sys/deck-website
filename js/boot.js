// Entry point: the 3D store when the device can run it, otherwise the 2D lite store (same catalog,
// search, cart and checkout, no WebGL or three.js needed). `?lite` forces the lite store.
import { revealShop } from './loader.js';

revealShop(); // the opening starts now; whichever store loads marks itself ready

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function startLite(reason) {
  if (reason) console.warn('Starting the lite store:', reason);
  try {
    await import('./lite.js');
  } catch (err) {
    console.error(err);
    window.shopFailed?.();
  }
}

if (new URLSearchParams(location.search).has('lite') || !hasWebGL()) {
  await startLite();
} else {
  try {
    await import('./main.js');
  } catch (err) {
    // three.js blocked/offline, or the GPU refused a WebGL context mid-setup.
    document.getElementById('stage').hidden = true;
    await startLite(err);
  }
}
