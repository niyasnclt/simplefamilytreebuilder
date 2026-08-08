// Layout engine.
//
// Two arrangements, both left→right like the reference PDF:
//
//   'flow'        Each branch of the family gets a horizontal band. Within a band,
//                 anyone who continues the tree chains rightward, one column each,
//                 wrapping to a new indented band past `maxCols`. Compact and
//                 landscape — this is how the reference artwork is arranged.
//
//   'generations' One column per generation, strictly. Siblings stack vertically.
//                 Taller, but every column is exactly one generation deep.
//
// In both, a couple is drawn as a pair of portraits, and children with no
// descendants of their own hang in a row directly below their parents.
//
// Name text is wrapped here (not in the renderer) so the space reserved for a
// name and the space it actually occupies are always the same.

import { wrapToWidth, approxWidth, LINE_H } from './text.js';

export const M = {
  headPhoto: 78,
  leafPhoto: 62,
  coupleGap: 24, // gap between the two portraits of a couple
  headFS: 12.5,
  leafFS: 11,
  headNameGap: 10, // head portrait top → last name line
  leafNameGap: 6, // leaf portrait bottom → first name line
  colGap: 108, // between generation columns ('generations')
  flowGap: 74, // between columns ('flow')
  sibGap: 46, // between sibling blocks / bands
  leafGap: 34, // between leaf children
  leafDrop: 66, // head portrait bottom → leaf portrait top
  leafRowGap: 26,
  laneDrop: 20, // head portrait bottom → sibling connector lane
  maxLeafPerRow: 4,
  pad: 64,
};

export const hasKids = (p) => !!(p && p.children && p.children.length);
const hasSpouse = (p) => !!(p && p.spouse && (p.spouse.name || p.spouse.photo));
const branchesOf = (p) => (p.children || []).filter(hasKids);
const leavesOf = (p) => (p.children || []).filter((k) => !hasKids(k));
const coupleWidth = (p, d) => (hasSpouse(p) ? d * 2 + M.coupleGap : d);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ------------------------------------------------------- text measuring */

/** How wide a single name may run before it would touch its neighbour. */
function nameBudget(person, d) {
  return hasSpouse(person) ? d + M.coupleGap - 8 : d + M.leafGap - 8;
}

/**
 * Wrap one label and decide whether its "(note)" fits on the last line or needs
 * a line of its own. `rows` is the total vertical space the label occupies.
 */
function labelFor(name, note, budget, baseFS, cfg) {
  const text = cfg.upper ? String(name || '').toUpperCase() : String(name || '');
  const lines = wrapToWidth(text, budget, baseFS, cfg.tracking, cfg.serif, 3);

  // A single word longer than the budget can't be wrapped, so shrink it instead.
  // Guarantees neighbouring names never collide, whatever gets typed.
  const widest = lines.reduce((a, l) => Math.max(a, approxWidth(l, baseFS, cfg.tracking, cfg.serif)), 1);
  const fs = baseFS * Math.max(0.74, Math.min(1, budget / widest));

  let noteInline = true;
  if (note) {
    const last = approxWidth(lines[lines.length - 1], fs, cfg.tracking, cfg.serif);
    const extra = approxWidth(` (${note})`, fs - 2.5, 0, cfg.serif);
    noteInline = last + extra <= budget;
  }
  return { lines, noteInline, fs, rows: lines.length + (note && !noteInline ? 1 : 0) };
}

function nameLines(person, d, fs, cfg) {
  const budget = nameBudget(person, d);
  return {
    self: labelFor(person.name, person.note, budget, fs, cfg),
    spouse: hasSpouse(person) ? labelFor(person.spouse.name, person.spouse.note, budget, fs, cfg) : null,
  };
}

const lineCount = (l) => Math.max(l.self.rows, l.spouse ? l.spouse.rows : 0);

/* --------------------------------------------------- per-person metrics */

