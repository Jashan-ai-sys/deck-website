const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export const reducedMotion = () => reduce.matches;

export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  // Falls in under gravity, lands at t = 0.7, then one small hop (dips below 1 = above the landing spot).
  land: (t) => (t < 0.7 ? (t / 0.7) ** 2 : 1 - 0.12 * Math.sin((Math.PI * (t - 0.7)) / 0.3)),
};

export const wait = (ms) => animate(ms, () => {});

// Calls step(t) with t going 0 → 1 over `ms`, resolving when done. Instant under reduced motion.
export function animate(ms, step) {
  return new Promise((resolve) => {
    if (ms <= 0 || reduce.matches) { step(1); resolve(); return; }
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / ms);
      step(t);
      if (t < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}
