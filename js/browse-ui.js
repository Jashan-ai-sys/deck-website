// "Browse all": a drawer with search, filters, sort and a virtualized product grid. Only the cards in
// view (plus a little overscan) exist in the DOM, so the full catalog scrolls as smoothly as ten items.
import { CATEGORIES } from './catalog.js';
import { filterProducts, sizeOptions, priceRange, SORTS } from './browse.js';
import { paintThumb } from './thumbs.js';
import { roll } from './micro.js';

const CARD_MIN_W = 150, ROW_H = 236, GAP = 12, OVERSCAN = 2;

// `onChange(filters)` fires whenever the visible filters change and `onClose` when the drawer closes
// (both used to keep the URL in sync). `closable: false` keeps it open for good (the lite store's floor).
export function initBrowse({ products, onPick, onChange = () => {}, onClose = () => {}, closable = true }) {
  const $ = (id) => document.getElementById(id);
  const drawer = $('browse'), results = $('bResults'), spacer = $('bSpacer'), count = $('bCount');
  const query = $('bQuery'), sizeSel = $('bSize'), sortSel = $('bSort'), price = $('bPrice'), priceOut = $('bPriceOut');
  const opener = $('browseOpen');
  const { min, max } = priceRange(products);
  const state = { query: '', category: 'all', size: '', maxPrice: max, sort: 'featured' };
  let list = [];
  let cols = 1;
  const pool = new Map(); // grid index → card element currently showing it

  price.min = String(min);
  price.max = String(max);
  price.step = '2';
  sortSel.append(...Object.entries(SORTS).map(([value, label]) => new Option(label, value)));
  $('bCats').append(...[{ id: 'all', label: 'All' }, ...CATEGORIES].map((c) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: c.label });
    b.dataset.cat = c.id;
    b.addEventListener('click', () => { state.category = c.id; state.size = ''; apply(); });
    return b;
  }));
  query.placeholder = `Search ${products.length} products…`;

  function card() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pcard';
    b.innerHTML = '<canvas width="160" height="200" aria-hidden="true"></canvas><span class="pname"></span><span class="pmeta"></span>';
    b.addEventListener('click', () => onPick(b.product));
    return b;
  }

  function fill(b, p) {
    if (b.product === p) return;
    b.product = p;
    b.querySelector('.pname').textContent = p.name;
    b.querySelector('.pmeta').textContent = `${p.sizeLabel} · $${p.price}`;
    b.setAttribute('aria-label', `${p.name}, ${p.category}, ${p.sizeLabel}, $${p.price}`);
    paintThumb(b.querySelector('canvas'), p);
  }

  // Lay out only the rows that intersect the viewport.
  function render() {
    const width = spacer.clientWidth; // the content box: results' padding excluded
    cols = Math.max(1, Math.floor((width + GAP) / (CARD_MIN_W + GAP)));
    const cardW = (width - GAP * (cols - 1)) / cols;
    const rows = Math.ceil(list.length / cols);
    spacer.style.height = `${rows * ROW_H}px`;
    const first = Math.max(0, Math.floor(results.scrollTop / ROW_H) - OVERSCAN);
    const last = Math.min(rows - 1, Math.ceil((results.scrollTop + results.clientHeight) / ROW_H) + OVERSCAN);
    const wanted = new Set();
    for (let r = first; r <= last; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (i >= list.length) break;
        wanted.add(i);
        let b = pool.get(i);
        if (!b) {
          b = card();
          // Insert before the next card in grid order, so DOM (and Tab) order matches what's on screen.
          let next = null;
          for (const [j, el] of pool) if (j > i && (!next || j < next.j)) next = { j, el };
          pool.set(i, b);
          spacer.insertBefore(b, next ? next.el : null);
        }
        b.style.transform = `translate(${c * (cardW + GAP)}px, ${r * ROW_H}px)`;
        b.style.width = `${cardW}px`;
        fill(b, list[i]);
      }
    }
    for (const [i, b] of pool) if (!wanted.has(i)) { b.remove(); pool.delete(i); }
  }

  function syncControls() {
    for (const b of $('bCats').children) b.setAttribute('aria-pressed', String(b.dataset.cat === state.category));
    const sizes = state.category === 'all' ? [] : sizeOptions(products, state.category);
    // An active size that isn't in the list still shows, so it can be seen and cleared.
    if (state.size && !sizes.some((o) => o.value === state.size)) sizes.push({ value: state.size, label: state.size });
    sizeSel.replaceChildren(new Option('Any size', ''), ...sizes.map((o) => new Option(o.label, o.value)));
    sizeSel.disabled = !sizes.length;
    sizeSel.value = state.size;
    sortSel.value = state.sort;
    query.value = state.query;
    price.value = String(state.maxPrice);
    roll(priceOut, state.maxPrice >= max ? 'Any' : `$${state.maxPrice}`);
  }

  function apply({ keepScroll = false } = {}) {
    syncControls();
    list = filterProducts(products, state);
    count.textContent = `${list.length} ${list.length === 1 ? 'product' : 'products'}`;
    for (const b of pool.values()) b.remove();
    pool.clear();
    if (!keepScroll) results.scrollTop = 0;
    onChange({ ...state, maxPrice: state.maxPrice >= max ? null : state.maxPrice });
    render();
  }

  query.addEventListener('input', () => { state.query = query.value; apply(); });
  sizeSel.addEventListener('change', () => { state.size = sizeSel.value; apply(); });
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; apply(); });
  price.addEventListener('input', () => { state.maxPrice = Number(price.value); apply(); });
  results.addEventListener('scroll', render, { passive: true });
  addEventListener('resize', () => { if (isOpen()) render(); });

  const isOpen = () => drawer.classList.contains('open');
  function setOpen(open) {
    drawer.classList.toggle('open', open);
    drawer.inert = !open;
    opener.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('browsing', open);
  }

  // Open the drawer; `filters` (from the assistant) replace the current ones, otherwise state is kept.
  // `keepPlace` (browser Back to the results) also keeps the scroll, as long as the filters are unchanged.
  function open(filters, { keepPlace = false } = {}) {
    const before = JSON.stringify(state);
    if (filters) {
      // A size implies its category (labels are unique per category), so the Size select can show it.
      const size = filters.size ?? '';
      const owner = size ? products.find((p) => p.sizeLabel === size || p.size === parseFloat(size))?.category : undefined;
      const category = filters.category && filters.category !== 'all' ? filters.category : (owner ?? 'all');
      const label = owner === category ? products.find((p) => p.category === category && (p.sizeLabel === size || p.size === parseFloat(size)))?.sizeLabel : '';
      Object.assign(state, {
        query: filters.query ?? '', category, size: label ?? '',
        maxPrice: filters.maxPrice ?? max, sort: filters.sort ?? 'featured',
      });
    }
    setOpen(true);
    apply({ keepScroll: !filters || (keepPlace && JSON.stringify(state) === before) });
    if (!filters) query.focus({ preventScroll: true });
  }

  function close({ restoreFocus = true } = {}) {
    if (!closable || !isOpen()) return;
    setOpen(false);
    onClose();
    if (restoreFocus) opener.focus({ preventScroll: true });
  }

  $('bClose').addEventListener('click', () => close());
  drawer.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !closable) return; // not closable: let Escape reach the page (closes a card)
    ev.stopPropagation();
    close();
  });
  $('bReset').addEventListener('click', () => {
    Object.assign(state, { query: '', category: 'all', size: '', maxPrice: max, sort: 'featured' });
    apply();
  });

  return { open, close, isOpen };
}
