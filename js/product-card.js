// The product details card (shared by the 3D store and the 2D lite store) and product sharing.
import { PRODUCTS, CATEGORIES } from './catalog.js';
import { formatRoute } from './router.js';
import { roll, morph } from './micro.js';

const $ = (id) => document.getElementById(id);
const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
const pad = (k) => String(k).padStart(2, '0');

export function fillCard(p, { inCart, backLabel }) {
  const card = $('card');
  const inCategory = PRODUCTS.filter((q) => q.category === p.category);
  const label = CATEGORIES.find((c) => c.id === p.category).label;
  $('cardIndex').textContent = `${label} · ${pad(inCategory.indexOf(p) + 1)} / ${pad(inCategory.length)}`;
  $('cardName').textContent = p.name;
  $('cardBlurb').textContent = p.blurb;
  $('cardSpecs').replaceChildren(...p.specs.flatMap(([k, v]) => [el('dt', k), el('dd', v)]));
  roll($('cardPrice'), `$${p.price}`);
  morph($('cardAdd'), inCart ? 'Remove from cart' : 'Add to cart');
  $('cardBack').textContent = backLabel;
  card.dataset.product = p.id;
  // Stagger order for the flip-in: each detail line flips up after the one above (a spec's dt and dd together).
  let step = 0;
  for (const node of card.querySelectorAll('.flip, dt, dd')) {
    node.classList.add('flip');
    node.style.setProperty('--i', node.tagName === 'DD' ? step - 1 : step++);
  }
}

export const productUrl = (p) => `${location.origin}${location.pathname}${formatRoute({ view: 'product', id: p.id })}`;

// Native share sheet where there is one (phones), otherwise copy the link. Returns a status message.
export async function shareProduct(p) {
  const url = productUrl(p);
  try {
    if (navigator.share) {
      await navigator.share({ title: `${p.name} · SLAB Deck Works`, text: p.blurb, url });
      return '';
    }
    await navigator.clipboard.writeText(url);
    return 'Link copied';
  } catch (err) {
    return err?.name === 'AbortError' ? '' : 'Could not share. Copy the address bar instead.';
  }
}