/** Size of one person's own card: the couple portraits plus any leaf-child rows. */
function unitMetrics(node, cfg) {
  const headW = coupleWidth(node, M.headPhoto);
  const headLines = nameLines(node, M.headPhoto, M.headFS, cfg);
  const headNameH = lineCount(headLines) * LINE_H + M.headNameGap;

  const rows = chunk(leavesOf(node), M.maxLeafPerRow).map((row) => {
    const items = row.map((p) => ({
      person: p,
      w: coupleWidth(p, M.leafPhoto),
      lines: nameLines(p, M.leafPhoto, M.leafFS, cfg),
    }));
    return {
      items,
      w: items.reduce((a, i) => a + i.w, 0) + M.leafGap * (items.length - 1),
      nameH: items.reduce((a, i) => Math.max(a, lineCount(i.lines)), 1) * LINE_H + M.leafNameGap,
    };
  });

  const leafBlockH = rows.length
    ? M.leafDrop +
      rows.reduce((a, r) => a + M.leafPhoto + r.nameH, 0) +
      (rows.length - 1) * M.leafRowGap
    : 0;
  const leafBlockW = rows.reduce((a, r) => Math.max(a, r.w), 0);

  return {
    headW,
    headLines,
    headNameH,
    rows,
    leafBlockH,
    leafBlockW,
    unitW: Math.max(headW, leafBlockW),
    selfH: headNameH + M.headPhoto + leafBlockH,
  };
}

function annotate(node, cfg) {
  node._u = unitMetrics(node, cfg);
  (node.children || []).forEach((c) => annotate(c, cfg));
  return node;
}

/* ------------------------------------------------------------ emitters */

function emitCouple(out, person, x, y, d, kind, lines) {
  const below = kind === 'leaf';
  out.nodes.push({
    key: person.id,
    ref: { id: person.id, side: 'self' },
    name: person.name,
    note: person.note,
    photo: person.photo,
    photoFit: person.photoFit,
    lines: lines.self.lines,
    noteInline: lines.self.noteInline,
    rows: lines.self.rows,
    fs: lines.self.fs,
    x, y, d, kind, nameBelow: below,
  });
  if (hasSpouse(person)) {
    const sx = x + d + M.coupleGap;
    out.nodes.push({
      key: person.id + ':spouse',
      ref: { id: person.id, side: 'spouse' },
      name: person.spouse.name,
      note: person.spouse.note,
      photo: person.spouse.photo,
      photoFit: person.spouse.photoFit,
      lines: lines.spouse ? lines.spouse.lines : [''],
      noteInline: lines.spouse ? lines.spouse.noteInline : true,
      rows: lines.spouse ? lines.spouse.rows : 1,
      fs: lines.spouse ? lines.spouse.fs : M.headFS,
      x: sx, y, d, kind, nameBelow: below,
    });
    out.edges.push(`M ${x + d} ${y + d / 2} H ${sx}`);
  }
}

/** Draw a person's leaf children hanging in rows below their portrait. */
function emitLeaves(out, node, unitCX, headBottom) {
  const u = node._u;
  if (!u.rows.length) return;
  let rowTop = headBottom + M.leafDrop;
  let lastBusY = headBottom;
  for (const row of u.rows) {
    const busY = rowTop - M.leafDrop / 2;
    let cx = unitCX - row.w / 2;
    const centers = [];
    for (const item of row.items) {
      emitCouple(out, item.person, cx, rowTop, M.leafPhoto, 'leaf', item.lines);
      centers.push(cx + item.w / 2);
      cx += item.w + M.leafGap;
    }
    out.edges.push(`M ${Math.min(unitCX, ...centers)} ${busY} H ${Math.max(unitCX, ...centers)}`);
    for (const c of centers) out.edges.push(`M ${c} ${busY} V ${rowTop}`);
    lastBusY = busY;
    rowTop += M.leafPhoto + row.nameH + M.leafRowGap;
  }
  out.edges.push(`M ${unitCX} ${headBottom} V ${lastBusY}`);
}

/* -------------------------------------------------------- mode: 'flow' */

