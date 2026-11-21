// The shop's tape deck: one button that plays and pauses a looping track. Browsers block sound until
// the visitor acts, so it starts paused and nothing is fetched until the first press.
const VOLUME = 0.35;

export function initCassette() {
  const tape = document.getElementById('tape');
  const audio = new Audio('audio/a-chill-fever.mp3');
  audio.loop = true;
  audio.volume = VOLUME;
  audio.preload = 'none';

  const sync = () => {
    tape.setAttribute('aria-pressed', String(!audio.paused));
    tape.setAttribute('aria-label', audio.paused ? 'Play shop music' : 'Pause shop music');
  };
  audio.addEventListener('play', sync);
  audio.addEventListener('pause', sync);
  audio.addEventListener('error', sync);
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.pause(); }); // no music from a background tab
  tape.addEventListener('click', () => {
    if (!audio.paused) { audio.pause(); return; }
    audio.play().catch((err) => {
      sync();
      if (err.name !== 'AbortError') console.warn('Shop music could not start:', err); // AbortError: paused again before it loaded
    });
  });
}
