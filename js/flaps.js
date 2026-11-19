// Split-flap display state: each cell waits its turn (row by row, left to right), then spins through
// random characters before landing on its target. Pure logic, so it is unit-tested; board.js draws it.

export const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#-.()';

export function createFlaps(rows, cols) {
  const n = rows * cols;
  return {
    rows, cols,
    shown: Array(n).fill(' '), target: Array(n).fill(' '),
    left: Array(n).fill(0),  // flips still to do
    delay: Array(n).fill(0), // ticks to wait before the first flip (the cascade)
  };
}

// Point every cell at its new character. Cells that already show it stay still.
export function setTarget(state, lines, rand) {
  for (let r = 0; r < state.rows; r++) {
    const text = String(lines[r] ?? '').toUpperCase().padEnd(state.cols).slice(0, state.cols);
    for (let c = 0; c < state.cols; c++) {
      const i = r * state.cols + c;
      const changes = state.shown[i] !== text[c];
      state.target[i] = text[c];
      state.left[i] = changes ? 2 + Math.floor(rand() * 4) : 0;
      state.delay[i] = changes ? r * 2 + Math.floor(c / 4) : 0;
    }
  }
}

export const active = (state) => state.left.some((n) => n > 0);

// Advance one flip. Returns the indices whose character changed on this tick.
export function tick(state, rand) {
  const changed = [];
  for (let i = 0; i < state.left.length; i++) {
    if (!state.left[i]) continue;
    if (state.delay[i]) { state.delay[i]--; continue; }
    state.left[i]--;
    state.shown[i] = state.left[i] ? CHARSET[1 + Math.floor(rand() * (CHARSET.length - 1))] : state.target[i];
    changed.push(i);
  }
  return changed;
}
