// Six visual templates. `heritage` is a close match for the reference PDF;
// the rest are variations on the same layout engine.

import { approxWidth } from './text.js';

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

export const TEMPLATES = [
  {
    id: 'heritage',
    label: 'Heritage',
    blurb: 'Cream + leaf watermark, vertical side title — the reference look',
    bg: '#F4F0E8',
    ink: '#2A2A28',
    note: '#8A857A',
    line: '#3B3A36',
    lineWidth: 1.15,
    ring: '#FFFFFF',
    ringWidth: 3,
    ringOuter: '#D5CEBD',
    accent: '#8A7A4E',
    font: SANS,
    nameUpper: true,
    nameWeight: 600,
    tracking: 0.9,
    shape: 'circle',
    title: 'side',
    watermark: 'leaves',
    swatch: ['#F4F0E8', '#8A7A4E', '#3B3A36'],
  },
  {
    id: 'ivory',
    serif: true,
    label: 'Ivory Classic',
    blurb: 'Warm ivory, serif type, gold rings and a centred title',
    bg: '#FBF7EF',
    ink: '#332F27',
    note: '#9A8F76',
    line: '#7A6A4C',
    lineWidth: 1,
    ring: '#FBF7EF',
    ringWidth: 2.5,
    ringOuter: '#C9A227',
    accent: '#C9A227',
    font: SERIF,
    nameUpper: true,
    nameWeight: 600,
    tracking: 0.6,
    shape: 'circle',
    title: 'top',
    watermark: 'ornate',
    swatch: ['#FBF7EF', '#C9A227', '#7A6A4C'],
  },
  {
    id: 'minimal',
    label: 'Pure Minimal',
    blurb: 'White, no ornament, hairline connectors — cleanest print',
    bg: '#FFFFFF',
    ink: '#1F2328',
    note: '#98A0A8',
    line: '#C3C9D0',
    lineWidth: 1,
    ring: '#FFFFFF',
    ringWidth: 3,
    ringOuter: '#E2E6EA',
    accent: '#1F2328',
    font: SANS,
    nameUpper: true,
    nameWeight: 600,
    tracking: 0.7,
    shape: 'circle',
    title: 'topleft',
    watermark: 'none',
    swatch: ['#FFFFFF', '#1F2328', '#C3C9D0'],
  },
  {
    id: 'midnight',
    label: 'Midnight',
    blurb: 'Dark charcoal-blue with luminous rings — great on screen',
    bg: '#101520',
    ink: '#E9EDF5',
    note: '#8592AA',
    line: '#3A4761',
    lineWidth: 1.2,
    ring: '#101520',
    ringWidth: 3,
    ringOuter: '#5C7CB8',
    accent: '#8FB4FF',
    font: SANS,
    nameUpper: true,
    nameWeight: 600,
    tracking: 0.9,
    shape: 'circle',
    title: 'banner',
    watermark: 'glow',
    swatch: ['#101520', '#8FB4FF', '#3A4761'],
  },
  {
    id: 'sage',
    serif: true,
    label: 'Sage Botanical',
    blurb: 'Soft green with botanical fronds and rounded-square portraits',
    bg: '#ECF1E8',
    ink: '#2B3A2B',
    note: '#7C8C79',
    line: '#6C8A69',
    lineWidth: 1.1,
    ring: '#FFFFFF',
    ringWidth: 3,
    ringOuter: '#A7BFA1',
    accent: '#5E7D5A',
    font: SERIF,
    nameUpper: true,
    nameWeight: 600,
    tracking: 0.6,
    shape: 'squircle',
    title: 'top',
    watermark: 'botanical',
    swatch: ['#ECF1E8', '#5E7D5A', '#6C8A69'],
  },
  {
    id: 'rosewood',
    serif: true,
    label: 'Rosewood',
    blurb: 'Blush paper, deep rose accents, vertical side title',
    bg: '#FAF3F1',
    ink: '#3A2226',
    note: '#A98088',
    line: '#8A5560',
    lineWidth: 1.1,
    ring: '#FFFFFF',
    ringWidth: 3,
    ringOuter: '#DCB2B9',
    accent: '#7B2B3B',
    font: SERIF,
    nameUpper: true,
    nameWeight: 600,
    tracking: 0.6,
    shape: 'circle',
    title: 'side',
    watermark: 'damask',
    swatch: ['#FAF3F1', '#7B2B3B', '#8A5560'],
  },
];

export const byId = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

