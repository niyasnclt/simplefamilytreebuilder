/**
 * Local-only storage. Trees and photos live in this browser's IndexedDB and never
 * leave the device — there is no server to talk to.
 *
 * Photo references keep the `/photos/<hash>.<ext>` shape the file-backed version used,
 * so a tree exported from either version imports cleanly into the other. Nothing ever
 * fetches that path; `photoURL()` swaps it for a `blob:` URL at render time.
 */

import { uid } from './outline.js';
import { spousesOf } from './people.js';
import { DEFAULT_PORTRAIT, DEFAULT_SPACING } from './layout.js';

const DB_NAME = 'familytree';
const DB_VERSION = 1;

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/* ------------------------------------------------------------- indexeddb */

let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('trees')) d.createObjectStore('trees', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'ref' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open local storage'));
      req.onblocked = () => reject(new Error('Another tab is upgrading the database — close it and reload'));
    });
  }
  return dbPromise;
}

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function objectStore(name, mode = 'readonly') {
  return (await db()).transaction(name, mode).objectStore(name);
}

/* -------------------------------------------------------------- helpers */

const nowISO = () => new Date().toISOString();

function randomId() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function blankPerson() {
  return { id: uid(), name: 'New Person', note: '', born: '', photo: null, spouse: null, spouses: [], children: [] };
}

function newTree(partial = {}) {
  const now = nowISO();
  return {
    id: partial.id || randomId(),
    name: partial.name || 'Untitled Family Tree',
    subtitle: partial.subtitle || '',
    template: partial.template || 'heritage',
    layout: partial.layout || 'flow',
    maxCols: partial.maxCols || 6,
    portrait: partial.portrait || DEFAULT_PORTRAIT, // portrait diameter — see layout.js
    spacing: partial.spacing || DEFAULT_SPACING, // gap scale — see layout.js
    order: partial.order || 'manual', // 'manual' | 'elder' | 'younger' — see order.js

    logo: partial.logo || null,
    createdAt: now,
    updatedAt: now,
    root: partial.root || blankPerson(),
  };
}

function countPeople(p) {
  if (!p) return 0;
  let n = 1 + spousesOf(p).filter((s) => s.name).length;
  for (const c of p.children || []) n += countPeople(c);
  return n;
}

function firstPhoto(p) {
  if (!p) return null;
  if (p.photo) return p.photo;
  const spousePhoto = spousesOf(p).find((s) => s.photo);
  if (spousePhoto) return spousePhoto.photo;
  for (const c of p.children || []) {
    const found = firstPhoto(c);
    if (found) return found;
  }
  return null;
}

/** Every photo reference a tree points at, logo included. */
export function collectPhotoRefs(tree, into = new Set()) {
  if (!tree) return into;
  if (tree.logo) into.add(tree.logo);
  const walk = (p) => {
    if (!p) return;
    if (p.photo) into.add(p.photo);
    for (const s of spousesOf(p)) if (s.photo) into.add(s.photo);
    (p.children || []).forEach(walk);
  };
  walk(tree.root);
  return into;
}

/* ---------------------------------------------------------------- trees */

export async function listTrees() {
  const all = await done((await objectStore('trees')).getAll());
  const summaries = all.map((t) => ({
    id: t.id,
    name: t.name,
    template: t.template,
    updatedAt: t.updatedAt,
    createdAt: t.createdAt,
    people: countPeople(t.root),
    cover: firstPhoto(t.root),
  }));
  summaries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  // Covers are drawn straight after this returns, so their blob URLs must exist first.
  await primeRefs(summaries.map((s) => s.cover).filter(Boolean));
  return summaries;
}

export async function getTree(id) {
  const tree = await done((await objectStore('trees')).get(id));
  if (!tree) throw new Error('not found');
  return tree;
}

export async function createTree(partial) {
  const tree = newTree(partial);
  await done((await objectStore('trees', 'readwrite')).put(tree));
  return tree;
}

