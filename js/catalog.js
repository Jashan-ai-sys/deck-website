// The product catalog for the house brand SLAB: five hand-made hero decks plus a generated range of
// decks, wheels and trucks (about 300 products) so the browsing UI can be shown at catalog scale.
// Every product carries the dimensions and build details a skate shop lists (deck length, wheelbase,
// concave and finish; wheel hardness, shape and contact patch; truck height, weight and bushings), and
// those numbers stay inside real-world ranges so the 3D models and the assistant can rely on them.
// Pure data, deterministic, and shared by the browser, the assistant's server function and the tests.
import { rng, pick, shuffle } from './random.js';

export const BUILD = '7-ply Canadian maple';

export const CATEGORIES = [
  { id: 'decks', label: 'Decks', sizeName: 'Width' },
  { id: 'wheels', label: 'Wheels', sizeName: 'Diameter' },
  { id: 'trucks', label: 'Trucks', sizeName: 'Axle' },
];

// 8 reads as 8.0" in a spec sheet, but the size label stays 8" so the size filter matches either.
const inch = (n) => `${Number.isInteger(n) ? n.toFixed(1) : n}"`;

function deck({ id, name, price, blurb, featured, width, length, wheelbase, concave, finish, pattern, colors }) {
  return {
    id, category: 'decks', name, price, blurb, ...(featured && { featured }),
    pattern, colors, length, wheelbase, concave, finish,
    size: width, sizeLabel: `${width}"`,
    specs: [['Size', `${inch(width)} × ${inch(length)}`], ['Wheelbase', inch(wheelbase)], ['Concave', concave], ['Build', BUILD]],
  };
}

const HERO_DECKS = [
  {
    id: 'tide', name: 'TIDE', price: 64, width: 8.0, length: 31.75, wheelbase: 14, concave: 'Medium', finish: 'dipped', pattern: 'waves',
    blurb: 'Medium concave popsicle in 7-ply Canadian maple, dipped in a deep teal stain so the grain shows through the hand-cut wave print.',
    colors: { base: '#0f4c5c', ink: '#f1ece2', accent: '#3f8f93' },
  },
  {
    id: 'chalk', name: 'CHALK', price: 58, width: 8.25, length: 32, wheelbase: 14.25, concave: 'Mellow', finish: 'printed', pattern: 'grid',
    blurb: 'Mellow concave for flatground and ledges. Opaque bone-white screen print with a charcoal drafting grid.',
    colors: { base: '#ece7dc', ink: '#1c1c1c', accent: '#b9b3a7' },
  },
  {
    id: 'ember', name: 'EMBER', price: 66, width: 8.38, length: 32, wheelbase: 14.25, concave: 'Medium', finish: 'printed', pattern: 'sun',
    blurb: 'Medium concave on a slightly wider 8.38" shape. Full-coverage burnt-orange screen print with a low striped sun.',
    colors: { base: '#e0702a', ink: '#fbe7c6', accent: '#7a2414' },
  },
  {
    id: 'moss', name: 'MOSS', price: 62, width: 8.5, length: 32.25, wheelbase: 14.38, concave: 'Mellow', finish: 'dipped', pattern: 'topo',
    blurb: 'Mellow concave and 8.5" wide for bowls and transition. Dipped in an olive stain, with a contour-map print over the grain.',
    colors: { base: '#59612f', ink: '#efe6cf', accent: '#8e955a' },
  },
  {
    id: 'nightshift', name: 'NIGHTSHIFT', price: 70, width: 8.25, length: 32, wheelbase: 14, concave: 'Steep', finish: 'printed', pattern: 'stars',
    blurb: 'Steep concave with tight, poppy kicks for flip tricks. Ink-navy screen print with a scatter of brass stars.',
    colors: { base: '#16213d', ink: '#f4d58d', accent: '#2b3a66' },
  },
].map((d) => deck({ ...d, featured: true }));

