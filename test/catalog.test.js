import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, productById, featured, CATEGORIES } from '../js/catalog.js';
import { filterProducts, sizeOptions, priceRange } from '../js/browse.js';
import { BOARD_WIDTH } from '../js/cart.js';

test('catalog: ~300 products, unique ids and names, every name fits the flip board', () => {
  assert.equal(PRODUCTS.length, 305);
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
  assert.equal(new Set(PRODUCTS.map((p) => p.name)).size, PRODUCTS.length);
  assert.ok(PRODUCTS.every((p) => p.name.length + 4 <= BOARD_WIDTH)); // name + " $NN"
  assert.ok(PRODUCTS.every((p) => CATEGORIES.some((c) => c.id === p.category)));
  assert.ok(PRODUCTS.every((p) => Number.isInteger(p.price) && p.price > 0 && p.specs.length === 4));
  assert.equal(productById.get('ember').price, 66);
});

test('catalog is deterministic and features a curated set per room', async () => {
  const again = await import(`../js/catalog.js?again=${Date.now()}`);
  assert.deepEqual(again.PRODUCTS.map((p) => p.name), PRODUCTS.map((p) => p.name));
  assert.deepEqual(featured('decks').map((p) => p.id), ['tide', 'chalk', 'ember', 'moss', 'nightshift']);
  assert.equal(featured('wheels').length, 8);
  assert.equal(featured('trucks').length, 6);
});

test('filterProducts: category, size, price and multi-word search all narrow', () => {
  const decks = filterProducts(PRODUCTS, { category: 'decks' });
  assert.equal(decks.length, 165);
  assert.ok(decks.slice(0, 5).every((p) => p.featured)); // featured first by default

  const wide = filterProducts(PRODUCTS, { category: 'decks', size: '8.5"', maxPrice: 60 });
  assert.ok(wide.length > 0 && wide.every((p) => p.sizeLabel === '8.5"' && p.price <= 60));

  assert.deepEqual(filterProducts(PRODUCTS, { query: 'EMBER' }).map((p) => p.id), ['ember']);
  // "8.0\"" (how people and the model write it) matches decks labelled 8"
  const eight = filterProducts(PRODUCTS, { category: 'decks', size: '8.0"' });
  assert.ok(eight.length > 0 && eight.every((p) => p.size === 8));
  assert.deepEqual(eight, filterProducts(PRODUCTS, { category: 'decks', size: '8"' }));
  const teal = filterProducts(PRODUCTS, { query: 'deck teal' });
  assert.ok(teal.length > 0 && teal.every((p) => p.category === 'decks'));
  assert.deepEqual(filterProducts(PRODUCTS, { query: 'zzz' }), []);
});

test('filterProducts sorting', () => {
  const asc = filterProducts(PRODUCTS, { category: 'wheels', sort: 'price-asc' }).map((p) => p.price);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const desc = filterProducts(PRODUCTS, { sort: 'price-desc' }).map((p) => p.price);
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  const byName = filterProducts(PRODUCTS, { category: 'trucks', sort: 'name' }).map((p) => p.name);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b)));
});

test('sizeOptions are numeric-sorted per category; priceRange spans the catalog', () => {
  assert.deepEqual(sizeOptions(PRODUCTS, 'wheels').map((o) => o.value), ['50 mm', '52 mm', '53 mm', '54 mm', '56 mm', '58 mm', '60 mm']);
  assert.equal(sizeOptions(PRODUCTS, 'decks')[0].value, '7.75"');
  const { min, max } = priceRange(PRODUCTS);
  assert.ok(min >= 28 && max <= 78 && min < max);
});
