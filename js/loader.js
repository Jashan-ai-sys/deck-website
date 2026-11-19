// The opening. The SLAB wordmark holds the screen while the shop gets ready (fonts, then the shop's
// first rendered frame), then flies into the header's logo as the shop appears behind it. The logo
// never disappears; it becomes the header. Repeat visits in a session and reduced motion get a plain
// fade instead. Loaded by boot.js before three.js, so the wordmark is up while the 3D code downloads.
const FONTS = ['400 1em "Saira Stencil One"', '500 1em "Space Grotesk"', '700 1em "Space Grotesk"'];
const SEEN_KEY = 'slab-opening-v1';
const MIN_MS = 900;   // a fast load still shows the brand moment instead of flashing it
const FONT_MAX_MS = 2500; // fonts are nice to have; never wait longer than this for them
const IO = 'cubic-bezier(0.65, 0, 0.35, 1)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

let markReady;
const shopReady = new Promise((resolve) => { markReady = resolve; });
let markRevealed;
// Resolves once the loader is out of the way (used to bring in the first-visit welcome after it).
export const shopRevealed = new Promise((resolve) => { markRevealed = resolve; });

// Called by the 3D store after its first rendered frame, or by the lite store once it's built.
// Calling it more than once is harmless.
export function markShopReady() { markReady(); }

function seenThisSession() {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export async function revealShop() {
  const loader = document.getElementById('loader');
  const start = performance.now();
  const repeat = seenThisSession();
  const fonts = Promise.all(FONTS.map((spec) => document.fonts.load(spec))).catch(() => {}); // offline fonts: fallback
  fonts.then(() => loader.classList.add('fonts-in')); // no fallback-font flash on the wordmark itself
  try {
    await Promise.all([Promise.race([fonts, sleep(FONT_MAX_MS)]), shopReady]);
    if (!repeat) await sleep(MIN_MS - (performance.now() - start));
    if (loader.getAttribute('role') === 'alert') return; // shopFailed() replaced the loader with an error
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: the flight just replays */ }
    if (!repeat && !matchMedia('(prefers-reduced-motion: reduce)').matches) await handOff(loader);
  } catch (err) {
    console.error(err); // a broken flight must never leave the loader up
  } finally {
    if (loader.getAttribute('role') !== 'alert') loader.classList.add('done');
    markRevealed();
  }
}

// FLIP: measure the loader's wordmark and the header's, then move and scale one onto the other while
// the loader's backdrop fades away. The header word stays hidden until the flying one lands on it.
async function handOff(loader) {
  const word = loader.querySelector('.loader-word');
  const target = document.querySelector('.brand-word');
  if (!word || !target) return;
  const from = word.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from.width || !to.width) return;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  // Font-size ratio, not box heights: an inline span's box is the font's content area, the loader's
  // inline-block is its line box, so their heights aren't comparable.
  const scale = parseFloat(getComputedStyle(target).fontSize) / parseFloat(getComputedStyle(word).fontSize);
  loader.style.pointerEvents = 'none'; // the shop is usable while the logo is still landing
  target.style.visibility = 'hidden';
  try {
    const fades = [...loader.querySelectorAll('.loader-fade')].map((el) =>
      el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 250, easing: 'ease-out', fill: 'forwards' }));
    const flight = word.animate(
      [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, color: getComputedStyle(target).color }],
      { duration: 900, easing: IO, fill: 'forwards' });
    const backdrop = loader.animate(
      [{ backgroundColor: getComputedStyle(loader).backgroundColor }, { backgroundColor: 'transparent' }],
      { duration: 700, delay: 150, easing: 'ease-in-out', fill: 'forwards' });
    await Promise.all([flight.finished, backdrop.finished, ...fades.map((a) => a.finished)]);
    word.style.visibility = 'hidden'; // the header word is now in exactly the same spot
  } finally {
    target.style.visibility = '';
  }
}