// dip: the colour works as a translucent stain over maple; pale ones only read as an opaque print.
const DECK_PALETTES = [
  ['teal', true, '#0f4c5c', '#f1ece2', '#3f8f93'], ['bone white', false, '#ece7dc', '#1c1c1c', '#b9b3a7'],
  ['rust', true, '#b5532c', '#fbe7c6', '#6e2512'], ['olive', true, '#59612f', '#efe6cf', '#8e955a'],
  ['navy', true, '#16213d', '#f4d58d', '#2b3a66'], ['plum', true, '#4a2440', '#f3d9e6', '#7d4a6c'],
  ['sand', false, '#d9c29a', '#2b2118', '#b39a70'], ['forest green', true, '#1f3d2b', '#e8e0c4', '#3f6b4f'],
  ['brick red', true, '#8c3b2e', '#f6e3cf', '#c0705a'], ['slate gray', true, '#3d4650', '#e9edf0', '#6c7a87'],
  ['mustard', true, '#d39b2a', '#231a0c', '#a97412'], ['sky blue', true, '#7fb3cf', '#10283a', '#4f87a6'],
].map(([name, dip, base, ink, accent]) => ({ name, dip, colors: { base, ink, accent } }));
// Natural decks are raw maple; only the small stamp carries colour.
const STAMP_PALETTES = [
  ['black', '#d8b98a', '#1c1c1c', '#b8946a'], ['red', '#dcbd8f', '#a3291c', '#bb966b'], ['navy', '#d4b484', '#16213d', '#b08d62'],
].map(([name, base, ink, accent]) => ({ name, colors: { base, ink, accent } }));

const PATTERN_PRINTS = {
  waves: 'wave print', grid: 'drafting-grid print', sun: 'striped sun print', topo: 'contour-map print', stars: 'star print',
  stripes: 'bold stripe print', checker: 'checkerboard print', type: 'stacked SLAB letter print', blocks: 'color-block print',
};
const CONCAVE_NOTES = {
  Mellow: 'Mellow concave for a flat, stable stance.',
  Medium: 'Medium concave that locks your feet in without fighting you.',
  Steep: 'Steep concave and tight kicks for quick flip tricks.',
};
const DECK_ADJ = ['LOW', 'HIGH', 'DUSK', 'IRON', 'SOFT', 'WILD', 'SALT', 'RUST', 'NEON', 'QUIET', 'STONE', 'DRIFT', 'SUN', 'COLD', 'RED'];
const DECK_NOUN = ['LINE', 'CURB', 'LEDGE', 'RAIL', 'BOWL', 'GAP', 'DROP', 'PARK', 'BANK', 'STAIR', 'WAVE', 'PIER'];
// [width, lengths, wheelbases]: real popsicle shapes grow longer and wider-stanced with width.
const DECK_SHAPES = [
  [7.75, [31.5], [13.75, 14]], [8.0, [31.75, 32], [14]], [8.125, [31.75, 32], [14, 14.12]],
  [8.25, [32, 32.25], [14, 14.25]], [8.38, [32, 32.25], [14.25]], [8.5, [32.25, 32.5], [14.25, 14.38]],
  [8.75, [32.5, 32.75, 33], [14.38, 14.5]],
];

const pad = (n) => String(n).padStart(3, '0');
const evenPrice = (rand, min, steps) => min + 2 * Math.floor(rand() * steps);

function deckBlurb(finish, concave, palette, pattern) {
  if (finish === 'natural') return `${CONCAVE_NOTES[concave]} Clear-coated natural maple with just a small ${palette.name} SLAB stamp, so the grain is the graphic.`;
  if (finish === 'dipped') return `${CONCAVE_NOTES[concave]} Dipped in a ${palette.name} stain so the maple grain shows through the ${PATTERN_PRINTS[pattern]}.`;
  return `${CONCAVE_NOTES[concave]} Opaque ${palette.name} screen print with a ${PATTERN_PRINTS[pattern]}, clear-coated.`;
}

