// Catalog search, filters and sort. Pure, so the Browse drawer and the assistant's search tool share it.

export const SORTS = {
  featured: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  name: 'Name',
};

const text = (p) => `${p.name} ${p.category} ${p.blurb} ${p.sizeLabel}`.toLowerCase();

// Size options for one category, smallest first, as {value, label} pairs.
export function sizeOptions(products, category) {
  const seen = new Map();
  for (const p of products) if (p.category === category) seen.set(p.sizeLabel, p.size);
  return [...seen].sort((a, b) => a[1] - b[1]).map(([label]) => ({ value: label, label }));
}

export function priceRange(products) {
  const prices = products.map((p) => p.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// Every query word must appear somewhere in the product's text ("8.5 deck teal" narrows, it doesn't widen).
export function filterProducts(products, { query = '', category = 'all', size = '', maxPrice = Infinity, sort = 'featured' } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const order = new Map(products.map((p, i) => [p.id, i]));
  const out = products.filter((p) =>
    (category === 'all' || p.category === category)
    && (!size || p.sizeLabel === size || parseFloat(size) === p.size) // "8.0\"", "8\"" and "8 inch" all match 8
    && p.price <= maxPrice
    && words.every((w) => text(p).includes(w)));
  const by = {
    featured: (a, b) => (b.featured === true) - (a.featured === true) || order.get(a.id) - order.get(b.id),
    'price-asc': (a, b) => a.price - b.price || a.name.localeCompare(b.name),
    'price-desc': (a, b) => b.price - a.price || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return out.sort(by[sort] ?? by.featured);
}
