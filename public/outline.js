// Shared (server + browser) parser for indented text outlines.
//
//   MUHAMMED SHAH (Late) [1921] + KADEESHABI (Late) [1926]
//     SULEIKHA [1948] + ALAVI (Late)
//       SALEEM + SAMEENA
//         SAGIL RAHMAN + SHERIN
//
// Indentation = generation. " + " separates a person from their spouse.
// A trailing "(...)" is kept as a note, e.g. "(Late)", and a trailing "[...]" as a
// birth year — that's what an "eldest first" branch order sorts on.

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
  const parts = chunk.split(/\s+\+\s+/);
  const self = splitLabel(parts[0] || '');
  const person = {
    id: uid(),
    name: self.name,
    note: self.note,
    born: self.born,
    photo: null,
    spouse: null,
    children: [],
  };
  if (parts[1]) {
    const sp = splitLabel(parts[1]);
    person.spouse = { name: sp.name, note: sp.note, born: sp.born, photo: null };
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
  return root;
}

/** Render a person tree back out as an indented outline (round-trips parseOutline). */
export function toOutline(root) {
  const out = [];
  const label = (p) => p.name + (p.note ? ` (${p.note})` : '') + (p.born ? ` [${p.born}]` : '');
  const walk = (p, depth) => {
    let line = label(p);
    if (p.spouse && p.spouse.name) line += ' + ' + label(p.spouse);
    out.push('  '.repeat(depth) + line);
    (p.children || []).forEach((c) => walk(c, depth + 1));
  };
  if (root) walk(root, 0);
  return out.join('\n');
}
