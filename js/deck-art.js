// Deck artwork drawn on a 2D canvas: the maple ground for each finish, ten print patterns and a modest
// logo. No three.js, so the Browse thumbnails and the 2D lite store can use it even when the 3D engine
// can't load. The canvas top is the nose, the bottom is the tail.
import { rng, hash } from './random.js';

const MAPLE = '#e4caa0'; // pale hard-rock maple, the bottom veneer under every finish

// Long fibrous streaks running nose to tail, plus a couple of faint cathedral arches where the rotary
// cut crosses the growth rings. Paths only, so it stays cheap even at thumbnail size.
function mapleGrain(ctx, w, h, wood, rand) {
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, w, h);
  const tone = ctx.createLinearGradient(0, 0, w, 0); // veneers are a touch darker toward one edge
  tone.addColorStop(0, 'rgba(120,80,40,0.08)');
  tone.addColorStop(0.5, 'rgba(120,80,40,0)');
  tone.addColorStop(1, 'rgba(120,80,40,0.05)');
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, w, h);

  ctx.lineCap = 'round';
  for (let i = 0; i < 220; i++) {
    const x0 = rand() * w, amp = 2 + rand() * 6, freq = 1 + rand() * 2.5, phase = rand() * 6.3;
    ctx.strokeStyle = `rgba(${110 + rand() * 40 | 0},${70 + rand() * 30 | 0},35,${0.04 + rand() * 0.12})`;
    ctx.lineWidth = 0.4 + rand() * rand() * 2.6;
    const y0 = rand() * h * 0.3 - h * 0.1, y1 = y0 + h * (0.5 + rand() * 0.8);
    ctx.beginPath();
    for (let s = 0; s <= 24; s++) {
      const y = y0 + ((y1 - y0) * s) / 24;
      const x = x0 + Math.sin((y / h) * freq * Math.PI * 2 + phase) * amp;
      if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  for (let c = 0; c < 2; c++) {
    const cx = w * (0.25 + rand() * 0.5), apex = h * (0.15 + c * 0.42 + rand() * 0.1);
    for (let k = 0; k < 9; k++) {
      const spread = 14 + k * 13, len = 260 + k * 55;
      ctx.strokeStyle = `rgba(125,80,38,${0.05 + rand() * 0.06})`;
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(cx - spread, apex + len);
      ctx.bezierCurveTo(cx - spread, apex + len * 0.3, cx - spread * 0.2, apex + k * 6, cx, apex + k * 6);
      ctx.bezierCurveTo(cx + spread * 0.2, apex + k * 6, cx + spread, apex + len * 0.3, cx + spread, apex + len);
      ctx.stroke();
    }
  }
}

// The ground under the print: opaque ink, a translucent stain over the grain, or bare clear-coated maple.
function ground(ctx, w, h, deck, rand) {
  const finish = deck.finish ?? 'printed';
  if (finish === 'printed') {
    ctx.fillStyle = deck.colors.base;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  mapleGrain(ctx, w, h, finish === 'natural' ? deck.colors.base : MAPLE, rand);
  if (finish === 'dipped') {
    // Multiply keeps the grain's light and dark streaks, the way a real stain soaks into the veneer.
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = deck.colors.base;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
}

const vertical = (ctx, x, y, draw) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  draw();
  ctx.restore();
};

// A small rubber-stamp mark: ringed SLAB, slightly uneven ink.
function stamp(ctx, w, h, c, rand) {
  const cx = w / 2, cy = h * 0.5;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = c.ink;
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, 92, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '400 54px "Saira Stencil One", Impact, sans-serif';
  ctx.fillText('SLAB', cx, cy - 4);
  ctx.font = '700 13px "Space Grotesk", sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText('DECK WORKS', cx, cy + 38);
  ctx.fillText('EST. 2026', cx, cy - 46);
  ctx.letterSpacing = '0px';
  // Patchy ink: knock specks of wood colour back over the mark.
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = c.base;
  for (let i = 0; i < 120; i++) {
    const a = rand() * Math.PI * 2, r = rand() * 96;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.8 + rand() * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

const PATTERNS = {
  waves(ctx, w, h, c) {
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 7;
    for (let y = -60; y < h + 60; y += 48) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin((x / w) * Math.PI * 3 + y * 0.015) * 20;
        if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
  },
  grid(ctx, w, h, c) {
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2;
    for (let x = 16; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 16; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = c.ink;
    ctx.fillRect(0, h * 0.62, w, 26);
    ctx.fillRect(0, h * 0.62 + 44, w, 8);
  },
  sun(ctx, w, h, c, rand, deck) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, c.base);
    sky.addColorStop(1, c.accent);
    ctx.save();
    if (deck.finish === 'dipped') ctx.globalAlpha = 0.55; // the fade is a stain too, grain still shows
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // The stripes are cut out of the sun, so whatever is underneath (print or grain) shows through.
    const cy = h * 0.44, r = w * 0.38;
    ctx.save();
    ctx.beginPath(); ctx.arc(w / 2, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    for (let i = 0, y = cy + 10; y < cy + r; i++, y += 30) ctx.rect(0, y, w, 4 + i * 3);
    ctx.fillStyle = c.ink;
    ctx.fill('evenodd');
    ctx.restore();
  },
  topo(ctx, w, h, c, rand) {
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 3;
    for (const [cx, cy] of [[w * 0.35, h * 0.3], [w * 0.65, h * 0.72]]) {
      const p1 = rand() * 6, p2 = rand() * 6;
      for (let k = 1; k <= 16; k++) {
        ctx.beginPath();
        for (let s = 0; s <= 72; s++) {
          const a = (s / 72) * Math.PI * 2;
          const rr = k * 24 * (1 + 0.18 * Math.sin(a * 3 + k * 0.35 + p1) + 0.07 * Math.sin(a * 5 + p2));
          const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a) * 1.7;
          if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
  },
  stars(ctx, w, h, c, rand) {
    ctx.fillStyle = c.ink;
    for (let i = 0; i < 280; i++) {
      ctx.globalAlpha = 0.35 + rand() * 0.65;
      ctx.beginPath(); ctx.arc(rand() * w, rand() * h, 0.6 + rand() * 2.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // A crescent: the moon disc minus an offset disc, clipped so the ground shows in the bite.
    ctx.save();
    ctx.beginPath(); ctx.arc(w / 2, h * 0.3, 120, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(w / 2 + 52, h * 0.3 - 34, 112, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.restore();
  },
  stripes(ctx, w, h, c) {
    // Racing stripes down the deck, both ends cut on a slant, stopping short of the tail logo.
    const bands = [[0.18, 0.2, c.ink], [0.42, 0.08, c.accent], [0.54, 0.08, c.accent], [0.66, 0.2, c.ink]];
    for (const [x, bw, color] of bands) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x * w, h * 0.16 + x * 160);
      ctx.lineTo((x + bw) * w, h * 0.16 + (x + bw) * 160);
      ctx.lineTo((x + bw) * w, h * 0.74 + (x + bw) * 160);
      ctx.lineTo(x * w, h * 0.74 + x * 160);
      ctx.fill();
    }
  },
  checker(ctx, w, h, c) {
    // A one-inch checker band through the middle, the rest left to the ground.
    const s = w / 8, top = h * 0.3, rows = 13;
    ctx.fillStyle = c.ink;
    for (let r = 0; r < rows; r++) {
      for (let k = r % 2; k < 8; k += 2) ctx.fillRect(k * s, top + r * s, s, s);
    }
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, top - 18, w, 8);
    ctx.fillRect(0, top + rows * s + 10, w, 8);
  },
  type(ctx, w, h, c, rand, deck) {
    // The model name stacked along the deck, alternating solid and outline.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 120px "Space Grotesk", sans-serif';
    ctx.lineWidth = 3;
    const name = deck.name.split(' ')[0];
    for (let i = 0; i < 4; i++) {
      vertical(ctx, w * (0.2 + i * 0.2), h * 0.42, () => {
        if (i % 2) { ctx.strokeStyle = c.accent; ctx.strokeText(name, 0, 0); } else { ctx.fillStyle = c.accent; ctx.fillText(name, 0, 0); }
      });
    }
  },
  blocks(ctx, w, h, c, rand) {
    // Seeded colour blocks: two slabs, a disc and a bar.
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, h * (0.12 + rand() * 0.06), w * 0.62, h * 0.22);
    ctx.fillStyle = c.ink;
    ctx.fillRect(w * 0.38, h * (0.42 + rand() * 0.04), w * 0.62, h * 0.16);
    ctx.beginPath(); ctx.arc(w * (0.3 + rand() * 0.4), h * 0.66, w * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.fillRect(w * 0.12, h * 0.36, w * 0.06, h * 0.4);
  },
};

// A modest logo near the tail, the way a shop deck carries it, and the model name in small caps.
function logo(ctx, w, h, deck) {
  ctx.fillStyle = deck.colors.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '400 84px "Saira Stencil One", Impact, sans-serif';
  ctx.fillText('SLAB', w / 2, h * 0.865);
  ctx.font = '700 22px "Space Grotesk", sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText(deck.name, w / 2, h * 0.865 + 64);
  ctx.letterSpacing = '0px';
}

// The deck's art in its native 512×2048 space; thumbnails scale the context down before calling this.
export function drawDeckArt(ctx, deck, rand = rng(hash(deck.id))) {
  const w = 512, h = 2048;
  ground(ctx, w, h, deck, rand);
  if (deck.finish === 'natural' || deck.pattern === 'stamp') {
    stamp(ctx, w, h, deck.colors, rand);
    return;
  }
  (PATTERNS[deck.pattern] ?? PATTERNS.waves)(ctx, w, h, deck.colors, rand, deck);
  logo(ctx, w, h, deck);
}
