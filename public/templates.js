// Six visual templates. `heritage` is a close match for the reference PDF;
// the rest are variations on the same layout engine.

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

/** Extra canvas room the title treatment needs. */
export function gutters(t) {
  if (t.title === 'side') return { left: 210, top: 40 };
  if (t.title === 'top') return { left: 40, top: 150 };
  if (t.title === 'banner') return { left: 40, top: 130 };
  if (t.title === 'topleft') return { left: 40, top: 118 };
  return { left: 40, top: 40 };
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

export function backdrop(t, w, h) {
  let s = `<rect width="${w}" height="${h}" fill="${t.bg}"/>`;
  if (t.watermark === 'glow') {
    s += `<rect width="${w}" height="${h}" fill="url(#wm-a)"/><rect width="${w}" height="${h}" fill="url(#wm-b)"/>`;
  } else if (t.watermark !== 'none') {
    s += `<rect width="${w}" height="${h}" fill="url(#wm)"/>`;
    if (t.watermark === 'leaves') {
      // Big faint tree silhouette, echoing the reference artwork.
      s += `<g opacity="0.06" fill="${t.accent}" transform="translate(${w * 0.34}, ${h * 0.12}) scale(${Math.max(w, h) / 900})">
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

export function titleBlock(t, tree, w, h) {
  const name = (tree.name || '').toUpperCase();
  const sub = tree.subtitle || '';
  const logo = tree.logo
    ? `<clipPath id="logoclip"><circle cx="0" cy="0" r="34"/></clipPath>
       <circle cx="0" cy="0" r="35.5" fill="none" stroke="${t.accent}" stroke-width="2"/>
       <image href="${esc(tree.logo)}" x="-34" y="-34" width="68" height="68" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoclip)"/>`
    : '';

  if (t.title === 'side') {
    const lines = wrap(name, 26).slice(0, 2);
    const size = lines.length > 1 ? 26 : 30;
    const barH = Math.max(360, h - 200);
    const barY = (h - barH) / 2 + 40;
    return `
      ${logo ? `<g transform="translate(90, 78)">${logo}</g>` : ''}
      <g>
        <rect x="34" y="${barY}" width="132" height="${barH}" rx="66" fill="none" stroke="${t.ink}" stroke-width="1.6" opacity="0.85"/>
        <g transform="translate(${100 - (lines.length - 1) * (size * 0.7)}, ${barY + barH / 2}) rotate(-90)">
          ${lines
            .map(
              (l, i) =>
                `<text x="0" y="${i * (size * 1.4)}" text-anchor="middle" font-family="${t.font}" font-size="${size}" font-weight="700" letter-spacing="${size * 0.28}" fill="${t.ink}">${esc(l)}</text>`
            )
            .join('')}
          ${sub ? `<text x="0" y="${lines.length * (size * 1.4) + 6}" text-anchor="middle" font-family="${t.font}" font-size="13" letter-spacing="3" fill="${t.note}">${esc(sub)}</text>` : ''}
        </g>
      </g>`;
  }

  if (t.title === 'top') {
    const cx = w / 2;
    return `
      ${logo ? `<g transform="translate(${cx}, 52)">${logo}</g>` : ''}
      <text x="${cx}" y="${logo ? 122 : 76}" text-anchor="middle" font-family="${t.font}" font-size="34" font-weight="700" letter-spacing="6" fill="${t.ink}">${esc(name)}</text>
      <line x1="${cx - 200}" y1="${logo ? 140 : 94}" x2="${cx + 200}" y2="${logo ? 140 : 94}" stroke="${t.accent}" stroke-width="1.2"/>
      ${sub ? `<text x="${cx}" y="${logo ? 164 : 118}" text-anchor="middle" font-family="${t.font}" font-size="14" letter-spacing="3.5" fill="${t.note}">${esc(sub)}</text>` : ''}`;
  }

  if (t.title === 'banner') {
    return `
      <rect x="0" y="0" width="${w}" height="96" fill="${t.accent}" opacity="0.10"/>
      ${logo ? `<g transform="translate(78, 48)">${logo}</g>` : ''}
      <text x="${logo ? 132 : 56}" y="${sub ? 46 : 56}" font-family="${t.font}" font-size="28" font-weight="700" letter-spacing="4" fill="${t.ink}">${esc(name)}</text>
      ${sub ? `<text x="${logo ? 132 : 56}" y="72" font-family="${t.font}" font-size="14" letter-spacing="3" fill="${t.note}">${esc(sub)}</text>` : ''}`;
  }

  // topleft
  return `
    ${logo ? `<g transform="translate(90, 56)">${logo}</g>` : ''}
    <text x="${logo ? 140 : 56}" y="${sub ? 52 : 62}" font-family="${t.font}" font-size="26" font-weight="700" letter-spacing="3" fill="${t.ink}">${esc(name)}</text>
    ${sub ? `<text x="${logo ? 140 : 56}" y="78" font-family="${t.font}" font-size="13" letter-spacing="2.5" fill="${t.note}">${esc(sub)}</text>` : ''}`;
}

/** Greedy word wrap by character budget. */
export function wrap(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
