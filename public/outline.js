// Shared (server + browser) parser for indented text outlines.
//
//   MUHAMMED SHAH (Late) + KADEESHABI (Late)
//     SULEIKHA + ALAVI (Late)
//       SALEEM + SAMEENA
//         SAGIL RAHMAN + SHERIN
//
// Indentation = generation. " + " separates a person from their spouse.
// A trailing "(...)" is kept as a note, e.g. "(Late)".

export function uid() {
  return 'p' + Math.random().toString(36).slice(2, 10);
}

function splitNote(raw) {
  const s = raw.trim();
  const m = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (m) return { name: m[1].trim(), note: m[2].trim() };
  return { name: s, note: '' };
}

function makePerson(chunk) {
  const parts = chunk.split(/\s+\+\s+/);
  const self = splitNote(parts[0] || '');
  const person = { id: uid(), name: self.name, note: self.note, photo: null, spouse: null, children: [] };
  if (parts[1]) {
    const sp = splitNote(parts[1]);
    person.spouse = { name: sp.name, note: sp.note, photo: null };
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
  const label = (p) => (p.note ? `${p.name} (${p.note})` : p.name);
  const walk = (p, depth) => {
    let line = label(p);
    if (p.spouse && p.spouse.name) line += ' + ' + label(p.spouse);
    out.push('  '.repeat(depth) + line);
    (p.children || []).forEach((c) => walk(c, depth + 1));
  };
  if (root) walk(root, 0);
  return out.join('\n');
}
