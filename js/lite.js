// The 2D lite store: used when WebGL or three.js isn't available (or with ?lite). Same catalog, search,
// product card, cart, links and checkout as the 3D store; the Browse grid is the shop floor.
import { PRODUCTS, productById } from './catalog.js';
import { initBrowse } from './browse-ui.js';
import { initCartPanel, showOrder, hideOrder } from './cart-ui.js';
import { fillCard, shareProduct } from './product-card.js';
import { loadCart, saveCart } from './cart-store.js';
import { addItem, removeItem, hasItem, cartTotal, orderNumber } from './cart.js';
import { paintThumb } from './thumbs.js';
import { parseRoute, formatRoute } from './router.js';
import { roll, busyBeat, slidingPill } from './micro.js';
import { markShopReady } from './loader.js';

const $ = (id) => document.getElementById(id);
const storage = (() => { try { return window.localStorage; } catch { return undefined; } })();
const say = (msg) => { if (msg) $('live').textContent = msg; };
// Opening remembers what had focus; closing hands it back before the panel goes inert (as in main.js).
let opener = null;
function setOpen(node, open) {
  if (open) opener = document.activeElement;
  else if (node.contains(document.activeElement)) {
    (opener?.isConnected && opener !== document.body && !opener.closest('[inert]') ? opener : $('cartLink')).focus({ preventScroll: true });
  }
  node.classList.toggle('open', open);
  node.inert = !open;
}

document.body.classList.add('lite');
let cart = loadCart(storage, (id) => productById.has(id));
let current = null;
let routing = false;

function setRoute(route, replace = false) {
  if (routing) return;
  const hash = formatRoute(route);
  if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
}

function refresh() {
  roll($('cartCount'), cart.length);
  roll($('coTotal'), `$${cartTotal(cart, PRODUCTS)}`);
  cartPanel.render(cart);
  saveCart(storage, cart);
  if (current) fillCard(current, { inCart: hasItem(cart, current.id), backLabel: '← Back to results' });
}

function showProduct(p) {
  current = p;
  hideOrder();
  cartPanel.close({ restoreFocus: false });
  fillCard(p, { inCart: hasItem(cart, p.id), backLabel: '← Back to results' });
  paintThumb($('cardThumb'), p);
  setOpen($('card'), true);
  setRoute({ view: 'product', id: p.id });
  $('cardAdd').focus({ preventScroll: true });
}

function closeProduct() {
  if (!current) return;
  setOpen($('card'), false);
  current = null;
  setRoute({ view: 'browse', filters: browseFilters }, true);
}

function openCheckout() {
  if (!cart.length) { say('Your cart is empty.'); return; }
  setOpen($('checkout'), true);
  $('coForm').elements.email.focus({ preventScroll: true });
}

let browseFilters = {};
const browse = initBrowse({
  products: PRODUCTS,
  closable: false, // the grid is the lite shop floor (its close button is hidden too)
  onPick: showProduct,
  onChange: (filters) => { browseFilters = filters; if (!current) setRoute({ view: 'browse', filters }, true); },
});

const cartPanel = initCartPanel({
  onCheckout: openCheckout,
  onBrowse: () => browse.open(),
  onUndo: (id) => { cart = addItem(cart, id); refresh(); },
  onRemove: (id) => {
    cart = removeItem(cart, id);
    refresh();
    if (!cart.length) setOpen($('checkout'), false);
  },
  onShow: showProduct,
});

$('cardAdd').addEventListener('click', () => {
  const { id, name } = current;
  cart = hasItem(cart, id) ? removeItem(cart, id) : addItem(cart, id);
  say(`${name} ${hasItem(cart, id) ? 'added to' : 'removed from'} cart`);
  refresh();
});
$('cardBack').addEventListener('click', closeProduct);
$('cardShare').addEventListener('click', async () => say(await shareProduct(current)));
$('cartLink').addEventListener('click', () => (cartPanel.isOpen() ? cartPanel.close() : cartPanel.open()));
$('coBack').addEventListener('click', () => setOpen($('checkout'), false));
const openGrid = (filters) => { hideOrder(); if (current) closeProduct(); browse.open(filters); };
$('brand').addEventListener('click', () => openGrid({}));
$('browseOpen').addEventListener('click', () => openGrid());
for (const b of $('rooms').querySelectorAll('[data-room]')) b.addEventListener('click', () => openGrid({ category: b.dataset.room }));

$('coForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!cart.length) { setOpen($('checkout'), false); return; }
  if (!(await busyBeat($('coForm').querySelector('[type=submit]'), 'Placing order…'))) return; // already placing
  if (!cart.length || !$('checkout').classList.contains('open')) return; // emptied or closed during the beat
  const order = { id: orderNumber(Math.random), items: cart.map((id) => productById.get(id)), total: cartTotal(cart, PRODUCTS) };
  cart = [];
  refresh();
  $('coForm').reset();
  setOpen($('checkout'), false);
  showOrder(order, () => browse.open());
});

addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if ($('checkout').classList.contains('open')) setOpen($('checkout'), false);
  else if (current) closeProduct();
});

function applyRoute(route) {
  routing = true;
  try {
    if (route.view === 'product' && productById.has(route.id)) showProduct(productById.get(route.id));
    else {
      // Back from a product to the grid it was opened from: just close the card, keep the grid's
      // filters and scroll. (No hash = the initial "all products" grid, not the Decks room.)
      const sameGrid = !location.hash || formatRoute(route) === formatRoute({ view: 'browse', filters: browseFilters });
      if (current) closeProduct();
      hideOrder();
      if (route.view === 'counter') cartPanel.open();
      else if (!sameGrid) browse.open(route.view === 'browse' ? route.filters : { category: route.room });
    }
  } finally {
    routing = false;
  }
}
addEventListener('popstate', () => applyRoute(parseRoute(location.hash)));

$('browseCount').textContent = PRODUCTS.length;
slidingPill($('rooms'), () => $('rooms').querySelector('.browse-open[aria-expanded="true"]'));
const incoming = location.hash; // read before opening Browse, which rewrites the URL
refresh();
routing = true;
browse.open({});
routing = false;
if (incoming) applyRoute(parseRoute(incoming));
markShopReady();