/**
 * Extra canvas room the title treatment needs, plus the smallest tree area that
 * still looks like a finished sheet rather than a crop. A two-person family gets
 * the same generous margins a twenty-person one does.
 */
export function gutters(t, tree = {}) {
  if (t.title === 'side') return { left: 210, top: 40, minTree: { w: 470, h: 470 } };
  // A centred title with a logo above it needs the extra height reserved too.
  if (t.title === 'top') return { left: 40, top: tree.logo ? 232 : 150, minTree: { w: 560, h: 380 } };
  if (t.title === 'banner') return { left: 40, top: 130, minTree: { w: 560, h: 380 } };
  if (t.title === 'topleft') return { left: 40, top: 118, minTree: { w: 520, h: 380 } };
  return { left: 40, top: 40, minTree: { w: 480, h: 380 } };
}

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------ watermarks */

export function watermarkDefs(t) {
  switch (t.watermark) {
    case 'leaves':
      return `<pattern id="wm" width="190" height="190" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
        <path d="M20 78 C20 44 44 20 78 20 C78 54 54 78 20 78 Z" fill="${t.accent}" opacity="0.055"/>
        <path d="M110 168 C110 134 134 110 168 110 C168 144 144 168 110 168 Z" fill="${t.accent}" opacity="0.04"/>
        <path d="M132 62 C132 40 150 22 172 22 C172 44 154 62 132 62 Z" fill="${t.accent}" opacity="0.03"/>
      </pattern>`;
    case 'botanical':
      return `<pattern id="wm" width="210" height="210" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
        <path d="M105 30 C105 90 105 130 105 185" stroke="${t.accent}" stroke-width="2" fill="none" opacity="0.06"/>
        ${[0, 1, 2, 3, 4]
          .map((i) => {
            const y = 55 + i * 28;
            return `<path d="M105 ${y} C 78 ${y - 16} 60 ${y - 4} 58 ${y + 8} C 80 ${y + 14} 98 ${y + 6} 105 ${y}Z" fill="${t.accent}" opacity="0.05"/>
                    <path d="M105 ${y + 14} C 132 ${y - 2} 150 ${y + 10} 152 ${y + 22} C 130 ${y + 28} 112 ${y + 20} 105 ${y + 14}Z" fill="${t.accent}" opacity="0.05"/>`;
          })
          .join('')}
      </pattern>`;
    case 'damask':
      return `<pattern id="wm" width="120" height="120" patternUnits="userSpaceOnUse">
        <path d="M60 22 C74 42 74 78 60 98 C46 78 46 42 60 22 Z" fill="${t.accent}" opacity="0.05"/>
        <path d="M22 60 C42 46 78 46 98 60 C78 74 42 74 22 60 Z" fill="${t.accent}" opacity="0.035"/>
      </pattern>`;
    case 'ornate':
      return `<pattern id="wm" width="160" height="160" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <circle cx="80" cy="80" r="3.5" fill="${t.accent}" opacity="0.10"/>
        <circle cx="0" cy="0" r="3.5" fill="${t.accent}" opacity="0.10"/>
      </pattern>`;
    case 'glow':
      return `<radialGradient id="wm-a" cx="18%" cy="12%" r="70%">
          <stop offset="0%" stop-color="#2A3C5E" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="#101520" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="wm-b" cx="88%" cy="92%" r="60%">
          <stop offset="0%" stop-color="#3A2A4E" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#101520" stop-opacity="0"/>
        </radialGradient>`;
    default:
      return '';
  }
}

/**
 * Paper, pattern and ornament. `area` is the part of the sheet the tree itself
 * occupies — the ornament is composed against that, not against the title gutter.
 */
