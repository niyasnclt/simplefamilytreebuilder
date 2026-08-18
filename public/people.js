/**
 * Spouses.
 *
 * A person can have several, so the canonical field is `spouses` — an array in
 * marriage order, drawn left to right beside them.
 *
 * Trees written before that carry a single `spouse` object instead. Rather than
 * migrate the database, every read goes through `spousesOf()` and every write
 * through `setSpouses()`, which mirrors the first spouse back onto `spouse` so a
 * tree exported from here still opens in an older build.
 */

const sid = () => 's' + Math.random().toString(36).slice(2, 10);

export function blankSpouse() {
  return { id: sid(), name: '', note: '', born: '', photo: null };
}

/**
 * Children name the marriage they belong to by spouse id, so every spouse needs
 * one — including those in trees written before ids existed. Stamping them on
 * read means the id is in place by the time anything asks which marriage a child
 * came from, and it saves with the next edit.
 */
function withIds(list) {
  for (const s of list) if (s && !s.id) s.id = sid();
  return list;
}

/** A person's spouses in order. Always a real array, and live — edits stick. */
export function spousesOf(person) {
  if (!person) return [];
  if (Array.isArray(person.spouses)) return withIds(person.spouses);
  return person.spouse ? withIds([person.spouse]) : [];
}

/**
 * The spouses worth drawing, each paired with its index in the editable list. A
 * row someone added but never filled in takes up no space on the canvas, so the
 * two lists differ — carrying the index keeps selection and editing in step.
 */
export function drawnSpouses(person) {
  return spousesOf(person)
    .map((spouse, index) => ({ spouse, index }))
    .filter(({ spouse }) => spouse && (spouse.name || spouse.photo))
    .map((entry, pos) => ({ ...entry, pos })); // pos = which portrait in the row
}

/**
 * Split children by the marriage they belong to. A child names its other parent
 * in `with`; anything unmatched lands in `loose` and hangs off the person as a
 * whole — which is what every child in a tree written before this did.
 */
export function groupChildren(person, children) {
  const groups = drawnSpouses(person).map((entry) => ({ ...entry, children: [] }));
  const byId = new Map(groups.map((g) => [g.spouse.id, g]));
  const loose = [];
  for (const child of children || []) {
    const group = child.with ? byId.get(child.with) : null;
    (group ? group.children : loose).push(child);
  }
  return { groups, loose };
}

/** Cut children loose from a marriage that no longer exists. */
export function forgetSpouse(person, spouseId) {
  if (!spouseId) return;
  for (const child of person.children || []) if (child.with === spouseId) child.with = null;
}

export const spouseCount = (person) => drawnSpouses(person).length;

/** Replace the list, keeping the legacy `spouse` field in step. */
export function setSpouses(person, list) {
  person.spouses = list;
  person.spouse = list.length ? list[0] : null;
  return person;
}

/** Every spouse of every person in a branch, for photo sweeps and counts. */
export function eachSpouse(node, fn) {
  if (!node) return;
  for (const spouse of spousesOf(node)) fn(spouse, node);
  for (const child of node.children || []) eachSpouse(child, fn);
}
