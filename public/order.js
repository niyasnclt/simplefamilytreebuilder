/**
 * Sibling order.
 *
 * A tree carries an `order` of 'manual' (whatever arrangement was dragged into place),
 * 'elder' (oldest sibling first) or 'younger'. An automatic order is written back into
 * the stored `children` arrays rather than applied at draw time, so the structure list,
 * the canvas and an exported outline always agree on who comes first.
 *
 * Ordering reads a person's `born` field. Anyone without one keeps their manual position,
 * after the dated siblings — a blank year should never shuffle a branch to the top.
 */

export const AUTO_ORDERS = ['elder', 'younger'];

export const isAuto = (order) => AUTO_ORDERS.includes(order);

export const ORDER_LABEL = {
  manual: 'Manual',
  elder: 'Eldest first',
  younger: 'Youngest first',
};

/**
 * Sortable number for a birth string. Accepts a bare year ("1948"), a year-first date
 * ("1948-03-12", "1948/3"), or any text that carries a four-digit year ("b. 1948").
 * Returns null when there's nothing to sort by.
 */
export function birthValue(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;

  const parts = s.match(/^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?$/);
  if (parts) {
    const year = +parts[1];
    const month = parts[2] ? +parts[2] : 0;
    const day = parts[3] ? +parts[3] : 0;
    if (month > 12 || day > 31) return year;
    // Divisors sit above the real maximums so a date can never spill into the next year.
    return year + month / 13 + day / 500;
  }

  const loose = s.match(/\b(1\d{3}|2\d{3})\b/);
  return loose ? +loose[1] : null;
}

/** What a person is ordered by, or null if their birth year is unknown. */
export const personBirth = (p) => birthValue(p && p.born);

/** A copy of `children` in the requested order. Undated people keep their relative order, last. */
export function sortSiblings(children, order) {
  if (!isAuto(order) || !children || children.length < 2) return children || [];
  const dir = order === 'elder' ? 1 : -1;
  return children
    .map((child, i) => ({ child, i, v: personBirth(child) }))
    .sort((a, b) => {
      if (a.v == null || b.v == null) return (a.v == null) - (b.v == null) || a.i - b.i;
      return (a.v - b.v) * dir || a.i - b.i;
    })
    .map((e) => e.child);
}

/** Reorder one person's children in place. Returns true if anything actually moved. */
export function sortChildren(node, order) {
  const kids = (node && node.children) || [];
  if (kids.length < 2) return false;
  const sorted = sortSiblings(kids, order);
  if (sorted.every((c, i) => c === kids[i])) return false;
  node.children = sorted;
  return true;
}

/** Reorder every level below `node` in place. Returns true if anything actually moved. */
export function sortBranch(node, order) {
  if (!node || !isAuto(order)) return false;
  let moved = sortChildren(node, order);
  for (const child of node.children || []) moved = sortBranch(child, order) || moved;
  return moved;
}

/** How many people in a branch have no birth year — the ones an automatic order can't place. */
export function countUndated(node, includeSelf = false) {
  if (!node) return 0;
  let n = includeSelf && personBirth(node) == null ? 1 : 0;
  for (const child of node.children || []) n += countUndated(child, true);
  return n;
}
