// POST /api/chat → { reply, actions }. Vercel Function (Web fetch signature); dev-server.js runs it locally.
import { parseRequest, runAgent, DEFAULT_MODEL } from './_agent.js';

const MAX_BODY = 20_000;
const WINDOW_MS = 60_000;
const PER_WINDOW = 20;
// ponytail: per-instance memory, so the cap is per warm instance; move to Upstash/Vercel KV if the demo gets real traffic.
const hits = new Map();

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function rateLimited(ip, now = Date.now()) {
  if (hits.size > 1000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k); // drop expired windows
  const h = hits.get(ip);
  if (!h || now > h.reset) { hits.set(ip, { count: 1, reset: now + WINDOW_MS }); return false; }
  return ++h.count > PER_WINDOW;
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin fetches from some browsers omit it; the key never leaves the server anyway
  try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (!sameOrigin(request)) return json({ error: 'Forbidden.' }, 403);
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return json({ error: 'The assistant is not set up yet (GROQ_API_KEY is missing).' }, 503);
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
    if (rateLimited(ip)) return json({ error: 'Too many messages. Try again in a minute.' }, 429);

    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'Message too long.' }, 413);
    let input;
    try { input = parseRequest(JSON.parse(text)); } catch { return json({ error: 'Bad request.' }, 400); }

    try {
      return json(await runAgent(input, { apiKey, model: process.env.GROQ_MODEL || DEFAULT_MODEL }));
    } catch (err) {
      console.error('assistant failed:', err.message);
      if (/^Groq 429/.test(err.message)) return json({ error: 'Slab is getting a lot of questions right now. Try again in a few seconds.' }, 503);
      return json({ error: 'The assistant is unavailable right now.' }, 502);
    }
  },
};
