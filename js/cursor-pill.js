// A small pill that follows the mouse over something clickable and says what the click will do
// ("Look closer", "Check out"). A hint only: the real pointer stays, and every one of these actions
// also has a button elsewhere (the shop nav, the cart), so touch and keyboard never need it.
export function createCursorPill() {
  const pill = document.createElement('div');
  pill.className = 'cursor-pill';
  pill.setAttribute('aria-hidden', 'true');
  document.body.append(pill);

  return {
    show(label, ev) {
      if (pill.textContent !== label) pill.textContent = label;
      const x = Math.min(ev.clientX + 14, innerWidth - pill.offsetWidth - 8); // stay on screen near the right and bottom edges
      const y = Math.min(ev.clientY + 14, innerHeight - pill.offsetHeight - 8);
      pill.style.transform = `translate(${x}px, ${y}px)`;
      pill.classList.add('on');
    },
    hide: () => pill.classList.remove('on'),
  };
}