export async function saveTree(patch) {
  const existing = await getTree(patch.id);
  const tree = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: nowISO() };
  await done((await objectStore('trees', 'readwrite')).put(tree));
  return tree;
}

export async function duplicateTree(id) {
  const src = await getTree(id);
  return createTree({ ...src, id: undefined, name: `${src.name} (copy)` });
}

export async function deleteTree(id) {
  await done((await objectStore('trees', 'readwrite')).delete(id));
  await sweepPhotos();
}

/** Drop photos no surviving tree references. Without this, deleting trees never frees space. */
async function sweepPhotos() {
  const trees = await done((await objectStore('trees')).getAll());
  const keep = new Set();
  for (const t of trees) collectPhotoRefs(t, keep);

  const refs = await done((await objectStore('photos')).getAllKeys());
  const dead = refs.filter((r) => !keep.has(r));
  if (!dead.length) return;

  const store = await objectStore('photos', 'readwrite');
  for (const ref of dead) {
    store.delete(ref);
    const url = urls.get(ref);
    if (url) {
      URL.revokeObjectURL(url);
      urls.delete(ref);
    }
    dims.delete(ref);
  }
}

/* --------------------------------------------------------------- photos */

// ref -> blob: URL, so render passes stay synchronous.
const urls = new Map();

// ref -> {w,h} in natural pixels. Placing a zoomed or panned crop needs the real
// aspect ratio, which the SVG can't tell us, so it's measured once and cached here.
const dims = new Map();

async function contentHash(buffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-1', buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  // crypto.subtle needs a secure context. Over plain http on a LAN address it's absent,
  // so fall back to a non-cryptographic hash — dedup is all we need it for.
  const bytes = new Uint8Array(buffer);
  let a = 0x811c9dc5;
  let b = 0xc2b2ae35;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0;
    b = Math.imul((b + bytes[i]) ^ a, 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Store an image file and return the reference to put on a person.
 * Identical images collapse to one record, so the same face across 40 trees costs one copy.
 */
export async function putPhoto(file) {
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new Error('unsupported image type');
  if (!file.size) throw new Error('empty file');

  const buffer = await file.arrayBuffer();
  const ref = `/photos/${await contentHash(buffer)}.${ext}`;
  const blob = new Blob([buffer], { type: file.type });

  const store = await objectStore('photos', 'readwrite');
  const existing = await done(store.get(ref));
  if (!existing) await done(store.put({ ref, blob, bytes: blob.size }));

  if (!urls.has(ref)) urls.set(ref, URL.createObjectURL(blob));
  await measure(ref, blob);
  return ref;
}

/** Synchronous lookup for render passes. Call primeRefs/primePhotos first. */
export function photoURL(ref) {
  if (!ref) return ref;
  return urls.get(ref) || ref;
}

/** Natural size of a stored photo, or null if it hasn't been measured yet. */
export function photoSize(ref) {
  return dims.get(ref) || null;
}

/** Seed the size cache from an <img> that has already decoded elsewhere. */
export function rememberPhotoSize(ref, w, h) {
  if (ref && w > 0 && h > 0 && !dims.has(ref)) dims.set(ref, { w, h });
}

export async function primeRefs(refs) {
  const missing = [...new Set(refs)].filter((r) => r && !(urls.has(r) && dims.has(r)));
  if (!missing.length) return;
  const store = await objectStore('photos');
  await Promise.all(
    missing.map(async (ref) => {
      const rec = await done(store.get(ref)).catch(() => null);
      if (!rec?.blob) return;
      if (!urls.has(ref)) urls.set(ref, URL.createObjectURL(rec.blob));
      await measure(ref, rec.blob);
    })
  );
}

async function measure(ref, blob) {
  if (dims.has(ref)) return;
  try {
    const bitmap = await createImageBitmap(blob);
    dims.set(ref, { w: bitmap.width, h: bitmap.height });
    bitmap.close?.();
    return;
  } catch {
    /* some browsers refuse certain formats here; fall through to an <img> decode */
  }
  const url = urls.get(ref) || URL.createObjectURL(blob);
  try {
    const img = await decode(url);
    dims.set(ref, { w: img.naturalWidth, h: img.naturalHeight });
  } catch {
    /* leave it unmeasured — render falls back to a centred cover crop */
  }
  if (!urls.has(ref)) URL.revokeObjectURL(url);
}

const decode = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });

export const primePhotos = (tree) => primeRefs([...collectPhotoRefs(tree)]);

/**
 * Take in photos that arrived inline with an imported file, as `{ ref: dataURL }`.
 * Refs are content hashes, so anything already held is left alone.
 */
export async function adoptPhotos(map) {
  const entries = Object.entries(map || {}).filter(
    ([, data]) => typeof data === 'string' && data.startsWith('data:image/')
  );
  if (!entries.length) return 0;

  // Decode before opening the write transaction. An IndexedDB transaction goes inactive
  // as soon as it awaits anything that isn't one of its own requests.
  const fresh = [];
  for (const [ref, data] of entries) {
    if (await hasPhoto(ref)) continue;
    fresh.push({ ref, blob: await dataURLToBlob(data) });
  }
  if (!fresh.length) return 0;

  await putPhotoRecords(fresh);
  return fresh.length;
}

async function hasPhoto(ref) {
  return !!(await done((await objectStore('photos')).getKey(ref)));
}

async function putPhotoRecords(records) {
  const store = await objectStore('photos', 'readwrite');
  let last;
  for (const { ref, blob } of records) last = store.put({ ref, blob, bytes: blob.size });
  if (last) await done(last);
}

const dataURLToBlob = async (data) => (await fetch(data)).blob();

/** Data URI for a stored photo, for self-contained PNG/PDF exports. */
export async function photoDataURL(ref) {
  const rec = await done((await objectStore('photos')).get(ref)).catch(() => null);
  if (!rec?.blob) return null;
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(rec.blob);
  });
}

/* ---------------------------------------------------------------- misc */

/** Bytes used and available, for the storage readout on the library screen. */
export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const { usage: used, quota } = await navigator.storage.estimate();
  return { used: used || 0, quota: quota || 0 };
}

/**
 * Ask the browser to make this origin's storage persistent, so it survives
 * "clear cache" style cleanups. Silently a no-op where unsupported.
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return await navigator.storage?.persisted?.();
  } catch {
    return false;
  }
}

/** Everything in one JSON blob — the only backup path a browser-local app can offer. */
export async function exportAll() {
  const trees = await done((await objectStore('trees')).getAll());
  const photos = await done((await objectStore('photos')).getAll());
  const encoded = await Promise.all(
    photos.map(async (p) => ({ ref: p.ref, data: await blobToDataURL(p.blob) }))
  );
  return { format: 'familytree-backup', version: 1, exportedAt: nowISO(), trees, photos: encoded };
}

export async function importAll(backup, { replace = false } = {}) {
  if (!backup || backup.format !== 'familytree-backup') throw new Error('not a backup file');

  if (replace) {
    await done((await objectStore('trees', 'readwrite')).clear());
    await done((await objectStore('photos', 'readwrite')).clear());
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  }

  const records = [];
  for (const p of backup.photos || []) {
    if (typeof p?.data !== 'string') continue;
    records.push({ ref: p.ref, blob: await dataURLToBlob(p.data) });
  }
  await putPhotoRecords(records);

  const valid = (backup.trees || []).filter((t) => t?.root);
  const treeStore = await objectStore('trees', 'readwrite');
  let last;
  for (const t of valid) last = treeStore.put({ ...t, id: t.id || randomId() });
  if (last) await done(last);
  return valid.length;
}

const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