function layoutFlow(root, maxCols) {
  const bands = [];
  const newBand = () => (bands.push({ items: [] }), bands.length - 1);

  // Each branch of the family gets its own band, as in the reference artwork.
  const topBranches = branchesOf(root);
  for (const child of topBranches) chain(child, 1, newBand());

  function chain(node, col, band) {
    bands[band].items.push({ node, col });
    let cur = col + 1;
    let b = band;
    for (const child of branchesOf(node)) {
      if (cur > maxCols) { b = newBand(); cur = col + 1; }
      const end = chain(child, cur, b);
      b = end.band;
      cur = end.nextCol;
    }
    return { band: b, nextCol: cur };
  }

  // Uniform column grid, wide enough for the widest card anywhere in the tree.
  let widest = root._u.unitW;
  for (const band of bands) for (const it of band.items) widest = Math.max(widest, it.node._u.unitW);
  const colStep = widest + M.flowGap;
  const colCX = (col) => M.pad + col * colStep + widest / 2;

  let y = M.pad;
  for (const band of bands) {
    band.top = y;
    band.h = band.items.reduce((a, it) => Math.max(a, it.node._u.selfH), 1);
    y += band.h + M.sibGap;
  }
  const bandsBottom = bands.length ? y - M.sibGap : M.pad + root._u.selfH;

  const out = { nodes: [], edges: [] };
  const pos = new Map();

  const placeUnit = (node, col, top) => {
    const u = node._u;
    const cx = colCX(col);
    const headX = cx - u.headW / 2;
    const headY = top + u.headNameH;
    emitCouple(out, node, headX, headY, M.headPhoto, 'head', u.headLines);
    emitLeaves(out, node, cx, headY + M.headPhoto);
    const geo = { cx, headX, headY, right: headX + u.headW, cy: headY + M.headPhoto / 2, bottom: headY + M.headPhoto, col };
    pos.set(node, geo);
    return geo;
  };

  for (const band of bands) for (const it of band.items) placeUnit(it.node, it.col, band.top);

  // Root sits alone in column 0, vertically centred against every band.
  const rootGeo = placeUnit(root, 0, (M.pad + bandsBottom) / 2 - root._u.selfH / 2);

  // Root → each band's first person, via one shared vertical spine.
  const spineX = M.pad + colStep - M.flowGap / 2;
  const heads = topBranches.map((c) => pos.get(c)).filter(Boolean);
  if (heads.length) {
    out.edges.push(`M ${rootGeo.right} ${rootGeo.cy} H ${spineX}`);
    const lo = Math.min(rootGeo.cy, ...heads.map((h) => h.cy));
    const hi = Math.max(rootGeo.cy, ...heads.map((h) => h.cy));
    if (hi - lo > 0.5) out.edges.push(`M ${spineX} ${lo} V ${hi}`);
    for (const h of heads) out.edges.push(`M ${spineX} ${h.cy} H ${h.headX}`);
  }

  // Everyone else → their branch children.
  for (const band of bands) {
    for (const it of band.items) {
      const p = pos.get(it.node);
      for (const child of branchesOf(it.node)) {
        const c = pos.get(child);
        if (!c) continue;
        const sameRow = Math.abs(c.cy - p.cy) < 0.5;
        if (sameRow && c.col === p.col + 1) {
          out.edges.push(`M ${p.right} ${p.cy} H ${c.headX}`);
        } else if (sameRow) {
          // Further right on the same band: thread beneath the portraits between.
          const lane = p.bottom + M.laneDrop;
          const upX = c.headX - M.flowGap / 2;
          out.edges.push(`M ${p.cx} ${p.bottom} V ${lane}`);
          out.edges.push(`M ${p.cx} ${lane} H ${upX}`);
          out.edges.push(`M ${upX} ${lane} V ${c.cy}`);
          out.edges.push(`M ${upX} ${c.cy} H ${c.headX}`);
        } else {
          // Wrapped to a band below; that band is empty left of the child.
          out.edges.push(`M ${p.cx} ${p.bottom} V ${c.cy}`);
          out.edges.push(`M ${p.cx} ${c.cy} H ${c.headX}`);
        }
      }
    }
  }

  return out;
}

/* ------------------------------------------------- mode: 'generations' */

