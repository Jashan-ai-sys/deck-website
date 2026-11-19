// Local stand-in for Vercel: serves the static site and routes /api/chat to the same function.
// Run with `npm start` (reads GROQ_API_KEY from .env.local).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import chat from './api/chat.js';

const ROOT = import.meta.dirname;
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

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
    // Allowlist: only what the page loads (index.html, styles.css, js/*.js). Never .env, api/ or tests.
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    const rel = path.slice(ROOT.length);
    if (!path.startsWith(ROOT + sep) || !/^[\\/](index\.html|styles\.css|js[\\/][\w-]+\.js)$/.test(rel)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const file = await readFile(path);
    // no-cache: always revalidate, so an edited module is never served stale during development.
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)], 'Cache-Control': 'no-cache' }).end(file);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`SLAB Deck Works → http://localhost:${PORT}`));
