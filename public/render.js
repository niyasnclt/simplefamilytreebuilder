import { layoutTree, M } from './layout.js';
import { LINE_H } from './text.js';
import { byId, gutters, backdrop, watermarkDefs, titleBlock } from './templates.js';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * How a photo sits inside its frame: `zoom` 1 is the tightest crop that still
 * covers it, and `x`/`y` slide the overflow — 0 is left/top, 1 is right/bottom.
 * The default is a centred cover, which is what the app did before framing existed.
 */
export const DEFAULT_FIT = { zoom: 1, x: 0.5, y: 0.5 };
export const MAX_ZOOM = 4;

const clamp = (v, lo, hi, fallback) =>
  Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : fallback;

export function normalizeFit(fit) {
  if (!fit) return DEFAULT_FIT;
  return {
    zoom: clamp(fit.zoom, 1, MAX_ZOOM, 1),
    x: clamp(fit.x, 0, 1, 0.5),
    y: clamp(fit.y, 0, 1, 0.5),
  };
}

export const isDefaultFit = (fit) => {
  const f = normalizeFit(fit);
  return f.zoom === 1 && f.x === 0.5 && f.y === 0.5;
};

/**
 * Where a photo's pixels land inside a `size`-wide square frame.
 *
 * Shared with the framing dialog so its preview and the exported SVG agree. When the
 * natural size is unknown the browser's own centred cover stands in; zoom still works,
 * but panning has nothing to slide because the box stays square.
 */
export function fitRect(fit, size, natural) {
  const f = normalizeFit(fit);
  const known = natural && natural.w > 0 && natural.h > 0;
  const scale = known ? Math.max(size / natural.w, size / natural.h) * f.zoom : null;
  const w = known ? natural.w * scale : size * f.zoom;
  const h = known ? natural.h * scale : size * f.zoom;
  return {
    x: -(w - size) * f.x,
    y: -(h - size) * f.y,
    w,
    h,
    // w/h already carry the aspect ratio, so 'none' scales without distorting.
    preserveAspectRatio: known ? 'none' : 'xMidYMid slice',
  };
}

/**
 * Build the full SVG for a tree.
 * @param {object} tree
 * @param {object} [opts]
 * @param {(url:string)=>string} [opts.photoSrc] map a stored photo URL to an <image href> (used to inline data URIs on export)
 * @param {(url:string)=>({w:number,h:number}|null)} [opts.photoSize] natural pixel size of a stored photo, for framing
 * @param {{id:string,side:string}} [opts.selected]
 * @param {boolean} [opts.interactive] add hit targets + data attributes
 */