function genDecks(rand, count) {
  const names = shuffle(rand, DECK_ADJ.flatMap((a) => DECK_NOUN.map((n) => `${a} ${n}`))).slice(0, count);
  const printPatterns = Object.keys(PATTERN_PRINTS);
  return names.map((name, k) => {
    const [width, lengths, wheelbases] = pick(rand, DECK_SHAPES);
    const roll = rand();
    const finish = roll < 0.08 ? 'natural' : roll < 0.56 ? 'dipped' : 'printed';
    const concave = pick(rand, ['Mellow', 'Medium', 'Medium', 'Medium', 'Steep', 'Steep']);
    // Cycling the print patterns spreads them evenly; a natural deck only ever carries the stamp.
    const pattern = finish === 'natural' ? 'stamp' : printPatterns[k % printPatterns.length];
    const palette = finish === 'natural' ? pick(rand, STAMP_PALETTES)
      : pick(rand, DECK_PALETTES.filter((p) => finish === 'printed' || p.dip));
    // Natural decks skip the ink, dipped decks take an extra step; wider stock costs a little more.
    const base = { natural: 52, printed: 56, dipped: 60 }[finish] + (width >= 8.5 ? 2 : 0);
    return deck({
      id: `deck-${pad(k + 1)}`, name, price: evenPrice(rand, base, finish === 'natural' ? 3 : 6),
      blurb: deckBlurb(finish, concave, palette, pattern),
      width, length: pick(rand, lengths), wheelbase: pick(rand, wheelbases), concave, finish, pattern, colors: palette.colors,
    });
  });
}

// [name, urethane, sidewall print, how a shop would describe the colour]
const WHEEL_COLORS = [
  ['BONE', '#efe8d8', '#c4361b', 'bone white'], ['OXIDE', '#b5532c', '#f4f1ea', 'oxide red'], ['SKY', '#9cc3d8', '#1c2b3a', 'sky blue'],
  ['MINT', '#a8d5b9', '#1f3d2b', 'mint'], ['INK', '#23272e', '#f4f1ea', 'black'], ['SUN', '#f2c14e', '#23272e', 'yellow'],
  ['ROSE', '#e3a0a8', '#4a2440', 'rose'], ['LIME', '#c4dd63', '#23272e', 'lime'],
];
// Each use only comes in the diameters, hardnesses and shapes riders actually buy for it.
const WHEEL_USES = {
  Street: { label: 'street', sizes: [50, 52, 53, 54], duros: [99, 101], shapes: ['Conical', 'Classic'], price: [30, 5], note: 'Hard enough to slide ledges and lock into grinds.' },
  Park: { label: 'park', sizes: [52, 53, 54, 56], duros: [99, 101], shapes: ['Conical', 'Classic'], price: [32, 5], note: 'Keeps its speed on smooth concrete and wood ramps.' },
  Bowl: { label: 'bowl', sizes: [54, 56, 58], duros: [97, 99], shapes: ['Radial'], price: [34, 5], note: 'The wide riding surface holds a line through carves and pool coping.' },
  Cruise: { label: 'cruiser', sizes: [54, 56, 58, 60], duros: [78, 83, 87], shapes: ['Cruiser'], price: [38, 7], note: 'Soft enough to roll quietly over cracks and pebbles.' },
  Film: { label: 'filming', sizes: [56, 58, 60], duros: [78, 83], shapes: ['Cruiser'], price: [40, 6], note: 'Soft and quiet for smooth follow-cam footage.' },
};
// Contact patch grows with the profile (narrow classic to wide cruiser) and with diameter.
const CONTACT_BASE = { Classic: 18, Conical: 25, Radial: 28, Cruiser: 31 };

