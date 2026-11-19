// Hash routes, so every view has a link, Back/Forward work, and products can be shared. Hash routing
// needs no server rewrites (works on Vercel, the dev server and file hosting alike). Pure: tested in Node.
//   #/decks  #/wheels  #/trucks     a room on the wall
//   #/p/<id>                        a product picked up
//   #/browse?q=&cat=&size=&max=&sort=   the Browse drawer with its filters
//   #/counter                       the counter

const ROOMS = ['decks', 'wheels', 'trucks'];
const SORTS = ['featured', 'price-asc', 'price-desc', 'name'];

export function parseRoute(hash) {
  const [path, query = ''] = String(hash ?? '').replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query);
  if (parts[0] === 'p' && parts[1]) return { view: 'product', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'counter') return { view: 'counter' };
  if (parts[0] === 'browse') {
    const max = Number(q.get('max'));
    return {
      view: 'browse',
      filters: {
        query: (q.get('q') ?? '').slice(0, 80),
        category: ROOMS.includes(q.get('cat')) ? q.get('cat') : 'all',
        size: (q.get('size') ?? '').slice(0, 12),
        maxPrice: q.has('max') && Number.isFinite(max) && max > 0 ? max : null,
        sort: SORTS.includes(q.get('sort')) ? q.get('sort') : 'featured',
      },
    };
  }
  return { view: 'room', room: ROOMS.includes(parts[0]) ? parts[0] : 'decks' };
}

export function formatRoute(route) {
  if (route.view === 'product') return `#/p/${encodeURIComponent(route.id)}`;
  if (route.view === 'counter') return '#/counter';
  if (route.view === 'browse') {
    const f = route.filters ?? {};
    const q = new URLSearchParams();
    if (f.query) q.set('q', f.query);
    if (f.category && f.category !== 'all') q.set('cat', f.category);
    if (f.size) q.set('size', f.size);
    if (Number.isFinite(f.maxPrice)) q.set('max', String(f.maxPrice));
    if (f.sort && f.sort !== 'featured') q.set('sort', f.sort);
    const s = q.toString();
    return `#/browse${s ? `?${s}` : ''}`;
  }
  return `#/${route.room ?? 'decks'}`;
}
