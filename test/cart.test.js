import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, removeItem, cartTotal, row, boardLines, thankYouLines, orderNumber, BOARD_WIDTH } from '../js/cart.js';
import { createFlaps, setTarget, tick, active } from '../js/flaps.js';
import { PRODUCTS, featured } from '../js/catalog.js';

const DECKS = featured('decks');

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('addItem ignores duplicates and never mutates', () => {
  const a = [];
  const b = addItem(a, 'tide');
  assert.deepEqual(a, []);
  assert.deepEqual(b, ['tide']);
  assert.equal(addItem(b, 'tide'), b);
});

test('removeItem drops only that deck', () => {
  assert.deepEqual(removeItem(['tide', 'moss'], 'tide'), ['moss']);
  assert.deepEqual(removeItem([], 'tide'), []);
});

test('cartTotal sums prices and skips unknown ids', () => {
  assert.equal(cartTotal([], DECKS), 0);
  assert.equal(cartTotal(['tide', 'nightshift'], DECKS), 64 + 70);
  assert.equal(cartTotal(['tide', 'ghost'], DECKS), 64);
});

test('row is always exactly the board width', () => {
  assert.equal(row('TIDE', '$64', 16), 'TIDE         $64');
  assert.equal(row('A VERY LONG DECK NAME', '$70').length, BOARD_WIDTH);
  assert.ok(row('A VERY LONG DECK NAME', '$70').endsWith(' $70'));
  assert.equal(row('', ''), ' '.repeat(BOARD_WIDTH));
  assert.equal(row('X', '$'.repeat(40)), '$'.repeat(BOARD_WIDTH));
});

test('boardLines: empty cart prompts, full cart lists every deck with a total', () => {
  const empty = boardLines([], DECKS);
  assert.equal(empty.length, 6);
  assert.equal(empty[0], 'CART IS EMPTY');
  assert.equal(empty[5], row('TOTAL', '$0'));

  const all = boardLines(DECKS.map((d) => d.id), DECKS);
  assert.equal(all.length, 6);
  assert.equal(all[4], row('NIGHTSHIFT', '$70'));
  assert.equal(all[5], row('TOTAL', `$${DECKS.reduce((s, d) => s + d.price, 0)}`));
  assert.ok(all.every((l) => l.length <= BOARD_WIDTH));

  const many = PRODUCTS.slice(0, 8).map((p) => p.id);
  const overflow = boardLines(many, PRODUCTS);
  assert.equal(overflow[3], row(PRODUCTS[3].name, `$${PRODUCTS[3].price}`));
  assert.equal(overflow[4], '+4 MORE'); // 8 items: four listed, four more
  assert.equal(overflow[5], row('TOTAL', `$${cartTotal(many, PRODUCTS)}`));
});

test('thankYouLines and orderNumber', () => {
  const lines = thankYouLines('SL-1234', 134);
  assert.equal(lines.length, 6);
  assert.equal(lines[1], 'ORDER SL-1234');
  assert.equal(lines[5], row('PAID (DEMO)', '$134'));
  assert.equal(orderNumber(() => 0), 'SL-1000');
  assert.equal(orderNumber(() => 0.9999), 'SL-9999');
});

test('flaps settle on the target and leave unchanged cells alone', () => {
  const f = createFlaps(2, 4);
  setTarget(f, ['AB', ''], seq(0.5));
  assert.equal(f.left[2], 0); // a space that was already a space does not flip
  let guard = 0;
  while (active(f) && guard++ < 50) tick(f, seq(0.1, 0.7, 0.3));
  assert.deepEqual(f.shown, ['A', 'B', ' ', ' ', ' ', ' ', ' ', ' ']);

  setTarget(f, ['AC', 'z'], seq(0));
  assert.equal(f.left[0], 0);        // 'A' stays put
  assert.ok(f.left[1] > 0);          // 'B' → 'C' flips
  while (active(f)) tick(f, seq(0.2));
  assert.equal(f.shown.join(''), 'AC  Z   ');
});

test('flaps cascade: later rows wait, and tick reports exactly the cells that changed', () => {
  const f = createFlaps(2, 4);
  setTarget(f, ['A', 'B'], seq(0));
  assert.deepEqual([f.delay[0], f.delay[4]], [0, 2]);
  assert.deepEqual(tick(f, seq(0)), [0]);     // row 0 starts at once, row 1 is still waiting
  tick(f, seq(0));
  assert.deepEqual(tick(f, seq(0)), [4]);     // row 1 starts after its two-tick delay
  assert.equal(f.shown[0], 'A');
});