function measureGen(node) {
  const u = node._u;
  const branches = branchesOf(node);
  const childBlocks = branches.map(measureGen);
  const childrenH = childBlocks.length
    ? childBlocks.reduce((a, c) => a + c._g.h, 0) + M.sibGap * (childBlocks.length - 1)
    : 0;
  const childrenW = childBlocks.reduce((a, c) => Math.max(a, c._g.w), 0);
  node._g = {
    branches,
    childrenH,
    w: u.unitW + (branches.length ? M.colGap + childrenW : 0),
    h: Math.max(u.selfH, childrenH),
  };
  return node;
}

function placeGen(node, x, y, out) {
  const u = node._u;
  const g = node._g;
  const selfY = y + (g.h - u.selfH) / 2;
  const cx = x + u.unitW / 2;
  const headX = cx - u.headW / 2;
  const headY = selfY + u.headNameH;

  emitCouple(out, node, headX, headY, M.headPhoto, 'head', u.headLines);
  emitLeaves(out, node, cx, headY + M.headPhoto);
  if (!g.branches.length) return;

  const colX = x + u.unitW + M.colGap;
  const spineX = colX - M.colGap / 2;
  const headCY = headY + M.headPhoto / 2;
  let cy = y + (g.h - g.childrenH) / 2;
  const joins = [];

  for (const child of g.branches) {
    const cu = child._u;
    const childCX = colX + cu.unitW / 2;
    const childCY = cy + (child._g.h - cu.selfH) / 2 + cu.headNameH + M.headPhoto / 2;
    joins.push({ x: childCX - cu.headW / 2, y: childCY });
    placeGen(child, colX, cy, out);
    cy += child._g.h + M.sibGap;
  }

  out.edges.push(`M ${headX + u.headW} ${headCY} H ${spineX}`);
  const lo = Math.min(headCY, ...joins.map((j) => j.y));
  const hi = Math.max(headCY, ...joins.map((j) => j.y));
  if (hi - lo > 0.5) out.edges.push(`M ${spineX} ${lo} V ${hi}`);
  for (const j of joins) out.edges.push(`M ${spineX} ${j.y} H ${j.x}`);
}

/* ---------------------------------------------------------------- public */

/**
 * @param {object} root
 * @param {{mode?:'flow'|'generations', maxCols?:number, tracking?:number, serif?:boolean, upper?:boolean}} opts
 */
export function layoutTree(root, opts = {}) {
  const out = { nodes: [], edges: [], width: 200, height: 200 };
  if (!root) return out;

  const cfg = {
    tracking: opts.tracking ?? 0.9,
    serif: !!opts.serif,
    upper: opts.upper !== false,
  };
  annotate(root, cfg);

  if (opts.mode === 'generations') {
    measureGen(root);
    placeGen(root, M.pad, M.pad, out);
  } else {
    const flow = layoutFlow(root, Math.max(2, opts.maxCols | 0 || 6));
    out.nodes = flow.nodes;
    out.edges = flow.edges;
  }
  return normalise(out);
}

/** Shift everything to a uniform padding and report the true ink bounds. */
function normalise(out) {
  if (!out.nodes.length) return out;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of out.nodes) {
    const nameH = (n.rows || n.lines.length) * LINE_H;
    minX = Math.min(minX, n.x - M.leafGap / 2);
    maxX = Math.max(maxX, n.x + n.d + M.leafGap / 2);
    minY = Math.min(minY, n.nameBelow ? n.y : n.y - nameH - M.headNameGap);
    maxY = Math.max(maxY, n.y + n.d + (n.nameBelow ? nameH + M.leafNameGap : 0));
  }
  const dx = M.pad - minX;
  const dy = M.pad - minY;
  if (dx || dy) {
    for (const n of out.nodes) { n.x += dx; n.y += dy; }
    out.edges = out.edges.map((d) => shiftPath(d, dx, dy));
  }
  out.width = Math.round(maxX - minX + M.pad * 2);
  out.height = Math.round(maxY - minY + M.pad * 2);
  return out;
}

// Paths here are only ever "M x y H x" or "M x y V y".
function shiftPath(d, dx, dy) {
  const t = d.split(' ');
  t[1] = +t[1] + dx;
  t[2] = +t[2] + dy;
  if (t[3] === 'H') t[4] = +t[4] + dx;
  if (t[3] === 'V') t[4] = +t[4] + dy;
  return t.join(' ');
}