function genWheels(rand, count) {
  const combos = shuffle(rand, Object.entries(WHEEL_USES).flatMap(([use, u]) => u.sizes.flatMap((s) => WHEEL_COLORS.map((c) => [use, s, c])))).slice(0, count);
  return combos.map(([use, size, [colorName, color, print, colorDesc]], k) => {
    const u = WHEEL_USES[use];
    const durometer = pick(rand, u.duros);
    const shape = pick(rand, u.shapes);
    const contact = Math.min(36, Math.round(CONTACT_BASE[shape] + (size - 50) * 0.4 + rand() * 2));
    return {
      id: `wheel-${pad(k + 1)}`, category: 'wheels', name: `${use.toUpperCase()} ${size} ${colorName}`,
      price: evenPrice(rand, ...u.price),
      blurb: `${size} mm ${shape === 'Cruiser' ? '' : `${shape.toLowerCase()} `}${u.label} wheels in ${colorDesc} ${durometer}A urethane, ${contact} mm contact patch. ${u.note} Set of four.`,
      color, core: rand() < 0.5 ? '#f4f1ea' : '#2a2d33', print,
      durometer, shape, contact, use,
      size, sizeLabel: `${size} mm`,
      specs: [['Diameter', `${size} mm`], ['Hardness', `${durometer}A`], ['Shape', `${shape}, ${contact} mm contact`], ['Set', 'Four wheels']],
    };
  });
}

const TRUCK_HEIGHTS = [['LOW', 'Low', 49], ['MID', 'Mid', 52], ['HIGH', 'High', 55]];
const TRUCK_AXLES = [[129, '7.5"–7.75"'], [139, '7.75"–8.0"'], [144, '8.0"–8.25"'], [149, '8.25"–8.5"'], [159, '8.5"–9.0"']];
const TRUCK_FINISHES = [
  ['RAW', '#b9bcc0', 'Raw aluminum'], ['BLACK', '#26282c', 'Satin black'], ['GOLD', '#c9a24a', 'Satin gold'],
  ['COPPER', '#b87347', 'Satin copper'], ['WHITE', '#e8e6e1', 'Satin white'],
];
// Bushings are colour-coded by hardness, softest first.
const BUSHINGS = { 88: '#e2b23a', 90: '#f0ece4', 92: '#c4361b', 94: '#3a6fc4', 96: '#23272e' };

function genTrucks(rand, count) {
  const combos = shuffle(rand, TRUCK_HEIGHTS.flatMap((h) => TRUCK_AXLES.flatMap((a) => TRUCK_FINISHES.map((f) => [h, a, f])))).slice(0, count);
  return combos.map(([[heightName, height, heightMm], [width, fits], [finishCode, finish, finishName]], k) => {
    const hollow = rand() < 0.35;
    const bushingDuro = pick(rand, [88, 90, 90, 92, 92, 92, 94, 96]);
    // Wider and taller hangers carry more metal; a hollow kingpin and axle save about 14 g.
    const weight = 344 + TRUCK_AXLES.findIndex(([w]) => w === width) * 6 + (heightMm - 49) / 3 * 4 + Math.floor(rand() * 4) - (hollow ? 14 : 0);
    const painted = finishCode !== 'RAW';
    return {
      id: `truck-${pad(k + 1)}`, category: 'trucks', name: `${heightName} ${width} ${finishCode}`,
      price: 44 + (painted ? 4 : 0) + (hollow ? 10 : 0) + evenPrice(rand, 0, 7),
      blurb: `${height} trucks, ${heightMm} mm tall, with a ${width} mm axle for ${fits} decks. ${finishName} cast hanger, ${bushingDuro}A cone and barrel bushings${hollow ? ', hollow kingpin and axle' : ''}. Sold as a pair.`,
      finish, finishName, bushing: BUSHINGS[bushingDuro], bushingDuro,
      height, heightMm, hollow, weight, fits,
      size: width, sizeLabel: `${width} mm`,
      specs: [['Axle', `${width} mm, fits ${fits}`], ['Height', `${height}, ${heightMm} mm`], ['Weight', `${weight} g each`], ['Bushings', `${bushingDuro}A`]],
    };
  });
}

const rand = rng(2026);
const wheels = genWheels(rand, 80);
const trucks = genTrucks(rand, 60);
// The first few of each generated range hang in the 3D rooms.
for (const p of [...wheels.slice(0, 8), ...trucks.slice(0, 6)]) p.featured = true;

export const PRODUCTS = [...HERO_DECKS, ...genDecks(rand, 160), ...wheels, ...trucks];
export const productById = new Map(PRODUCTS.map((p) => [p.id, p]));
export const featured = (category) => PRODUCTS.filter((p) => p.featured && p.category === category);
