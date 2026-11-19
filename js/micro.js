// Small interaction details shared by the 3D store and the lite store: rolling numbers, morphing
// button labels, a busy beat, a hold-to-confirm button and a sliding selection pill. DOM-only, no three.js.
const still = matchMedia('(prefers-reduced-motion: reduce)');
const SPRING = 'cubic-bezier(0.3, 1.4, 0.5, 1)';
const WIDTH_ANIM = 'morph-width';

// Sets a number-like text ("$66", "3"), rolling in only the characters that changed: up when the
// value grows, down when it shrinks.
export function roll(el, text) {
  text = String(text);
  const old = el.textContent;
  if (old === text) return;
  const num = (s) => Number(s.replace(/[^\d.]/g, ''));
  const dir = num(text) >= num(old) ? 1 : -1;
  el.replaceChildren(...[...text].map((ch, i) => {
    const span = document.createElement('span');
    span.className = 'roll-char';
    span.textContent = ch;
    // Compare from the right, so "$9" → "$10" keeps the units column aligned.
    const changed = old[old.length - text.length + i] !== ch;
    if (changed && !still.matches) {
      span.animate(
        [{ transform: `translateY(${dir * 80}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 340, delay: (text.length - 1 - i) * 35, easing: SPRING, fill: 'backwards' },
      );
    }
    return span;
  }));
}

// Changes a button's label with the old width easing to the new one and the text settling in.
// `apply` runs any other width-changing change (a busy spinner) after the old width is read, so it
// eases too. A morph that starts while another is running continues from the current width.
export function morph(btn, text, apply) {
  if (btn.textContent === text && !apply) return;
  const from = btn.offsetWidth;
  for (const anim of btn.getAnimations()) if (anim.id === WIDTH_ANIM) anim.cancel();
  apply?.();
  if (btn.textContent !== text) {
    const label = document.createElement('span');
    label.className = 'morph-label';
    label.textContent = text;
    btn.replaceChildren(label);
    if (!still.matches) {
      label.animate(
        [{ opacity: 0, transform: 'translateY(40%)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'none' }],
        { duration: 260, easing: 'ease-out' },
      );
    }
  }
  if (still.matches || !from) return;
  const to = btn.offsetWidth;
  if (to === from) return;
  btn.animate( // border-box, so the widths mean the same as offsetWidth on any element
    [{ width: `${from}px`, boxSizing: 'border-box' }, { width: `${to}px`, boxSizing: 'border-box' }],
    { id: WIDTH_ANIM, duration: 320, easing: SPRING },
  );
}

// Shows a short "working" label and spinner on a button, then restores it. The button stays
// focusable (aria-disabled, not `disabled`, which would drop keyboard focus to the page). Returns
// false, doing nothing, if the button is already busy, so a second Enter can't submit twice.
export async function busyBeat(btn, text, ms = 700) {
  if (btn.getAttribute('aria-busy') === 'true') return false;
  const was = btn.textContent;
  morph(btn, text, () => { btn.setAttribute('aria-busy', 'true'); btn.setAttribute('aria-disabled', 'true'); });
  await new Promise((resolve) => setTimeout(resolve, still.matches ? 0 : ms));
  morph(btn, was, () => { btn.removeAttribute('aria-busy'); btn.removeAttribute('aria-disabled'); });
  return true;
}

// After a keyboard confirm, a held Enter keeps auto-repeating, and each repeat would activate whatever
// took focus next (an Undo button), flipping the action back and forth. Swallow repeats until key-up.
function swallowKeyRepeat() {
  const block = (ev) => { if (ev.repeat) { ev.preventDefault(); ev.stopPropagation(); } };
  addEventListener('keydown', block, true);
  addEventListener('keyup', () => removeEventListener('keydown', block, true), { once: true, capture: true });
}

// A button that must be held (pointer) for `ms` before `onConfirm` runs; a fill sweeps across while
// held and letting go early, or sliding off, cancels. Keyboard activation confirms at once, so it
// stays accessible (Undo is the safety net there).
export function holdButton(btn, onConfirm, ms = 650) {
  let timer = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
    btn.classList.remove('holding');
  };
  btn.classList.add('hold');
  btn.style.setProperty('--hold-ms', `${ms}ms`);
  btn.addEventListener('pointerdown', (ev) => {
    if (ev.button || !ev.isPrimary) return; // a second finger must not start an orphaned timer
    btn.releasePointerCapture?.(ev.pointerId); // touch captures implicitly; release so sliding off cancels
    clearTimeout(timer);
    btn.classList.add('holding');
    timer = setTimeout(() => { cancel(); onConfirm(); }, ms);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, cancel);
  btn.addEventListener('contextmenu', (ev) => ev.preventDefault()); // long-press menu on phones
  btn.addEventListener('click', (ev) => { // keyboard / assistive tech: detail is 0
    if (ev.detail !== 0) return;
    onConfirm();
    swallowKeyRepeat();
  });
}

// A pill that slides behind whichever child of `nav` the `pick()` callback returns, stretching in the
// direction of travel (the leading edge moves first, the trailing edge catches up).
export function slidingPill(nav, pick) {
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.setAttribute('aria-hidden', 'true');
  nav.prepend(pill);
  let lastLeft = null;
  function place() {
    const target = pick();
    pill.style.opacity = target ? 1 : 0;
    for (const child of nav.children) child.classList.toggle('on-pill', child === target); // for its text colour
    if (!target || !nav.clientWidth) return; // hidden: the ResizeObserver places it once shown
    // `right` is against the padding box (clientWidth), not the scroll width: the phone nav scrolls.
    const left = target.offsetLeft, right = nav.clientWidth - left - target.offsetWidth;
    const forward = lastLeft === null || left >= lastLeft;
    pill.classList.toggle('back', !forward);
    if (lastLeft === null) pill.style.transition = 'none';
    pill.style.left = `${left}px`;
    pill.style.right = `${right}px`;
    if (lastLeft === null) requestAnimationFrame(() => { pill.style.transition = ''; });
    lastLeft = left;
  }
  new MutationObserver(place).observe(nav, { attributes: true, subtree: true, attributeFilter: ['aria-current', 'aria-expanded'] });
  new ResizeObserver(place).observe(nav);
  document.fonts?.ready.then(place);
  place();
}
