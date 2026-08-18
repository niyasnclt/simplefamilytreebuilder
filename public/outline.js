// Shared (server + browser) parser for indented text outlines.
//
//   MUHAMMED SHAH (Late) [1921] + KADEESHABI (Late) [1926]
//     SULEIKHA [1948] + ALAVI (Late)
//       SALEEM + SAMEENA
//         SAGIL RAHMAN + SHERIN
//
// Indentation = generation. " + " separates a person from a spouse, and repeats
// for each further one: "ABDUL + FATIMA + RUQIYA". Where a parent has more than
// one marriage, a child names the other parent with a trailing " & ":
//
//   ABDUL + FATIMA + RUQIYA
//     OLIVER [1999] & FATIMA
//     IBRAHIM [1990] & RUQIYA
//
// A child with no " & " belongs to the parent rather than to any one marriage.
// A trailing "(...)" is kept as a note, e.g. "(Late)", and a trailing "[...]" as a
// birth year — that's what an "eldest first" branch order sorts on.

import { spousesOf } from './people.js';

export function uid() {
  return 'p' + Math.random().toString(36).slice(2, 10);
}

/** Peel a trailing "(note)" and "[born]" off a name, in either order. */
function splitLabel(raw) {
  let s = raw.trim();
  let note = '';
  let born = '';
  for (let i = 0; i < 2; i++) {
    const b = !born && s.match(/^(.*?)\s*\[([^[\]]*)\]$/);
    if (b) { born = b[2].trim(); s = b[1].trim(); continue; }
    const n = !note && s.match(/^(.*?)\s*\(([^()]*)\)$/);
    if (n) { note = n[2].trim(); s = n[1].trim(); continue; }
    break;
  }
  return { name: s, note, born };
}

function makePerson(chunk) {
  // The "& other parent" tag is peeled first so a child can carry both it and a
  // spouse of their own: "SALEEM + SAMEENA & FATIMA".
  const tagged = chunk.split(/\s+&\s+/);
  const withName = tagged.length > 1 ? tagged.pop().trim() : '';
  const parts = tagged.join(' & ').split(/\s+\+\s+/);
  const self = splitLabel(parts[0] || '');
  const spouses = parts.slice(1).map((part) => {
    const sp = splitLabel(part);
    return { name: sp.name, note: sp.note, born: sp.born, photo: null };
  });
  return {
    id: uid(),
    name: self.name,
    note: self.note,
    born: self.born,
    photo: null,
    // `spouse` is the pre-multi-spouse field; kept in step so older builds still read this.
    spouse: spouses[0] || null,
    spouses,
    // Resolved to a spouse id once the parent is known — see linkChildren().
    withName,
    with: null,
    children: [],
  };
}

/**
 * Turn each child's "& other parent" name into the id of one of the parent's
 * spouses. Names are matched case-insensitively; anything that doesn't match a
 * spouse is left unassigned rather than dropped.
 */
function linkChildren(person) {
  const spouses = spousesOf(person);
  const byName = new Map(spouses.map((s) => [String(s.name || '').trim().toLowerCase(), s]));
  for (const child of person.children) {
    const match = child.withName && byName.get(child.withName.toLowerCase());
    child.with = match ? match.id : null;
    delete child.withName;
    linkChildren(child);
  }
  return person;
}

/** Parse an indented outline into a root person node. Returns null if empty. */
export function parseOutline(text) {
  const rows = [];
  for (const line of String(text).replace(/\t/g, '  ').split('\n')) {
    if (!line.trim()) continue;
    rows.push({ indent: line.match(/^ */)[0].length, text: line.trim() });
  }
  if (!rows.length) return null;

  // Map raw indent widths onto 0,1,2,... levels so any indent size works.
  const levels = [...new Set(rows.map((r) => r.indent))].sort((a, b) => a - b);
  const levelOf = new Map(levels.map((v, i) => [v, i]));

  let root = null;
  const stack = []; // stack[level] = person at that level
  for (const row of rows) {
    const level = levelOf.get(row.indent);
    const person = makePerson(row.text);
    if (level === 0) {
      if (!root) {
        root = person;
      } else {
        // A second top-level line becomes a child of the root rather than being dropped.
        root.children.push(person);
      }
    } else {
      const parent = stack[level - 1];
      if (!parent) continue; // skipped a level; ignore the orphan
      parent.children.push(person);
    }
    stack[level] = person;
    stack.length = level + 1;
  }
  return root && linkChildren(root);
}

/** Render a person tree back out as an indented outline (round-trips parseOutline). */
export function toOutline(root) {
  const out = [];
  const label = (p) => p.name + (p.note ? ` (${p.note})` : '') + (p.born ? ` [${p.born}]` : '');
  const walk = (p, depth, otherParent) => {
    let line = label(p);
    const spouses = spousesOf(p);
    for (const s of spouses) if (s.name) line += ' + ' + label(s);
    // Only worth writing where there's a choice to record.
    if (otherParent) line += ' & ' + otherParent;
    out.push('  '.repeat(depth) + line);

    const byId = new Map(spouses.map((s) => [s.id, s]));
    for (const c of p.children || []) {
      const other = spouses.length > 1 && c.with ? byId.get(c.with) : null;
      walk(c, depth + 1, other && other.name ? other.name : '');
    }
  };
  if (root) walk(root, 0, '');
  return out.join('\n');
}
