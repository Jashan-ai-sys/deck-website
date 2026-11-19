// Pure cart logic and split-flap board text. No DOM, no three.js, so it runs under `node --test`.

export const BOARD_WIDTH = 20;
export const ITEM_ROWS = 5;

export const addItem = (cart, id) => (cart.includes(id) ? cart : [...cart, id]);
export const removeItem = (cart, id) => cart.filter((x) => x !== id);
export const hasItem = (cart, id) => cart.includes(id);

export const cartTotal = (cart, catalog) =>
  cart.reduce((sum, id) => sum + (catalog.find((d) => d.id === id)?.price ?? 0), 0);

// Left text, right text, padded to exactly `width` characters. The right side wins when space runs out.
export function row(left, right, width = BOARD_WIDTH) {
  const r = String(right).slice(0, width);
  const l = String(left).slice(0, Math.max(0, width - r.length - 1));
  return (l + ' '.repeat(Math.max(0, width - l.length - r.length)) + r).slice(0, width);
}

const pad = (lines) => [...lines, ...Array(ITEM_ROWS).fill('')].slice(0, ITEM_ROWS);

// Five item rows plus a total row. Bigger carts show the first four and a "+N MORE" row.
export function boardLines(cart, catalog, width = BOARD_WIDTH) {
  const lines = cart.map((id) => catalog.find((d) => d.id === id)).filter(Boolean).map((d) => row(d.name, `$${d.price}`, width));
  const items = !lines.length ? ['CART IS EMPTY', 'PICK SOMETHING']
    : lines.length > ITEM_ROWS ? [...lines.slice(0, ITEM_ROWS - 1), `+${lines.length - ITEM_ROWS + 1} MORE`]
      : lines;
  return [...pad(items), row('TOTAL', `$${cartTotal(cart, catalog)}`, width)];
}

export const thankYouLines = (orderId, amount, width = BOARD_WIDTH) => [
  ...pad(['THANK YOU', `ORDER ${orderId}`, 'SHIPS IN 48H']),
  row('PAID (DEMO)', `$${amount}`, width),
];

export const orderNumber = (rand) => `SL-${1000 + Math.floor(rand() * 9000)}`;
