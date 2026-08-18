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
// In both, a person is drawn beside their spouses — one portrait each, joined
// left to right by a marriage bar — and children with no descendants of their
// own hang in a row directly below.
//
// Name text is wrapped here (not in the renderer) so the space reserved for a
// name and the space it actually occupies are always the same.

import { wrapToWidth, approxWidth, LINE_H } from './text.js';
import { drawnSpouses, groupChildren } from './people.js';

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
  laneStep: 16, // between the lanes of one person's separate marriages
  maxLeafPerRow: 4,
  pad: 64,
};

export const hasKids = (p) => !!(p && p.children && p.children.length);
const spousesFor = (p) => (p ? drawnSpouses(p) : []);
const hasSpouse = (p) => spousesFor(p).length > 0;
const branchesOf = (p) => (p.children || []).filter(hasKids);
const leavesOf = (p) => (p.children || []).filter((k) => !hasKids(k));

/** Width of a person plus every spouse standing beside them. */
function coupleWidth(p, d) {
  const n = spousesFor(p).length;
  return d * (n + 1) + M.coupleGap * n;
}

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
    spouses: spousesFor(person).map(({ spouse, index }) => ({
      index,
      spouse,
      label: labelFor(spouse.name, spouse.note, budget, fs, cfg),
    })),
  };
}

// Everyone in a row shares one name block, so it's as tall as the longest name in it.
const lineCount = (l) => Math.max(l.self.rows, ...l.spouses.map((s) => s.label.rows));

/* --------------------------------------------------- per-person metrics */

