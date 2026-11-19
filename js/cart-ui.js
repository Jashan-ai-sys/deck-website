// The cart drawer (see, open or remove what's in the cart, total, Checkout) and the order
// confirmation panel. DOM-only, shared by the 3D store and the 2D lite store.
import { PRODUCTS, productById } from './catalog.js';
import { cartTotal } from './cart.js';
import { paintThumb } from './thumbs.js';
import { roll, holdButton } from './micro.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);

export function initCartPanel({ onCheckout, onBrowse, onRemove, onUndo, onShow }) {
  const panel = $('cartPanel'), list = $('cpList'), opener = $('cartLink');

  // After taking something out, a short-lived Undo bar puts it back.
  let undoTimer = 0;
  let undoId = null;
  function offerUndo(p) {
    undoId = p.id;
    $('cpUndoText').textContent = `${p.name} taken out`;
    $('cpUndo').hidden = false;
    // The focused remove button left with its row; hand focus to Undo instead of dropping it on <body>.
    if (!panel.contains(document.activeElement)) $('cpUndoBtn').focus({ preventScroll: true });
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      if ($('cpUndo').contains(document.activeElement)) $('cpClose').focus({ preventScroll: true });
      $('cpUndo').hidden = true;
    }, 6000);
  }
  $('cpUndoBtn').addEventListener('click', () => {
    clearTimeout(undoTimer);
    $('cpUndo').hidden = true;
    onUndo(undoId);
    $('cpClose').focus({ preventScroll: true });
  });

  function row(p) {
    const li = el('li', { className: 'cp-item' });
    const thumb = el('canvas', { width: 80, height: 100 });
    thumb.setAttribute('aria-hidden', 'true');
    paintThumb(thumb, p);
    const name = el('button', { type: 'button', className: 'cp-name', textContent: p.name });
    name.addEventListener('click', () => onShow(p));
    const meta = el('span', { className: 'cp-meta', textContent: `${p.sizeLabel} · $${p.price}` });
    const info = el('div', { className: 'cp-info' });
    info.append(name, meta);
    const remove = el('button', { type: 'button', className: 'link cp-remove', textContent: 'Hold to remove' });
    remove.setAttribute('aria-label', `Remove ${p.name}`);
    holdButton(remove, () => { onRemove(p.id); offerUndo(p); }); // hold guards against a stray tap
    li.append(thumb, info, remove);
    return li;
  }

  function render(cart) {
    const items = cart.map((id) => productById.get(id)).filter(Boolean);
    list.replaceChildren(...items.map(row));
    $('cpTitle').textContent = items.length ? `Your cart (${items.length})` : 'Your cart';
    roll($('cpTotal'), `$${cartTotal(cart, PRODUCTS)}`);
    panel.classList.toggle('empty', !items.length);
  }

  const isOpen = () => panel.classList.contains('open');
  function setOpen(open, { restoreFocus = true } = {}) {
    if (open === isOpen()) return;
    panel.classList.toggle('open', open);
    panel.inert = !open;
    opener.setAttribute('aria-expanded', String(open));
    if (open) $('cpClose').focus({ preventScroll: true });
    else if (restoreFocus && panel.contains(document.activeElement)) opener.focus({ preventScroll: true });
  }

  $('cpClose').addEventListener('click', () => setOpen(false));
  $('cpCheckout').addEventListener('click', () => { setOpen(false, { restoreFocus: false }); onCheckout(); });
  $('cpBrowse').addEventListener('click', () => { setOpen(false, { restoreFocus: false }); onBrowse(); });
  panel.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    setOpen(false);
  });

  return { render, open: () => setOpen(true), close: (opts) => setOpen(false, opts), isOpen };
}

let dismissOrder = null;

// Hides the receipt without running its onDone, e.g. when the shopper has already gone elsewhere.
export function hideOrder() { dismissOrder?.(false); }

// Shows the order receipt; `onDone` runs when the shopper presses Keep browsing.
export function showOrder({ id, items, total }, onDone) {
  hideOrder();
  const panel = $('confirm');
  $('cfOrder').textContent = `Order ${id}`;
  $('cfItems').replaceChildren(...items.map((p) => {
    const li = el('li');
    li.append(el('span', { textContent: p.name }), el('span', { textContent: `$${p.price}` }));
    return li;
  }));
  $('cfTotal').textContent = `$${total}`;
  panel.classList.add('open');
  panel.inert = false;
  $('cfDone').focus({ preventScroll: true });
  const close = (runDone) => {
    panel.classList.remove('open');
    panel.inert = true;
    $('cfDone').removeEventListener('click', done);
    dismissOrder = null;
    if (runDone) onDone();
  };
  const done = () => close(true);
  dismissOrder = close;
  $('cfDone').addEventListener('click', done);
}