export function backdrop(t, w, h, area = { x: 0, y: 0, w, h }) {
  let s = `<rect width="${w}" height="${h}" fill="${t.bg}"/>`;
  if (t.watermark === 'glow') {
    s += `<rect width="${w}" height="${h}" fill="url(#wm-a)"/><rect width="${w}" height="${h}" fill="url(#wm-b)"/>`;
  } else if (t.watermark !== 'none') {
    s += `<rect width="${w}" height="${h}" fill="url(#wm)"/>`;
    if (t.watermark === 'leaves') {
      // Big faint tree silhouette, echoing the reference artwork. It is drawn in
      // a ~600x740 box and scaled to sit whole on the sheet — a cropped half-tree
      // is what makes a small sheet look unfinished.
      const s0 = Math.min(area.w / 720, area.h / 800, 1.7);
      const ox = area.x + area.w / 2 - 300 * s0;
      const oy = area.y + area.h / 2 - 400 * s0;
      s += `<g opacity="0.06" fill="${t.accent}" transform="translate(${r1(ox)}, ${r1(oy)}) scale(${r1(s0 * 100) / 100})">
        <path d="M300 720 L300 300 M300 430 C220 400 170 330 165 250 M300 430 C380 400 430 330 435 250 M300 330 C245 305 210 255 205 200 M300 330 C355 305 390 255 395 200"
          stroke="${t.accent}" stroke-width="16" fill="none" stroke-linecap="round"/>
        ${Array.from({ length: 26 }, (_, i) => {
          const a = (i / 26) * Math.PI * 2;
          const cx = 300 + Math.cos(a) * (150 + (i % 5) * 34);
          const cy = 250 + Math.sin(a) * (110 + (i % 4) * 26);
          return `<path d="M${cx} ${cy} c0 -34 24 -58 58 -58 c0 34 -24 58 -58 58 Z" transform="rotate(${i * 27} ${cx} ${cy})"/>`;
        }).join('')}
      </g>`;
    }
  }
  if (t.id === 'ivory') {
    s += `<rect x="26" y="26" width="${w - 52}" height="${h - 52}" fill="none" stroke="${t.accent}" stroke-width="2" opacity="0.5"/>
          <rect x="34" y="34" width="${w - 68}" height="${h - 68}" fill="none" stroke="${t.accent}" stroke-width="0.75" opacity="0.5"/>`;
  }
  return s;
}

/* ----------------------------------------------------------------- title */

/** Split into exactly `k` lines, keeping them roughly the same length. */
function wrapBalanced(text, k) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length <= 1 || k <= 1) return [words.join(' ')];
  const target = Math.ceil(words.join(' ').length / k);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= target && lines.length < k - 1) cur += ' ' + word;
    else if (lines.length === k - 1) cur += ' ' + word;
    else { lines.push(cur); cur = word; }
  }
  lines.push(cur);
  return lines;
}

/**
 * Set a title as large as it can be without running past `budget`, trying one
 * line then two. Tracking is a fraction of the size, so it scales with the type.
 * `maxByLines[i]` caps the size at i+1 lines, which is what keeps a wrapped
 * title inside the room the layout reserved for it.
 */
function fitTitle(name, budget, serif, trackRatio, maxByLines) {
  const width1 = (line) => approxWidth(line, 1, trackRatio, serif) || 1;
  let best = null;
  for (let k = 1; k <= maxByLines.length; k++) {
    const lines = wrapBalanced(name, k);
    if (lines.length < k) break; // no more words to split on
    const size = Math.min(maxByLines[k - 1], ...lines.map((l) => budget / width1(l)));
    if (!best || size > best.size + 0.5) best = { lines, size };
  }
  best = best || { lines: [''], size: maxByLines[0] };
  return { lines: best.lines, size: Math.max(11, best.size), tracking: Math.max(11, best.size) * trackRatio };
}

