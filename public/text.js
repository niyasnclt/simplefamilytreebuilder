// Shared text metrics. The layout engine reserves space using these numbers and
// the renderer draws the exact same lines, so the two can never disagree.

export const LINE_H = 13.5;

// Per-character advance widths in ems, measured from the two font stacks the
// templates use (semibold). A single average ratio was not accurate enough —
// "MUHAMMED" is ~25% wider per character than "JENNA", which is the difference
// between a tidy label and two names colliding.
const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ.,'-0123456789abcdefghijklmnopqrstuvwxyz";

// prettier-ignore
const SANS = [0.28,0.69,0.70,0.74,0.74,0.65,0.59,0.76,0.74,0.30,0.56,0.72,0.59,0.91,0.74,0.78,0.67,0.78,0.72,0.65,0.61,0.74,0.63,0.94,0.67,0.67,0.65,0.28,0.28,0.28,0.41,0.56,0.56,0.56,0.56,0.56,0.56,0.56,0.56,0.56,0.56,0.57,0.61,0.57,0.61,0.57,0.33,0.61,0.59,0.26,0.28,0.57,0.26,0.91,0.59,0.61,0.61,0.61,0.39,0.54,0.35,0.59,0.52,0.81,0.54,0.52,0.52];
// prettier-ignore
const SERIF = [0.25,0.76,0.76,0.72,0.83,0.72,0.67,0.81,0.91,0.45,0.60,0.82,0.69,1.02,0.84,0.82,0.70,0.82,0.80,0.65,0.68,0.83,0.76,1.13,0.81,0.73,0.69,0.33,0.33,0.27,0.38,0.70,0.49,0.63,0.62,0.65,0.60,0.65,0.55,0.68,0.65,0.60,0.65,0.53,0.66,0.57,0.39,0.58,0.68,0.35,0.35,0.63,0.34,1.02,0.69,0.64,0.66,0.65,0.52,0.51,0.40,0.68,0.57,0.86,0.59,0.56,0.53];

const INDEX = new Map([...CHARS].map((ch, i) => [ch, i]));
const FALLBACK = { sans: 0.78, serif: 0.86 }; // accented / non-Latin letters

export function approxWidth(text, fontSize, tracking, serif) {
  const table = serif ? SERIF : SANS;
  const fallback = serif ? FALLBACK.serif : FALLBACK.sans;
  let em = 0;
  for (const ch of String(text || '')) {
    const i = INDEX.get(ch);
    em += i === undefined ? fallback : table[i];
  }
  return em * fontSize + [...String(text || '')].length * tracking;
}

/**
 * Greedy wrap to a pixel budget. Words wider than the budget are kept whole
 * (a name reads better slightly wide than hyphenated), and anything past
 * `maxLines` is folded into the last line with an ellipsis.
 */
export function wrapToWidth(text, budget, fontSize, tracking, serif, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const fits = (s) => approxWidth(s, fontSize, tracking, serif) <= budget;

  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (fits(cur + ' ' + w)) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  lines.push(cur);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines - 1);
    let tail = lines.slice(maxLines - 1).join(' ');
    while (tail.length > 4 && !fits(tail + '…')) tail = tail.slice(0, -1);
    kept.push(tail + '…');
    return kept;
  }
  return lines;
}
