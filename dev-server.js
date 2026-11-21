// Local stand-in for Vercel: serves the static site and routes /api/chat to the same function.
// Run with `npm start` (reads GROQ_API_KEY from .env.local).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import chat from './api/chat.js';

const ROOT = import.meta.dirname;
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

async function readBody(req, limit = 32_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('body too large');
  }
  return body;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/chat') {
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const response = await chat.fetch(new Request(url, { method: req.method, headers: req.headers, body }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    // Allowlist: only what the page loads (index.html, styles.css, js/*.js, audio/*.mp3). Never .env, api/ or tests.
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    const rel = path.slice(ROOT.length);
    if (!path.startsWith(ROOT + sep) || !/^[\\/](index\.html|styles\.css|js[\\/][\w-]+\.js|audio[\\/][\w-]+\.mp3)$/.test(rel)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const file = await readFile(path);
    // no-cache: always revalidate, so an edited module is never served stale during development.
    const headers = { 'Content-Type': TYPES[extname(path)], 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    // Safari only plays audio from a server that answers byte-range requests, as Vercel does.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, file.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), file.length - 1) : file.length - 1;
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${file.length}` }).end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${file.length}` }).end(file.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, headers).end(file);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`SLAB Deck Works → http://localhost:${PORT}`));