export function titleBlock(t, tree, w, h) {
  const name = (tree.name || '').toUpperCase();
  const sub = tree.subtitle || '';
  const logo = tree.logo
    ? `<clipPath id="logoclip"><circle cx="0" cy="0" r="34"/></clipPath>
       <circle cx="0" cy="0" r="35.5" fill="none" stroke="${t.accent}" stroke-width="2"/>
       <image href="${esc(tree.logo)}" x="-34" y="-34" width="68" height="68" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoclip)"/>`
    : '';

  if (t.title === 'side') {
    // The pill runs the height of the sheet, and the type is set to the pill —
    // so a two-person tree gets the same treatment as a two-hundred-person one.
    const barTop = logo ? 132 : 40;
    const barH = Math.max(180, h - barTop - 40);
    const fit = fitTitle(name, barH - 72, t.serif, 0.28, [30, 26]);
    // Rotated, the lines stack across the pill: cap height falls one side of the
    // first baseline and the last line's depth the other. Centre on that span.
    const above = fit.size * 0.72;
    const below = sub
      ? fit.lines.length * (fit.size * 1.4) + 9
      : (fit.lines.length - 1) * (fit.size * 1.4) + fit.size * 0.25;
    const originX = 100 - (below - above) / 2;
    return `
      ${logo ? `<g transform="translate(100, 78)">${logo}</g>` : ''}
      <g>
        <rect x="34" y="${barTop}" width="132" height="${barH}" rx="66" fill="none" stroke="${t.ink}" stroke-width="1.6" opacity="0.85"/>
        <g transform="translate(${r1(originX)}, ${barTop + barH / 2}) rotate(-90)">
          ${fit.lines
            .map(
              (l, i) =>
                `<text x="0" y="${i * (fit.size * 1.4)}" text-anchor="middle" font-family="${t.font}" font-size="${r1(fit.size)}" font-weight="700" letter-spacing="${r1(fit.tracking)}" fill="${t.ink}">${esc(l)}</text>`
            )
            .join('')}
          ${sub ? `<text x="0" y="${r1(fit.lines.length * (fit.size * 1.4) + 6)}" text-anchor="middle" font-family="${t.font}" font-size="13" letter-spacing="3" fill="${t.note}">${esc(sub)}</text>` : ''}
        </g>
      </g>`;
  }

  if (t.title === 'top') {
    const cx = w / 2;
    const fit = fitTitle(name, w - 96, t.serif, 0.176, [34, 26]);
    const top = logo ? 96 : 44;
    const baseline = (i) => top + fit.size + i * fit.size * 1.28;
    const ruleY = baseline(fit.lines.length - 1) + 18;
    const rule = Math.min(200, Math.max(110, w / 2 - 40));
    return `
      ${logo ? `<g transform="translate(${cx}, 52)">${logo}</g>` : ''}
      ${fit.lines
        .map(
          (l, i) =>
            `<text x="${cx}" y="${r1(baseline(i))}" text-anchor="middle" font-family="${t.font}" font-size="${r1(fit.size)}" font-weight="700" letter-spacing="${r1(fit.tracking)}" fill="${t.ink}">${esc(l)}</text>`
        )
        .join('')}
      <line x1="${r1(cx - rule)}" y1="${r1(ruleY)}" x2="${r1(cx + rule)}" y2="${r1(ruleY)}" stroke="${t.accent}" stroke-width="1.2"/>
      ${sub ? `<text x="${cx}" y="${r1(ruleY + 24)}" text-anchor="middle" font-family="${t.font}" font-size="14" letter-spacing="3.5" fill="${t.note}">${esc(sub)}</text>` : ''}`;
  }

  if (t.title === 'banner') {
    const x = logo ? 132 : 56;
    const fit = fitTitle(name, w - x - 48, t.serif, 0.143, [28, 21]);
    const two = fit.lines.length > 1;
    const bandH = two ? 116 : 96;
    const first = two ? 42 : sub ? 46 : 56;
    return `
      <rect x="0" y="0" width="${w}" height="${bandH}" fill="${t.accent}" opacity="0.10"/>
      ${logo ? `<g transform="translate(78, ${bandH / 2})">${logo}</g>` : ''}
      ${fit.lines
        .map(
          (l, i) =>
            `<text x="${x}" y="${r1(first + i * fit.size * 1.28)}" font-family="${t.font}" font-size="${r1(fit.size)}" font-weight="700" letter-spacing="${r1(fit.tracking)}" fill="${t.ink}">${esc(l)}</text>`
        )
        .join('')}
      ${sub ? `<text x="${x}" y="${r1(first + fit.lines.length * fit.size * 1.28 + 6)}" font-family="${t.font}" font-size="14" letter-spacing="3" fill="${t.note}">${esc(sub)}</text>` : ''}`;
  }

  // topleft
  const x = logo ? 140 : 56;
  const fit = fitTitle(name, w - x - 48, t.serif, 0.115, [26, 20]);
  const first = fit.lines.length > 1 ? 44 : sub ? 52 : 62;
  return `
    ${logo ? `<g transform="translate(90, 56)">${logo}</g>` : ''}
    ${fit.lines
      .map(
        (l, i) =>
          `<text x="${x}" y="${r1(first + i * fit.size * 1.28)}" font-family="${t.font}" font-size="${r1(fit.size)}" font-weight="700" letter-spacing="${r1(fit.tracking)}" fill="${t.ink}">${esc(l)}</text>`
      )
      .join('')}
    ${sub ? `<text x="${x}" y="${r1(first + fit.lines.length * fit.size * 1.28 + 8)}" font-family="${t.font}" font-size="13" letter-spacing="2.5" fill="${t.note}">${esc(sub)}</text>` : ''}`;
}

const r1 = (n) => Math.round(n * 10) / 10;

