// Keeps the cart across refreshes and visits in localStorage. Storage can be missing or full
// (private mode, blocked site data), so every access is guarded and the shop works without it.
const KEY = 'slab-cart-v1';
const MAX_ITEMS = 50;

// Only ids that still exist in the catalog, no duplicates, newest last.
export function loadCart(storage, isValid) {
  try {
    const ids = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === 'string' && isValid(id)))].slice(-MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

export function saveCart(storage, cart) {
  try { storage?.setItem(KEY, JSON.stringify(cart.slice(-MAX_ITEMS))); } catch { /* storage unavailable: cart lives for this visit only */ }
}
