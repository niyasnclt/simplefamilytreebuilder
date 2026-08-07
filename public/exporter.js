import { renderSVG } from './render.js';

const MAX_CANVAS_DIM = 15000; // stay clear of browser canvas limits

/* ------------------------------------------------------ photo inlining */

const cache = new Map();

async function toDataURL(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`photo ${url}: ${r.status}`);
      return r.blob();
    })
    .then(
      (b) =>
        new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = rej;
          fr.readAsDataURL(b);
        })
    )
    .catch(() => null); // a missing photo shouldn't sink the whole export
  cache.set(url, p);
  return p;
}

export function forgetPhotoCache() {
  cache.clear();
}

function collectPhotos(tree) {
  const urls = new Set();
  if (tree.logo) urls.add(tree.logo);
  const walk = (p) => {
    if (!p) return;
    if (p.photo) urls.add(p.photo);
    if (p.spouse && p.spouse.photo) urls.add(p.spouse.photo);
    (p.children || []).forEach(walk);
  };
  walk(tree.root);
  return [...urls];
}

/** Render the tree to a canvas with every photo embedded as a data URI. */
async function renderToCanvas(tree, scale, onProgress) {
  const urls = collectPhotos(tree);
  onProgress?.(`Embedding ${urls.length} photo${urls.length === 1 ? '' : 's'}…`);
  const pairs = await Promise.all(urls.map(async (u) => [u, await toDataURL(u)]));
  const map = new Map(pairs);
  const inlined = { ...tree, logo: tree.logo ? map.get(tree.logo) || tree.logo : null };

  const { svg, width, height } = renderSVG(inlined, {
    photoSrc: (u) => map.get(u) || u,
  });

  const fit = Math.min(1, MAX_CANVAS_DIM / Math.max(width * scale, height * scale));
  const s = scale * fit;

  onProgress?.('Rendering…');
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * s);
  canvas.height = Math.round(height * s);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, clamped: fit < 1 };
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not rasterise the tree'));
    img.src = src;
  });
}

const canvasBlob = (canvas, type, q) =>
  new Promise((res) => canvas.toBlob(res, type, q));

/* -------------------------------------------------------------- exports */

export async function exportPNG(tree, { scale = 2, onProgress } = {}) {
  const { canvas, clamped } = await renderToCanvas(tree, scale, onProgress);
  onProgress?.('Writing PNG…');
  const blob = await canvasBlob(canvas, 'image/png');
  download(blob, `${slug(tree.name)}.png`);
  return { clamped, width: canvas.width, height: canvas.height };
}

const PAGES = {
  fit: null,
  a4l: [841.89, 595.28],
  a4p: [595.28, 841.89],
  a3l: [1190.55, 841.89],
  a3p: [841.89, 1190.55],
  a2l: [1683.78, 1190.55],
};

export async function exportPDF(tree, { scale = 2, page = 'fit', onProgress } = {}) {
  const { canvas, clamped } = await renderToCanvas(tree, scale, onProgress);
  onProgress?.('Writing PDF…');
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.94);
  const jpeg = new Uint8Array(await blob.arrayBuffer());

  // Points, at 96 CSS px per inch.
  const nativeW = (canvas.width / scale) * 0.75;
  const nativeH = (canvas.height / scale) * 0.75;

  let pageW, pageH, drawW, drawH, drawX, drawY;
  if (page === 'fit') {
    pageW = nativeW;
    pageH = nativeH;
    drawW = pageW;
    drawH = pageH;
    drawX = 0;
    drawY = 0;
  } else {
    [pageW, pageH] = PAGES[page] || PAGES.a3l;
    const margin = 24;
    const k = Math.min((pageW - margin * 2) / nativeW, (pageH - margin * 2) / nativeH);
    drawW = nativeW * k;
    drawH = nativeH * k;
    drawX = (pageW - drawW) / 2;
    drawY = (pageH - drawH) / 2;
  }

  const pdf = buildPDF({
    jpeg,
    imgW: canvas.width,
    imgH: canvas.height,
    title: tree.name || 'Family Tree',
    pageW, pageH, drawW, drawH, drawX, drawY,
  });
  download(new Blob([pdf], { type: 'application/pdf' }), `${slug(tree.name)}.pdf`);
  return { clamped, pageW, pageH };
}

/* --------------------------------------------------- minimal PDF writer */
// One page, one JPEG XObject (DCTDecode) — no external dependency needed.

function buildPDF({ jpeg, imgW, imgH, title, pageW, pageH, drawW, drawH, drawX, drawY }) {
  const parts = [];
  let len = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? latin1(chunk) : chunk;
    parts.push(bytes);
    len += bytes.length;
  };

  const offsets = [0];
  const obj = (n, body, stream) => {
    offsets[n] = len;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  const r = (n) => Math.round(n * 100) / 100;
  const content = `q ${r(drawW)} 0 0 ${r(drawH)} ${r(drawX)} ${r(drawY)} cm /Im0 Do Q`;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${r(pageW)} ${r(pageH)}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  obj(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpeg
  );
  obj(5, `<< /Length ${content.length} >>`, latin1(content));
  obj(6, `<< /Title (${pdfString(title)}) /Producer (Family Tree Maker) >>`);

  const xref = len;
  const count = 7;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function latin1(s) {
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
  return a;
}

const pdfString = (s) =>
  String(s).replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7E]/g, '');

/* --------------------------------------------------------------- helpers */

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function slug(name) {
  return (
    String(name || 'family-tree')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'family-tree'
  );
}