export function renderSVG(tree, opts = {}) {
  const t = byId(tree.template);
  const src = opts.photoSrc || ((u) => u);
  const L = layoutTree(tree.root, {
    mode: tree.layout || 'flow',
    maxCols: tree.maxCols || 6,
    tracking: t.tracking,
    serif: !!t.serif,
    upper: t.nameUpper,
  });
  const g = gutters(t, tree);
  // The title block reads tree.logo straight off the object, so resolve it here too.
  const titled = tree.logo ? { ...tree, logo: src(tree.logo) } : tree;

  // A small family shouldn't produce a cropped-looking sheet: the canvas never
  // goes below a poster-ish minimum, and the tree is centred in whatever room is
  // left once the title has taken its gutter.
  const width = Math.max(Math.round(L.width + g.left), g.left + g.minTree.w);
  const height = Math.max(Math.round(L.height + g.top), g.top + g.minTree.h);
  const offX = g.left + (width - g.left - L.width) / 2;
  const offY = g.top + (height - g.top - L.height) / 2;

  const body = [];

  // Connectors first so portraits sit on top of the lines.
  if (L.edges.length) {
    body.push(
      `<path d="${L.edges.join(' ')}" fill="none" stroke="${t.line}" stroke-width="${t.lineWidth}" stroke-linecap="butt" shape-rendering="geometricPrecision"/>`
    );
  }

  for (const n of L.nodes) body.push(nodeMarkup(n, t, src, opts));

  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${watermarkDefs(t)}</defs>
${backdrop(t, width, height, { x: g.left, y: g.top, w: width - g.left, h: height - g.top })}
${titleBlock(t, titled, width, height)}
<g transform="translate(${r2(offX)}, ${r2(offY)})">
${body.join('\n')}
</g>
</svg>`,
  };
}

function nodeMarkup(n, t, src, opts) {
  const d = n.d;
  const r = d / 2;
  const cx = n.x + r;
  const cy = n.y + r;
  const cid = 'clip_' + safeId(n.key);
  const squircle = t.shape === 'squircle';
  const rx = squircle ? d * 0.28 : r;

  const shape = squircle
    ? `<rect x="${n.x}" y="${n.y}" width="${d}" height="${d}" rx="${rx}" ry="${rx}"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

  const out = [`<g class="ft-node">`];
  out.push(`<clipPath id="${cid}">${shape}</clipPath>`);

  if (n.photo) {
    const box = fitRect(n.photoFit, d, opts.photoSize ? opts.photoSize(n.photo) : null);
    const href = esc(src(n.photo));
    out.push(
      `<image href="${href}" xlink:href="${href}" x="${r2(n.x + box.x)}" y="${r2(n.y + box.y)}" width="${r2(box.w)}" height="${r2(box.h)}" preserveAspectRatio="${box.preserveAspectRatio}" clip-path="url(#${cid})"/>`
    );
  } else {
    out.push(placeholder(n, t, cid));
  }

  // Inner ring (paper-coloured) + thin outer keyline, as in the reference.
  const ringShape = (stroke, sw, inset) =>
    squircle
      ? `<rect x="${n.x + inset}" y="${n.y + inset}" width="${d - inset * 2}" height="${d - inset * 2}" rx="${rx}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r - inset}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;

  out.push(ringShape(t.ring, t.ringWidth, t.ringWidth / 2));
  out.push(ringShape(t.ringOuter, 1, 0.5));

  const selected =
    opts.selected && opts.selected.id === n.ref.id && opts.selected.side === n.ref.side;
  if (selected) out.push(ringShape(t.accent, 2.5, -3.5));

  out.push(label(n, t, cx));

  if (opts.interactive) {
    out.push(
      `<rect x="${n.x - 4}" y="${n.y - 4}" width="${d + 8}" height="${d + 8}" rx="${rx}" fill="transparent" style="cursor:pointer" data-id="${esc(n.ref.id)}" data-side="${esc(n.ref.side)}"><title>${esc(n.name || 'Unnamed')}</title></rect>`
    );
  }

  out.push('</g>');
  return out.join('');
}

function placeholder(n, t, cid) {
  const d = n.d;
  const cx = n.x + d / 2;
  const soft = t.id === 'midnight' ? '#232C3C' : '#D9D5CC';
  const figure = t.id === 'midnight' ? '#3C4859' : '#B9B3A6';
  return `<g clip-path="url(#${cid})">
    <rect x="${n.x}" y="${n.y}" width="${d}" height="${d}" fill="${soft}"/>
    <circle cx="${cx}" cy="${n.y + d * 0.36}" r="${d * 0.17}" fill="${figure}"/>
    <path d="M ${cx - d * 0.32} ${n.y + d} a ${d * 0.32} ${d * 0.3} 0 0 1 ${d * 0.64} 0 Z" fill="${figure}"/>
  </g>`;
}

// Lines are wrapped by the layout engine, which reserved the space for them.
function label(n, t, cx) {
  const isLeaf = n.nameBelow;
  const fs = n.fs || (isLeaf ? M.leafFS : M.headFS);
  const lines = n.lines && n.lines.length ? n.lines : [''];
  const noteOwnLine = n.note && n.noteInline === false;
  const rows = lines.length + (noteOwnLine ? 1 : 0);

  const noteSpan = (extra) =>
    `<tspan${extra} font-size="${fs - 2.5}" fill="${t.note}" font-weight="400" letter-spacing="0">${extra ? '' : ' '}(${esc(n.note)})</tspan>`;

  const first = isLeaf
    ? n.y + n.d + M.leafNameGap + fs // first line below the portrait
    : n.y - M.headNameGap - (rows - 1) * LINE_H; // last line just above it

  const spans = lines.map(
    (l, i) =>
      `<tspan x="${cx}" y="${first + i * LINE_H}">${esc(l)}${
        n.note && !noteOwnLine && i === lines.length - 1 ? noteSpan('') : ''
      }</tspan>`
  );
  if (noteOwnLine) spans.push(noteSpan(` x="${cx}" y="${first + lines.length * LINE_H}"`));

  return `<text text-anchor="middle" font-family="${t.font}" font-size="${fs}" font-weight="${t.nameWeight}" letter-spacing="${t.tracking}" fill="${t.ink}">${spans.join('')}</text>`;
}
