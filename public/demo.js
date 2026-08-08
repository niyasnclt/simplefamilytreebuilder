/**
 * The sample tree the app seeds itself with on first run, so a fresh visitor sees a
 * real layout instead of an empty canvas.
 *
 * Portraits are generated here as canvas PNGs rather than shipped as files — it keeps the
 * deployable under 150KB, and makes it obvious the faces are placeholders, not real people.
 */

import { parseOutline } from './outline.js';
import { createTree, adoptPhotos } from './store.js';

const OUTLINE = `
ARTHUR HOLLOWAY (Late) + ELEANOR HOLLOWAY (Late)
  JAMES HOLLOWAY + MARGARET REID
    DANIEL HOLLOWAY + SOPHIE LANG
      OLIVER HOLLOWAY
      AMELIA HOLLOWAY
    CLARA HOLLOWAY + THOMAS BYRNE
      NOAH BYRNE
  ROSE HOLLOWAY + HENRY CARTER
    LUCY CARTER + SAM OKONKWO
      MAYA OKONKWO
      ETHAN OKONKWO
    GEORGE CARTER
  WILLIAM HOLLOWAY (Late) + BEATRICE HOLLOWAY
    ALICE HOLLOWAY
`;

/* ------------------------------------------------------ dummy portraits */

// Muted, paper-friendly tones so the placeholders sit inside every template.
const TONES = [
  ['#C8B79A', '#A08F71'],
  ['#A9B8A6', '#7E8F7C'],
  ['#C3A9A2', '#9B7F79'],
  ['#A6B0C0', '#7C8798'],
  ['#CBBBA0', '#A3927A'],
  ['#B0A8BE', '#877E96'],
];

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** A 256px placeholder portrait: tinted ground, silhouette, initials. */
function avatarPNG(name, index) {
  const S = 256;
  const [bg, fg] = TONES[index % TONES.length];
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, bg);
  sky.addColorStop(1, fg);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, S, S);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath();
  ctx.arc(S / 2, S * 0.37, S * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(S / 2, S * 0.98, S * 0.29, S * 0.26, 0, Math.PI, 0);
  ctx.fill();

  // Between the head and the shoulders, so the circular portrait crop never clips it.
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 ${Math.round(S * 0.12)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials(name), S / 2, S * 0.62);

  return canvas.toDataURL('image/png');
}

/* ---------------------------------------------------------------- seed */

/** Walk the parsed tree, handing every person a placeholder portrait. */
function attachPortraits(root) {
  const photos = {};
  let i = 0;
  const give = (person) => {
    if (!person || !person.name) return;
    const ref = `/photos/demo-${String(i).padStart(2, '0')}.png`;
    photos[ref] = avatarPNG(person.name, i);
    person.photo = ref;
    i++;
  };
  const walk = (p) => {
    if (!p) return;
    give(p);
    if (p.spouse) give(p.spouse);
    (p.children || []).forEach(walk);
  };
  walk(root);
  return photos;
}

/**
 * Build the sample tree and store it. Callers decide when this is appropriate —
 * it always creates a new tree.
 */
export async function createDemoTree() {
  const root = parseOutline(OUTLINE);
  const photos = attachPortraits(root);
  await adoptPhotos(photos);
  return createTree({
    name: 'Holloway Family Tree',
    subtitle: 'Sample tree — edit it or delete it',
    template: 'heritage',
    layout: 'flow',
    maxCols: 6,
    root,
  });
}
