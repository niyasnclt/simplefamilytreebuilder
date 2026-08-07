import { layoutTree, M } from './layout.js';
import { LINE_H } from './text.js';
import { byId, gutters, backdrop, watermarkDefs, titleBlock } from './templates.js';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');


/**
 * Build the full SVG for a tree.
 * @param {object} tree
 * @param {object} [opts]
 * @param {(url:string)=>string} [opts.photoSrc] map a stored photo URL to an <image href> (used to inline data URIs on export)
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
  const g = gutters(t);

  const width = Math.round(L.width + g.left);
  const height = Math.round(L.height + g.top);

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
${backdrop(t, width, height)}
${titleBlock(t, tree, width, height)}
<g transform="translate(${g.left}, ${g.top})">
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
    out.push(
      `<image href="${esc(src(n.photo))}" xlink:href="${esc(src(n.photo))}" x="${n.x}" y="${n.y}" width="${d}" height="${d}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`
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
