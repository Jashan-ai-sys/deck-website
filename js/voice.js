// Browser-native voice: Web Speech recognition in, speech synthesis out. No extra services or keys.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListen = Boolean(Recognition);
const canSpeak = 'speechSynthesis' in window;

// Starts listening; returns a stop function. onEnd receives the final transcript ('' if nothing was heard).
export function listen({ onInterim, onEnd, onError }) {
  const rec = new Recognition();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const text = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) final += text; else interim += text;
    }
    onInterim(final + interim);
  };
  rec.onerror = (ev) => onError(ev.error);
  rec.onend = () => onEnd(final.trim());
  rec.start();
  return () => rec.stop();
}

// iOS Safari only speaks after one speak() inside a user gesture; call this from the mic tap.
let primed = false;
export function primeSpeech() {
  if (!canSpeak || primed) return;
  primed = true;
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

const preferred = /natural|neural|samantha|google us english|aria|jenny/i;

export function speak(text) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  utter.voice = voices.find((v) => preferred.test(v.name)) ?? voices[0] ?? null;
  utter.rate = 1.05;
  speechSynthesis.speak(utter);
}

export const stopSpeaking = () => { if (canSpeak) speechSynthesis.cancel(); };
