/**
 * Local preview server — the app itself is static and has no backend.
 *
 * It exists only because ES modules and service workers need a real origin, so opening
 * public/index.html as a file:// URL won't work. In production any static host serves
 * public/ exactly the same way.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = process.env.PORT || 4180;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);

    // Keep requests inside public/ — path.join collapses any ../ before we get here.
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
      res.writeHead(403).end('forbidden');
      return;
    }

    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        // The service worker caches for real; don't let the dev server mask edits.
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    });
  })
  .listen(PORT, () => {
    console.log(`\n  Family Tree Maker  →  http://localhost:${PORT}\n`);
    console.log(`  Serving ${ROOT}`);
    console.log('  Your trees are stored in the browser, not on disk.\n');
  });