/** Size of one person's own card: the portrait row plus any leaf-child blocks. */
function unitMetrics(node, cfg) {
  const headW = coupleWidth(node, M.headPhoto);
  const headLines = nameLines(node, M.headPhoto, M.headFS, cfg);
  const headNameH = lineCount(headLines) * LINE_H + M.headNameGap;

  const measure = (children, pos) => {
    const rows = chunk(children, M.maxLeafPerRow).map((row) => {
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
    return {
      pos, // which marriage this block hangs from, or null for children with none set
      rows,
      w: rows.reduce((a, r) => Math.max(a, r.w), 0),
      h: rows.reduce((a, r) => a + M.leafPhoto + r.nameH, 0) + (rows.length - 1) * M.leafRowGap,
    };
  };

  // One block per marriage, side by side in the order the spouses stand in.
  // Below two marriages there's nothing to tell apart, so the children stay in a
  // single block and the drawing is exactly what it was before any of this.
  const leaves = leavesOf(node);
  const split =
    spousesFor(node).length > 1
      ? groupChildren(node, leaves)
      : { groups: [], loose: leaves };
  const blocks = [
    ...split.groups.map((g) => ({ children: g.children, pos: g.pos })),
    { children: split.loose, pos: null },
  ]
    .filter((b) => b.children.length)
    .map((b) => measure(b.children, b.pos));

  // Each block reaches its children along a lane of its own, so several marriages
  // need the children pushed far enough down to stack those lanes without merging.
  const dropH =
    blocks.length > 1
      ? Math.max(M.leafDrop, (M.laneDrop + (blocks.length - 1) * M.laneStep + 12) * 2)
      : M.leafDrop;

  const leafBlockH = blocks.length ? dropH + Math.max(...blocks.map((b) => b.h)) : 0;
  const leafBlockW = blocks.length
    ? blocks.reduce((a, b) => a + b.w, 0) + (blocks.length - 1) * M.sibGap
    : 0;

  return {
    headW,
    headLines,
    headNameH,
    blocks,
    dropH,
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
  const put = (px, key, side, who, label) =>
    out.nodes.push({
      key,
      ref: { id: person.id, side },
      name: who.name,
      note: who.note,
      photo: who.photo,
      photoFit: who.photoFit,
      lines: label.lines,
      noteInline: label.noteInline,
      rows: label.rows,
      fs: label.fs,
      x: px, y, d, kind, nameBelow: below,
    });

  put(x, person.id, 'self', person, lines.self);

  // Spouses run rightward, each joined to the portrait before it by its own bar
  // rather than one line spanning the row — a shared bar would have to cross the
  // portraits in between.
  let prevRight = x + d;
  for (const { index, spouse, label } of lines.spouses) {
    const sx = prevRight + M.coupleGap;
    put(sx, `${person.id}:spouse:${index}`, `spouse:${index}`, spouse, label);
    out.edges.push(`M ${prevRight} ${y + d / 2} H ${sx}`);
    prevRight = sx + d;
  }
}

/**
 * Draw a person's leaf children hanging in rows below the portrait row.
 *
 * Each marriage gets its own block, and the block's line comes down from the
 * middle of that marriage's link rather than from the top of a portrait —
 * otherwise it stops in the gap between two people and reads as unattached.
 *
 * A block is rarely narrow enough to sit directly under its own link, so where
 * it can't, the line drops to a lane below the portraits and runs across, the
 * same way branch connectors thread past the columns between them.
 */
function emitLeaves(out, node, unitCX, headX, headY) {
  const u = node._u;
  if (!u.blocks.length) return;
  const headBottom = headY + M.headPhoto;
  const paired = coupleWidth(node, M.headPhoto) > M.headPhoto;

  // The link each block hangs from: portrait `pos + 1` is that spouse, so theirs
  // sits in the gap before it. Children of no particular marriage hang from the
  // middle of the whole row.
  const anchorOf = (block) =>
    block.pos == null
      ? unitCX
      : headX + block.pos * (M.headPhoto + M.coupleGap) + M.headPhoto + M.coupleGap / 2;

  // Blocks run left to right in the order their links do — otherwise one block's
  // reach can straddle another's, and the two connectors have to cross.
  const placed = u.blocks
    .map((block) => ({ block, anchorX: anchorOf(block) }))
    .sort((a, b) => a.anchorX - b.anchorX);

  let runX = unitCX - u.leafBlockW / 2;
  placed.forEach((p, i) => {
    p.blockCX = runX + p.block.w / 2;
    p.laneY = headBottom + M.laneDrop + i * M.laneStep;
    runX += p.block.w + M.sibGap;
  });

  for (const { block, blockCX, anchorX, laneY } of placed) {
    let rowTop = headBottom + u.dropH;
    let lastBusY = headBottom;

    for (const row of block.rows) {
      const busY = rowTop - u.dropH / 2;
      let cx = blockCX - row.w / 2;
      const joins = [];
      for (const item of row.items) {
        emitCouple(out, item.person, cx, rowTop, M.leafPhoto, 'leaf', item.lines);
        const itemPaired = item.w > M.leafPhoto;
        joins.push({ x: cx + item.w / 2, y: rowTop + (itemPaired ? M.leafPhoto / 2 : 0) });
        cx += item.w + M.leafGap;
      }
      const xs = joins.map((j) => j.x);
      out.edges.push(`M ${Math.min(blockCX, ...xs)} ${busY} H ${Math.max(blockCX, ...xs)}`);
      for (const j of joins) out.edges.push(`M ${j.x} ${busY} V ${j.y}`);
      lastBusY = busY;
      rowTop += M.leafPhoto + row.nameH + M.leafRowGap;
    }

    const from = paired ? headY + M.headPhoto / 2 : headBottom;

    if (Math.abs(anchorX - blockCX) < 0.5) {
      out.edges.push(`M ${anchorX} ${from} V ${lastBusY}`);
    } else {
      out.edges.push(`M ${anchorX} ${from} V ${laneY}`);
      out.edges.push(`M ${anchorX} ${laneY} H ${blockCX}`);
      out.edges.push(`M ${blockCX} ${laneY} V ${lastBusY}`);
    }
  }
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

  // Everyone in a band shares one portrait centre line, whatever their names
  // wrapped to — otherwise a two-line name shunts its portrait down and the
  // connector to it has to detour round the offset.
  let y = M.pad;
  for (const band of bands) {
    band.top = y;
    band.nameH = band.items.reduce((a, it) => Math.max(a, it.node._u.headNameH), 0);
    band.h = band.items.reduce(
      (a, it) => Math.max(a, band.nameH + M.headPhoto + it.node._u.leafBlockH),
      1
    );
    y += band.h + M.sibGap;
  }
  const bandsBottom = bands.length ? y - M.sibGap : M.pad + root._u.selfH;

  const out = { nodes: [], edges: [] };
  const pos = new Map();

  const placeUnit = (node, col, top, nameH) => {
    const u = node._u;
    const cx = colCX(col);
    const headX = cx - u.headW / 2;
    const headY = top + (nameH == null ? u.headNameH : nameH);
    emitCouple(out, node, headX, headY, M.headPhoto, 'head', u.headLines);
    emitLeaves(out, node, cx, headX, headY);
    const geo = { cx, headX, headY, right: headX + u.headW, cy: headY + M.headPhoto / 2, bottom: headY + M.headPhoto, col };
    pos.set(node, geo);
    return geo;
  };

  for (const band of bands) for (const it of band.items) placeUnit(it.node, it.col, band.top, band.nameH);

  // Root sits alone in column 0, level with the middle of the branches it feeds —
  // measured portrait-centre to portrait-centre, so a single branch gives a
  // straight line instead of a kink.
  const heads = topBranches.map((c) => pos.get(c)).filter(Boolean);
  const rootCY = heads.length
    ? (Math.min(...heads.map((h) => h.cy)) + Math.max(...heads.map((h) => h.cy))) / 2
    : (M.pad + bandsBottom) / 2 - root._u.selfH / 2 + root._u.headNameH + M.headPhoto / 2;
  const rootGeo = placeUnit(root, 0, rootCY - M.headPhoto / 2 - root._u.headNameH);

  // Root → each band's first person, via one shared vertical spine.
  const spineX = M.pad + colStep - M.flowGap / 2;
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

/** Place a subtree with its block starting at (x, y); reports where its portrait landed. */
function placeGen(node, x, y, out) {
  const u = node._u;
  const g = node._g;
  const cx = x + u.unitW / 2;
  const headX = cx - u.headW / 2;

  const draw = (headY) => {
    emitCouple(out, node, headX, headY, M.headPhoto, 'head', u.headLines);
    emitLeaves(out, node, cx, headX, headY);
    return { x: headX, right: headX + u.headW, y: headY + M.headPhoto / 2 };
  };

  if (!g.branches.length) return draw(y + (g.h - u.selfH) / 2 + u.headNameH);

  // Children first: a parent is levelled against where its children actually
  // sit, so one child always gives a straight connector.
  const colX = x + u.unitW + M.colGap;
  let cy = y + (g.h - g.childrenH) / 2;
  const joins = [];
  for (const child of g.branches) {
    joins.push(placeGen(child, colX, cy, out));
    cy += child._g.h + M.sibGap;
  }

  const mid = (joins[0].y + joins[joins.length - 1].y) / 2;
  const minCY = y + u.headNameH + M.headPhoto / 2; // names above must stay inside the box
  const maxCY = y + g.h - u.leafBlockH - M.headPhoto / 2; // as must any leaf children below
  const headCY = Math.max(minCY, Math.min(maxCY, mid));
  const self = draw(headCY - M.headPhoto / 2);

  const spineX = colX - M.colGap / 2;
  out.edges.push(`M ${self.right} ${headCY} H ${spineX}`);
  const lo = Math.min(headCY, ...joins.map((j) => j.y));
  const hi = Math.max(headCY, ...joins.map((j) => j.y));
  if (hi - lo > 0.5) out.edges.push(`M ${spineX} ${lo} V ${hi}`);
  for (const j of joins) out.edges.push(`M ${spineX} ${j.y} H ${j.x}`);
  return self;
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
