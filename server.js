import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOutline } from './public/outline.js';
import { SAMPLE_OUTLINE } from './sample.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const TREES = path.join(DATA, 'trees');
const PHOTOS = path.join(DATA, 'photos');
const PORT = process.env.PORT || 4180;

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const app = express();
app.use(express.json({ limit: '64mb' }));

/* ---------------------------------------------------------------- storage */

const treeFile = (id) => path.join(TREES, `${id}.json`);

// Tree ids land in a filesystem path, so keep them to a safe alphabet.
const isValidId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

async function readTree(id) {
  return JSON.parse(await fs.readFile(treeFile(id), 'utf8'));
}

async function writeTree(tree) {
  // Write to a temp file first so a crash mid-write can't truncate an existing tree.
  const tmp = treeFile(tree.id) + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(tree, null, 2));
  await fs.rename(tmp, treeFile(tree.id));
}

async function listTrees() {
  const files = (await fs.readdir(TREES)).filter((f) => f.endsWith('.json'));
  const trees = [];
  for (const f of files) {
    try {
      const t = JSON.parse(await fs.readFile(path.join(TREES, f), 'utf8'));
      trees.push({
        id: t.id,
        name: t.name,
        template: t.template,
        updatedAt: t.updatedAt,
        createdAt: t.createdAt,
        people: countPeople(t.root),
        cover: firstPhoto(t.root),
      });
    } catch {
      /* skip unreadable/corrupt files rather than failing the whole listing */
    }
  }
  trees.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return trees;
}

function countPeople(p) {
  if (!p) return 0;
  let n = 1 + (p.spouse && p.spouse.name ? 1 : 0);
  for (const c of p.children || []) n += countPeople(c);
  return n;
}

function firstPhoto(p) {
  if (!p) return null;
  if (p.photo) return p.photo;
  if (p.spouse && p.spouse.photo) return p.spouse.photo;
  for (const c of p.children || []) {
    const found = firstPhoto(c);
    if (found) return found;
  }
  return null;
}

function blankPerson() {
  return { id: 'p' + crypto.randomBytes(4).toString('hex'), name: 'New Person', note: '', photo: null, spouse: null, children: [] };
}

function newTree(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id || crypto.randomBytes(8).toString('hex'),
    name: partial.name || 'Untitled Family Tree',
    subtitle: partial.subtitle || '',
    template: partial.template || 'heritage',
    layout: partial.layout || 'flow',
    maxCols: partial.maxCols || 6,
    logo: partial.logo || null,
    createdAt: now,
    updatedAt: now,
    root: partial.root || blankPerson(),
  };
}

/* ------------------------------------------------------------------- api */

app.get('/api/trees', async (_req, res) => {
  res.json(await listTrees());
});

app.post('/api/trees', async (req, res) => {
  const tree = newTree(req.body || {});
  await writeTree(tree);
  res.status(201).json(tree);
});

app.get('/api/trees/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'bad id' });
  try {
    res.json(await readTree(req.params.id));
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

app.put('/api/trees/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'bad id' });
  let existing = null;
  try {
    existing = await readTree(req.params.id);
  } catch {
    return res.status(404).json({ error: 'not found' });
  }
  const tree = {
    ...existing,
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await writeTree(tree);
  res.json(tree);
});

app.post('/api/trees/:id/duplicate', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'bad id' });
  try {
    const src = await readTree(req.params.id);
    const copy = newTree({ ...src, id: undefined, name: `${src.name} (copy)` });
    await writeTree(copy);
    res.status(201).json(copy);
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

app.delete('/api/trees/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'bad id' });
  try {
    await fs.unlink(treeFile(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

// Photo upload: raw image bytes with the real Content-Type. Deduped by content hash,
// so re-uploading the same face across 40 trees costs one file.
app.post('/api/photos', express.raw({ type: 'image/*', limit: '40mb' }), async (req, res) => {
  const ext = EXT_BY_TYPE[req.headers['content-type']];
  if (!ext) return res.status(415).json({ error: 'unsupported image type' });
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'empty body' });
  const hash = crypto.createHash('sha1').update(req.body).digest('hex').slice(0, 16);
  const file = `${hash}.${ext}`;
  const dest = path.join(PHOTOS, file);
  try {
    await fs.access(dest);
  } catch {
    await fs.writeFile(dest, req.body);
  }
  res.json({ url: `/photos/${file}` });
});

/* --------------------------------------------------------------- static */

app.use('/photos', express.static(PHOTOS, { maxAge: '365d', immutable: true }));
app.use(express.static(path.join(ROOT, 'public')));

/* ----------------------------------------------------------------- boot */

async function seedIfEmpty() {
  const existing = (await fs.readdir(TREES)).filter((f) => f.endsWith('.json'));
  if (existing.length) return;
  const tree = newTree({
    name: 'Narimukkil Muhammed Shah Family Tree',
    subtitle: 'Sample — edit or delete me',
    template: 'heritage',
    root: parseOutline(SAMPLE_OUTLINE),
  });
  await writeTree(tree);
  console.log('Seeded a sample tree from your reference PDF.');
}

await fs.mkdir(TREES, { recursive: true });
await fs.mkdir(PHOTOS, { recursive: true });
await seedIfEmpty();

app.listen(PORT, () => {
  console.log(`\n  Family Tree Maker running\n  →  http://localhost:${PORT}\n`);
  console.log(`  Trees:  ${TREES}`);
  console.log(`  Photos: ${PHOTOS}\n`);
});
