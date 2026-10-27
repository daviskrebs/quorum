// Serves the site for tests, pointing it at the local Firebase emulators instead of
// the real project. Everything else is the repo's own files.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const EMULATOR_CONFIG = `window.TALLY_FIREBASE = { apiKey: 'demo-key', authDomain: 'demo-tally.firebaseapp.com', projectId: 'demo-tally', useEmulator: true };`;

export function startServer(port = 8765) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (path === '/firebase.config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(EMULATOR_CONFIG); }
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}
