// "Ask Slab": chat + voice assistant panel. Talks to /api/chat and replays the returned actions in the 3D shop.
import { canListen, listen, primeSpeech, speak, stopSpeaking } from './voice.js';

const MAX_HISTORY = 16;
const GREETING = "Hi, I'm Slab. Ask me to find anything in the shop, like \"8.5 inch decks under $60\" or \"trucks that fit Ember\".";
const SUGGESTIONS = ['Find 8.5" decks under $60', 'Soft wheels for cruising', 'Trucks that fit Ember', 'Add Ember to my cart'];

export function initAssistant(shop) {
  const $ = (id) => document.getElementById(id);
  const box = $('assistant'), log = $('askLog'), form = $('askForm'), input = $('askInput');
  const mic = $('askMic'), mute = $('askMute'), launcher = $('askOpen'), chips = $('askChips');
  const history = [];
  let pending = false;
  let stopListening = null;
  let muted = false;

  function bubble(kind, text) {
    const p = Object.assign(document.createElement('p'), { className: `msg ${kind}`, textContent: text });
    log.append(p);
    log.scrollTop = log.scrollHeight;
    return p;
  }

  function setOpen(open) {
    box.classList.toggle('open', open);
    box.inert = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) input.focus({ preventScroll: true });
    else {
      stopSpeaking();
      stopListening?.();
      launcher.focus({ preventScroll: true });
    }
  }

  async function send(raw, spoken = false) {
    const text = raw.trim().slice(0, 500);
    if (!text) return;
    if (pending) { input.value = raw; return; } // keep it for the user to resend once this reply finishes
    pending = true;
    stopSpeaking();
    form.classList.add('busy');
    if (chips.contains(document.activeElement)) input.focus({ preventScroll: true });
    chips.hidden = true;
    bubble('user', text);
    history.push({ role: 'user', content: text });
    const typing = bubble('bot typing', 'Thinking…');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY), state: shop.state() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.reply !== 'string') throw new Error(data.error || 'The assistant is unavailable right now.');
      typing.remove();
      bubble('bot', data.reply);
      history.push({ role: 'assistant', content: data.reply });
      if (spoken && !muted) speak(data.reply);
      for (const action of data.actions ?? []) await shop.perform(action);
      // On phones the chat would hide the card/checkout it just opened; tuck it away (the spoken reply keeps going).
      const opened = document.querySelector('.panel.open');
      if (data.actions?.length && matchMedia('(max-width: 600px)').matches && opened) {
        // Hand focus to the card/checkout first, so it doesn't fall to the page when the chat goes inert.
        if (box.contains(document.activeElement)) opened.querySelector('button, input')?.focus({ preventScroll: true });
        box.classList.remove('open');
        box.inert = true;
        launcher.setAttribute('aria-expanded', 'false');
      }
    } catch (err) {
      typing.remove();
      history.pop(); // keep user/assistant turns paired for the next request
      const offline = err instanceof TypeError; // fetch itself failed
      bubble('bot error', `${offline ? "I can't reach the assistant right now." : err.message} The shop still works by hand.`);
    } finally {
      pending = false;
      form.classList.remove('busy');
    }
  }

  function setListening(on) {
    mic.classList.toggle('live', on);
    mic.setAttribute('aria-pressed', String(on));
    mic.setAttribute('aria-label', on ? 'Stop listening' : 'Talk to Slab');
  }

  function toggleMic() {
    if (stopListening) { stopListening(); return; }
    primeSpeech();
    stopSpeaking();
    setListening(true);
    const draft = input.value;
    stopListening = listen({
      onInterim: (t) => { input.value = t; },
      onError: (code) => {
        if (code === 'not-allowed' || code === 'service-not-allowed') bubble('bot error', 'Microphone access is blocked. You can still type.');
      },
      onEnd: (final) => {
        stopListening = null;
        setListening(false);
        input.value = final ? '' : draft; // heard nothing → give back what was typed
        if (final && box.classList.contains('open')) send(final, true); // closing the panel cancels
      },
    });
  }

  bubble('bot', GREETING);
  chips.append(...SUGGESTIONS.map((s) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: s });
    b.addEventListener('click', () => send(s));
    return b;
  }));

  mic.hidden = !canListen;
  mic.addEventListener('click', toggleMic);
  mute.addEventListener('click', () => {
    muted = !muted;
    mute.setAttribute('aria-pressed', String(muted));
    if (muted) stopSpeaking();
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = input.value;
    input.value = '';
    send(text);
  });
  launcher.addEventListener('click', () => setOpen(!box.classList.contains('open')));
  $('askClose').addEventListener('click', () => setOpen(false));
  box.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation(); // don't also close the deck card or checkout behind the panel
    setOpen(false);
  });
}
