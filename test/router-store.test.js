import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, formatRoute } from '../js/router.js';
import { loadCart, saveCart } from '../js/cart-store.js';

test('routes: rooms, products, counter, and anything unknown falls back to the decks room', () => {
  assert.deepEqual(parseRoute('#/wheels'), { view: 'room', room: 'wheels' });
  assert.deepEqual(parseRoute('#/p/ember'), { view: 'product', id: 'ember' });
  assert.deepEqual(parseRoute('#/counter'), { view: 'counter' });
  for (const h of ['', '#', '#/', '#/basement', undefined]) assert.deepEqual(parseRoute(h), { view: 'room', room: 'decks' });
});

test('browse routes round-trip their filters and reject junk', () => {
  const filters = { query: 'teal wave', category: 'decks', size: '8.5"', maxPrice: 60, sort: 'price-asc' };
  const hash = formatRoute({ view: 'browse', filters });
  assert.deepEqual(parseRoute(hash), { view: 'browse', filters });
  assert.equal(formatRoute({ view: 'browse', filters: { query: '', category: 'all', size: '', maxPrice: null, sort: 'featured' } }), '#/browse');
  assert.deepEqual(parseRoute('#/browse?cat=boats&max=-3&sort=chaos').filters, { query: '', category: 'all', size: '', maxPrice: null, sort: 'featured' });
});

test('every route formats back to itself', () => {
  for (const h of ['#/decks', '#/trucks', '#/p/wheel-012', '#/counter', '#/browse?q=sun']) assert.equal(formatRoute(parseRoute(h)), h);
});

// A tiny in-memory stand-in for localStorage.
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('cart store round-trips and drops ids the catalog no longer has', () => {
  const s = memory();
  saveCart(s, ['tide', 'ghost', 'moss']);
  assert.deepEqual(loadCart(s, (id) => id !== 'ghost'), ['tide', 'moss']);
});

test('cart store survives missing, corrupt or throwing storage', () => {
  assert.deepEqual(loadCart(undefined, () => true), []);
  const s = memory();
  s.setItem('slab-cart-v1', '{not json');
  assert.deepEqual(loadCart(s, () => true), []);
  s.setItem('slab-cart-v1', '{"a":1}');
  assert.deepEqual(loadCart(s, () => true), []);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadCart(broken, () => true), []);
  assert.doesNotThrow(() => saveCart(broken, ['tide']));
});
