import {
  renderSVG, fitRect, normalizeFit, isDefaultFit, containZoom, photoMatte,
  DEFAULT_FIT, MAX_ZOOM, MIN_ZOOM,
} from './render.js';
import { TEMPLATES, byId } from './templates.js';
import { exportPNG, exportPDF, forgetPhotoCache, download, slug } from './exporter.js';
import { parseOutline, toOutline, uid } from './outline.js';
import { isAuto, sortBranch, sortChildren, countUndated, personBirth, ORDER_LABEL } from './order.js';
import { spousesOf, drawnSpouses, groupChildren, setSpouses, blankSpouse, forgetSpouse } from './people.js';
import * as store from './store.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== false && v !== undefined) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
};

/* ---------------------------------------------------------------- state */

const state = {
  trees: [],
  tree: null,
  selected: null, // {id, side}
  zoom: 1,
  collapsed: new Set(),
  query: '',
  saving: false,
  dirty: false,
};

/* --------------------------------------------------------------- toasts */

let toastTimer;
function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (kind === 'err' ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), kind === 'err' ? 6000 : 2600);
}

/* -------------------------------------------------------------- library */

async function loadLibrary() {
  state.trees = await store.listTrees();
  renderLibrary();
  renderStorage();
}

function renderLibrary() {
  const grid = $('#lib-grid');
  const q = state.query.trim().toLowerCase();
  const list = q ? state.trees.filter((t) => t.name.toLowerCase().includes(q)) : state.trees;

  $('#lib-count').textContent =
    `${state.trees.length} tree${state.trees.length === 1 ? '' : 's'}` +
    (q ? ` · ${list.length} matching` : '');
  $('#lib-empty').hidden = state.trees.length > 0;

  grid.replaceChildren(
    ...list.map((t) => {
      const tpl = byId(t.template);
      const cover = el('div', { class: 'card-cover', style: `background:${tpl.bg}` });
      cover.append(
        t.cover
          ? el('img', { src: store.photoURL(t.cover), alt: '' })
          : el('div', { class: 'glyph', style: `color:${tpl.accent}` }, '🌳')
      );
      return el(
        'div',
        { class: 'card', onclick: (e) => { if (!e.target.closest('.card-tools')) openTree(t.id); } },
        cover,
        el(
          'div',
          { class: 'card-body' },
          el('h3', {}, t.name),
          el(
            'div',
            { class: 'card-meta' },
            el('span', {}, `${t.people} people`),
            el('span', {}, tpl.label),
            el('span', {}, when(t.updatedAt))
          )
        ),
        el(
          'div',
          { class: 'card-tools' },
          el('button', { class: 'btn tiny ghost', onclick: () => duplicateTree(t) }, 'Duplicate'),
          el('button', { class: 'btn tiny ghost', onclick: () => exportJSON(t) }, 'JSON'),
          el('button', { class: 'btn tiny ghost danger', onclick: () => deleteTree(t) }, 'Delete')
        )
      );
    })
  );
}

function when(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function duplicateTree(t) {
  const copy = await store.duplicateTree(t.id);
  await loadLibrary();
  toast(`Duplicated as “${copy.name}”`);
}

async function deleteTree(t) {
  const ok = await confirmModal(
    'Delete tree?',
    `“${t.name}” will be permanently removed from this browser. Photos used by no other tree are deleted with it.`,
    'Delete'
  );
  if (!ok) return;
  await store.deleteTree(t.id);
  await loadLibrary();
  toast('Tree deleted');
}

/**
 * A tree's JSON on its own only references photos by hash, so photos are inlined here —
 * otherwise the file would open on another machine with every portrait blank.
 */
async function exportJSON(t) {
  const full = await store.getTree(t.id);
  const refs = [...store.collectPhotoRefs(full)];
  const photos = {};
  for (const ref of refs) {
    const data = await store.photoDataURL(ref);
    if (data) photos[ref] = data;
  }
  const payload = { ...full, photos };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${slug(full.name)}.json`);
}

/* --------------------------------------------------------- editor: open */

async function openTree(id) {
  state.tree = await store.getTree(id);
  // Blob URLs must exist before the first synchronous render pass.
  await store.primePhotos(state.tree);
  state.selected = { id: state.tree.root.id, side: 'self' };
  state.collapsed = new Set();
  state.dirty = false;
  // A tree saved with an automatic order may have been edited elsewhere (outline paste,
  // JSON import) — settle it before the first draw so the list and the sheet agree.
  if (sortBranch(state.tree.root, state.tree.order)) markDirty();
  forgetPhotoCache();
  $('#library').hidden = true;
  $('#editor').hidden = false;
  $('#tree-name').value = state.tree.name;
  $('#tree-sub').value = state.tree.subtitle || '';
  $('#tree-template').value = state.tree.template;
  renderAll();
  requestAnimationFrame(() => zoomFit());
}

function closeEditor() {
  flushSave();
  state.tree = null;
  $('#editor').hidden = true;
  $('#library').hidden = false;
  loadLibrary();
}

function renderAll() {
  renderOutline();
  renderStage();
  renderInspector();
}

/* ------------------------------------------------------------ save flow */

let saveTimer = null;
function markDirty() {
  state.dirty = true;
  $('#save-state').textContent = 'Unsaved';
  $('#save-state').classList.add('dirty');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 700);
}

async function flushSave() {
  clearTimeout(saveTimer);
  if (!state.tree || !state.dirty || state.saving) return;
  state.saving = true;
  const snapshot = state.tree;
  try {
    await store.saveTree(snapshot);
    if (state.tree === snapshot) {
      state.dirty = false;
      $('#save-state').textContent = 'Saved';
      $('#save-state').classList.remove('dirty');
    }
  } catch (e) {
    $('#save-state').textContent = 'Save failed';
    toast('Could not save: ' + e.message, 'err');
  } finally {
    state.saving = false;
  }
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { flushSave(); e.preventDefault(); e.returnValue = ''; }
});

/* ------------------------------------------------------- tree mutations */

function walk(node, fn, parent = null, index = 0) {
  if (!node) return null;
  const hit = fn(node, parent, index);
  if (hit) return hit;
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    const r = walk(kids[i], fn, node, i);
    if (r) return r;
  }
  return null;
}

const find = (id) => walk(state.tree.root, (n, p, i) => (n.id === id ? { node: n, parent: p, index: i } : null));

function newPerson(name = '') {
  return { id: uid(), name, note: '', born: '', photo: null, spouse: null, spouses: [], with: null, children: [] };
}

/** `withSpouse` is a spouse id, naming which marriage the child belongs to. */
function addChild(id, withSpouse = null) {
  const hit = find(id);
  if (!hit) return;
  const kid = newPerson('');
  kid.with = withSpouse;
  (hit.node.children ||= []).push(kid);
  state.collapsed.delete(id);
  state.selected = { id: kid.id, side: 'self' };
  changed();
  focusName();
}

function addSibling(id) {
  const hit = find(id);
  if (!hit || !hit.parent) return toast('The root has no siblings — add a child instead');
  const sib = newPerson('');
  sib.with = hit.node.with || null; // a sibling shares the marriage, unless there isn't one
  hit.parent.children.splice(hit.index + 1, 0, sib);
  state.selected = { id: sib.id, side: 'self' };
  changed();
  focusName();
}

/** Move a child to another of their parent's marriages, or to none. */
function setChildWith(id, spouseId) {
  const hit = find(id);
  if (!hit) return;
  hit.node.with = spouseId || null;
  changed();
}

function removePerson(id) {
  const hit = find(id);
  if (!hit) return;
  if (!hit.parent) return toast('Can’t delete the root person', 'err');
  hit.parent.children.splice(hit.index, 1);
  state.selected = { id: hit.parent.id, side: 'self' };
  changed();
}

function movePerson(id, dir) {
  const hit = find(id);
  if (!hit || !hit.parent) return;
  const to = hit.index + dir;
  if (to < 0 || to >= hit.parent.children.length) return;
  const [n] = hit.parent.children.splice(hit.index, 1);
  hit.parent.children.splice(to, 0, n);
  dropAutoOrder('Arranged by hand — branch order is now manual');
  changed();
}

/* ------------------------------------------------------------ branch order */

/**
 * Move a branch somewhere else: before or after another person, or in as their
 * last child. Used by the structure list's drag and drop.
 */
function moveNode(srcId, dstId, where, withSpouse) {
  if (srcId === dstId) return;
  const src = find(srcId);
  if (!src) return;
  if (!src.parent) return toast('The root person can’t be moved', 'err');
  if (contains(src.node, dstId)) return toast('A branch can’t be moved inside itself', 'err');

  src.parent.children.splice(src.index, 1);
  const dst = find(dstId);
  if (!dst) {
    src.parent.children.splice(src.index, 0, src.node); // target vanished — put it back
    return;
  }

  if (where === 'inside' || !dst.parent) {
    // Dropping onto the root means "become its child" — there is no before or after it.
    (dst.node.children ||= []).push(src.node);
    // Dropped on a marriage heading it joins that marriage; on the person, none.
    src.node.with = withSpouse === undefined ? null : withSpouse;
    state.collapsed.delete(dst.node.id);
  } else {
    dst.parent.children.splice(dst.index + (where === 'after' ? 1 : 0), 0, src.node);
    src.node.with = dst.node.with || null; // land in the same marriage as the row dropped onto
  }

  state.selected = { id: srcId, side: 'self' };
  dropAutoOrder('Arranged by hand — branch order is now manual');
  changed();
}

const contains = (node, id) => !!walk(node, (n) => (n.id === id ? n : null));

/** Hand control back to manual ordering after a by-hand move. */
function dropAutoOrder(message) {
  if (!isAuto(state.tree.order)) return;
  state.tree.order = 'manual';
  toast(message);
}

/** Re-apply the tree's automatic order, if it has one. Returns true if anyone moved. */
function reflowOrder() {
  return sortBranch(state.tree.root, state.tree.order);
}

function setTreeOrder(order) {
  state.tree.order = order;
  reflowOrder();
  changed();
}

/* ---------------------------------------------------------------- spouses */

/** The list to edit, always a real array even for a tree that predates `spouses`. */
function spouseList(node) {
  const list = spousesOf(node);
  if (node.spouses !== list) setSpouses(node, [...list]);
  return node.spouses;
}

function addSpouse(id) {
  const hit = find(id);
  if (!hit) return;
  const list = spouseList(hit.node);
  setSpouses(hit.node, [...list, blankSpouse()]);
  state.selected = { id, side: `spouse:${hit.node.spouses.length - 1}` };
  changed();
  focusSpouseName(hit.node.spouses.length - 1);
}

function removeSpouse(id, index) {
  const hit = find(id);
  if (!hit) return;
  const list = spouseList(hit.node);
  if (index < 0 || index >= list.length) return;
  forgetSpouse(hit.node, list[index].id); // their children stay, just unattached
  setSpouses(hit.node, list.filter((_, i) => i !== index));
  // Selection is by index, so anything at or past the gap now points at the wrong person.
  if (String(state.selected?.side).startsWith('spouse:')) state.selected = { id, side: 'self' };
  changed();
}

function moveSpouse(id, index, dir) {
  const hit = find(id);
  if (!hit) return;
  const list = [...spouseList(hit.node)];
  const to = index + dir;
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
  setSpouses(hit.node, list);
  state.selected = { id, side: `spouse:${to}` };
  changed();
}

/** Persist and redraw after any structural edit. */
function changed() {
  markDirty();
  renderAll();
}

function focusName() {
  requestAnimationFrame(() => {
    const f = $('#insp-name');
    if (f) { f.focus(); f.select(); }
  });
}

function focusSpouseName(index) {
  requestAnimationFrame(() => {
    const f = $(`#insp-spouse-${index}`);
    if (f) { f.focus(); f.select(); }
  });
}

/* ------------------------------------------------------------- outline */

function renderOutline() {
  const box = $('#outline');
  box.replaceChildren(outlineNode(state.tree.root, true));
  $('#order-state').textContent = ORDER_LABEL[state.tree.order] || ORDER_LABEL.manual;
}

// The row a drag started on. dataTransfer can't be read during dragover, so the
// source is tracked here instead.
let dragId = null;

/** Which third of a row the pointer is over: drop before it, after it, or into it. */
function dropZone(e, row, isRoot) {
  if (isRoot) return 'inside';
  const box = row.getBoundingClientRect();
  const at = (e.clientY - box.top) / box.height;
  return at < 0.32 ? 'before' : at > 0.68 ? 'after' : 'inside';
}

function outlineNode(p, isRoot) {
  const kids = p.children || [];
  const isCollapsed = state.collapsed.has(p.id);
  const selected = state.selected && state.selected.id === p.id;

  // Several marriages always get headers, so there's something to fold even with no children yet.
  const expandable = kids.length > 0 || drawnSpouses(p).length > 1;

  const twist = el(
    'span',
    {
      class: 'o-twist' + (expandable ? '' : ' leaf'),
      onclick: (e) => {
        e.stopPropagation();
        state.collapsed.has(p.id) ? state.collapsed.delete(p.id) : state.collapsed.add(p.id);
        renderOutline();
      },
    },
    isCollapsed ? '▶' : '▼'
  );

  const spouseHtml = spousesOf(p)
    .filter((s) => s.name)
    .map((s) => ` <span class="sp">+ ${escapeHtml(s.name)}</span>`)
    .join('');

  const nameHtml =
    escapeHtml(p.name || 'Unnamed') +
    (p.note ? ` <em>(${escapeHtml(p.note)})</em>` : '') +
    spouseHtml +
    (p.born ? ` <span class="yr">${escapeHtml(p.born)}</span>` : '');

  const row = el(
    'div',
    {
      class: 'o-row' + (selected ? ' sel' : ''),
      draggable: isRoot ? null : 'true',
      title: isRoot ? null : 'Drag to move this branch',
      onclick: () => { state.selected = { id: p.id, side: 'self' }; renderAll(); },
    },
    twist,
    el('span', { class: 'o-name', html: nameHtml }),
    el(
      'div',
      { class: 'o-tools' },
      btn('＋', 'Add child', () => addChild(p.id)),
      isRoot ? null : btn('↑', 'Move up', () => movePerson(p.id, -1)),
      isRoot ? null : btn('↓', 'Move down', () => movePerson(p.id, 1)),
      isRoot ? null : btn('✕', 'Delete', () => removePerson(p.id))
    )
  );

  const clearDrop = () => row.classList.remove('drop-before', 'drop-after', 'drop-inside');

  if (!isRoot) {
    row.addEventListener('dragstart', (e) => {
      dragId = p.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', p.id); // Firefox won't start a drag without payload
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); });
  }

  row.addEventListener('dragover', (e) => {
    if (!dragId || dragId === p.id || contains(find(dragId)?.node, p.id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const zone = dropZone(e, row, isRoot);
    clearDrop();
    row.classList.add('drop-' + zone);
  });
  // Crossing into the row's own children fires dragleave too; ignore those.
  row.addEventListener('dragleave', (e) => { if (!row.contains(e.relatedTarget)) clearDrop(); });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    clearDrop();
    const src = dragId || e.dataTransfer.getData('text/plain');
    dragId = null;
    if (src) moveNode(src, p.id, dropZone(e, row, isRoot));
  });

  const wrapNode = el('div', {}, row);
  if (expandable) {
    wrapNode.append(el('div', { class: 'o-kids', hidden: isCollapsed || null }, ...childBlocks(p, kids)));
  }
  return wrapNode;
}

/**
 * The rows under a person. With one marriage (or none) that's just the children,
 * as it has always been. With several, each marriage gets a header with its own
 * add button so it's clear which one a child is being added to.
 */
function childBlocks(p, kids) {
  const spouses = drawnSpouses(p);
  if (spouses.length < 2) return kids.map((k) => outlineNode(k, false));

  const { groups, loose } = groupChildren(p, kids);
  const blocks = groups.map(({ spouse, children }) =>
    el(
      'div',
      { class: 'o-group' },
      groupHeader(p, spouse, `+ ${spouse.name || 'Unnamed'}`, spouse.id),
      ...children.map((k) => outlineNode(k, false))
    )
  );
  if (loose.length) {
    blocks.push(
      el(
        'div',
        { class: 'o-group' },
        groupHeader(p, null, 'No marriage set', null),
        ...loose.map((k) => outlineNode(k, false))
      )
    );
  }
  return blocks;
}

/** A marriage's heading in the structure list, and a drop target for reassigning. */
function groupHeader(p, spouse, label, spouseId) {
  const head = el(
    'div',
    { class: 'o-grouphead' + (spouse ? '' : ' loose'), title: spouse ? 'Children of this marriage' : 'Children not tied to a marriage' },
    el('span', { class: 'o-groupname' }, label),
    el('div', { class: 'o-tools' }, btn('＋', spouse ? `Add a child with ${spouse.name || 'this spouse'}` : 'Add a child with no marriage set', () => addChild(p.id, spouseId)))
  );

  head.addEventListener('dragover', (e) => {
    if (!dragId || dragId === p.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    head.classList.add('drop-inside');
  });
  head.addEventListener('dragleave', () => head.classList.remove('drop-inside'));
  head.addEventListener('drop', (e) => {
    e.preventDefault();
    head.classList.remove('drop-inside');
    const src = dragId || e.dataTransfer.getData('text/plain');
    dragId = null;
    if (src) moveNode(src, p.id, 'inside', spouseId);
  });
  return head;
}

function btn(label, title, onclick) {
  return el('button', { title, onclick: (e) => { e.stopPropagation(); onclick(); } }, label);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* --------------------------------------------------------------- stage */

let lastSize = { width: 1, height: 1 };

function renderStage() {
  const { svg, width, height } = renderSVG(state.tree, {
    selected: state.selected,
    interactive: true,
    photoSrc: store.photoURL,
    photoSize: store.photoSize,
  });
  lastSize = { width, height };
  const stage = $('#stage');
  stage.innerHTML = svg;
  const node = stage.firstElementChild;
  node.setAttribute('width', Math.round(width * state.zoom));
  node.setAttribute('height', Math.round(height * state.zoom));
  $('#zoom-label').textContent = Math.round(state.zoom * 100) + '%';
}

function setZoom(z) {
  state.zoom = Math.min(3, Math.max(0.05, z));
  const node = $('#stage').firstElementChild;
  if (node) {
    node.setAttribute('width', Math.round(lastSize.width * state.zoom));
    node.setAttribute('height', Math.round(lastSize.height * state.zoom));
  }
  $('#zoom-label').textContent = Math.round(state.zoom * 100) + '%';
}

function zoomFit() {
  const box = $('#stage-scroll').getBoundingClientRect();
  setZoom(Math.min((box.width - 60) / lastSize.width, (box.height - 60) / lastSize.height));
}

/* ----------------------------------------------------------- inspector */

function renderInspector() {
  const box = $('#inspector');
  const sel = state.selected;
  const hit = sel && find(sel.id);
  if (!hit) {
    box.replaceChildren(
      el('div', { class: 'insp-empty' }, 'Select someone in the structure list or click a portrait on the canvas.')
    );
    return;
  }
  const p = hit.node;
  const isRoot = !hit.parent;

  const parts = [];

  parts.push(
    section(
      'Person',
      textField('Name', p.name, (v) => { p.name = v; markDirty(); renderOutline(); renderStage(); }, 'insp-name'),
      textField('Note (shown in brackets)', p.note, (v) => { p.note = v; markDirty(); renderOutline(); renderStage(); }, null, 'e.g. Late'),
      bornField(p),
      photoField(p, () => { markDirty(); renderStage(); renderInspector(); })
    )
  );

  const spouses = spousesOf(p);
  spouses.forEach((sp, i) => {
    const repaint = () => { markDirty(); renderStage(); renderInspector(); };
    const sec = section(
      spouses.length > 1 ? `Spouse ${i + 1}` : 'Spouse',
      textField('Name', sp.name, (v) => { sp.name = v; markDirty(); renderOutline(); renderStage(); }, `insp-spouse-${i}`),
      textField('Note', sp.note, (v) => { sp.note = v; markDirty(); renderStage(); }, null, 'e.g. Late'),
      bornField(sp),
      photoField(sp, repaint),
      el(
        'div',
        { class: 'insp-actions' },
        el('button', { class: 'btn tiny', onclick: () => addChild(p.id, sp.id) }, '+ Child'),
        spouses.length > 1 ? el('button', { class: 'btn tiny ghost', title: 'Move left', onclick: () => moveSpouse(p.id, i, -1) }, '←') : null,
        spouses.length > 1 ? el('button', { class: 'btn tiny ghost', title: 'Move right', onclick: () => moveSpouse(p.id, i, 1) }, '→') : null,
        el('button', { class: 'btn tiny ghost danger', onclick: () => removeSpouse(p.id, i) }, 'Remove')
      ),
      childTally(p, sp)
    );
    // Clicking a portrait picks one spouse out of several — say which.
    if (state.selected?.side === `spouse:${i}`) sec.classList.add('sel');
    parts.push(sec);
  });

  parts.push(
    el('button', { class: 'btn ghost', onclick: () => addSpouse(p.id) }, spouses.length ? '+ Add another spouse' : '+ Add spouse')
  );

  // Which of the parent's marriages this person belongs to — only a question
  // once the parent has more than one.
  const parentSpouses = hit.parent ? drawnSpouses(hit.parent) : [];
  if (parentSpouses.length > 1) {
    const select = el('select', {});
    for (const { spouse } of parentSpouses) {
      select.append(el('option', { value: spouse.id, selected: p.with === spouse.id || null }, `${hit.parent.name || 'Parent'} + ${spouse.name || 'Unnamed'}`));
    }
    select.append(el('option', { value: '', selected: !parentSpouses.some(({ spouse }) => spouse.id === p.with) || null }, 'Not set'));
    select.addEventListener('change', () => setChildWith(p.id, select.value));
    parts.push(section('Child of', el('label', { class: 'field' }, el('span', {}, 'Which marriage'), select)));
  }

  const kids = p.children || [];
  if (kids.length > 1) {
    const undated = kids.filter((k) => personBirth(k) == null).length;
    parts.push(
      section(
        'Order these children',
        el(
          'div',
          { class: 'insp-actions' },
          el('button', { class: 'btn', onclick: () => sortHere(p, 'elder') }, '↑ Eldest first'),
          el('button', { class: 'btn', onclick: () => sortHere(p, 'younger') }, '↓ Youngest first')
        ),
        el('p', { class: 'muted', style: 'margin:0;font-size:12px;line-height:1.5' },
          undated
            ? `${undated} of ${kids.length} have no birth year — they hold their current place, after the dated ones.`
            : 'All dated, so this group sorts exactly.')
      )
    );
  }

  parts.push(
    section(
      'Family',
      el(
        'div',
        { class: 'insp-actions' },
        el('button', { class: 'btn', onclick: () => addChild(p.id) }, spouses.length > 1 ? '+ Child (no marriage)' : '+ Child'),
        isRoot ? null : el('button', { class: 'btn', onclick: () => addSibling(p.id) }, '+ Sibling'),
        isRoot ? null : el('button', { class: 'btn ghost', onclick: () => movePerson(p.id, -1) }, '↑'),
        isRoot ? null : el('button', { class: 'btn ghost', onclick: () => movePerson(p.id, 1) }, '↓'),
        isRoot ? null : el('button', { class: 'btn ghost danger', onclick: () => confirmDelete(p) }, 'Delete')
      ),
      hint(
        `${kids.length} child${kids.length === 1 ? '' : 'ren'}` +
          (spouses.length > 1 ? ` · ${childSplit(p)}` : '') +
          (isRoot ? ' · this is the root of the tree' : '')
      ),
      spouses.length > 1 ? hint('Use + Child in a Spouse section above to add against that marriage.') : null
    )
  );

  box.replaceChildren(...parts.filter(Boolean));
}

async function confirmDelete(p) {
  const n = countDescendants(p);
  const ok =
    n === 0 ||
    (await confirmModal('Delete branch?', `“${p.name || 'Unnamed'}” and ${n} descendant${n === 1 ? '' : 's'} will be removed.`, 'Delete'));
  if (ok) removePerson(p.id);
}

function countDescendants(p) {
  return (p.children || []).reduce((a, c) => a + 1 + countDescendants(c), 0);
}

function section(title, ...kids) {
  return el('div', { class: 'insp-sec' }, el('h4', {}, title), ...kids.filter(Boolean));
}

const hint = (text) => el('p', { class: 'muted', style: 'margin:0;font-size:12px;line-height:1.5' }, text);

/** "2 with FATIMA, 1 with RUQIYA, 1 unset" — the breakdown across a person's marriages. */
function childSplit(p) {
  const { groups, loose } = groupChildren(p, p.children || []);
  const bits = groups
    .filter((g) => g.children.length)
    .map((g) => `${g.children.length} with ${g.spouse.name || 'Unnamed'}`);
  if (loose.length) bits.push(`${loose.length} unset`);
  return bits.length ? bits.join(', ') : 'none set against a marriage';
}

/** How many children sit under one marriage. Only meaningful once there are several. */
function childTally(p, sp) {
  if (drawnSpouses(p).length < 2) return null;
  const n = (p.children || []).filter((c) => c.with === sp.id).length;
  return hint(n ? `${n} child${n === 1 ? '' : 'ren'} with ${sp.name || 'this spouse'}` : 'No children set against this marriage yet');
}

function textField(label, value, onInput, id, placeholder) {
  const input = el('input', { value: value || '', placeholder: placeholder || '', id: id || false });
  input.addEventListener('input', () => onInput(input.value));
  return el('label', { class: 'field' }, el('span', {}, label), input);
}

/**
 * Birth year for a person or a spouse — what an "eldest first" order sorts on.
 * Re-sorting waits for `change` (blur or Enter): re-ordering on every keystroke would
 * shuffle the list out from under the cursor the moment you typed "1".
 */
function bornField(owner) {
  const input = el('input', { value: owner.born || '', placeholder: 'e.g. 1948 or 1948-03-12' });
  input.addEventListener('input', () => { owner.born = input.value; markDirty(); renderOutline(); });
  input.addEventListener('change', () => {
    if (reflowOrder()) markDirty();
    renderAll();
  });
  return el('label', { class: 'field' }, el('span', {}, 'Born (year or date)'), input);
}

/** Sort one person's children, without committing the whole tree to that order. */
function sortHere(node, order) {
  const moved = sortChildren(node, order);
  const switched = isAuto(state.tree.order) && state.tree.order !== order;
  if (switched) state.tree.order = 'manual';
  changed();
  toast(
    moved
      ? `${(node.name || 'This branch')} — ${order === 'elder' ? 'eldest' : 'youngest'} first`
      : 'Already in that order'
  );
}

/**
 * Photo controls for whoever owns a `photo` field — a person or their spouse.
 * Mutates the owner in place and calls `onChange` so the caller can save and repaint.
 */
function photoField(owner, onChange) {
  const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      owner.photo = await uploadPhoto(f);
      owner.photoFit = null; // a different picture wants framing of its own
      onChange();
      toast('Photo added');
    } catch (e) {
      toast('Upload failed: ' + e.message, 'err');
    }
    file.value = '';
  });

  const adjust = async () => {
    const fit = await framePhotoModal(owner.photo, owner.photoFit);
    if (fit === undefined) return; // dismissed
    owner.photoFit = fit;
    onChange();
  };

  const remove = () => {
    owner.photo = null;
    owner.photoFit = null;
    onChange();
  };

  return el(
    'div',
    { class: 'photo-row' },
    owner.photo ? thumb(owner) : el('img', { class: 'photo-thumb', src: transparentPixel(), alt: '' }),
    el(
      'div',
      { class: 'photo-btns' },
      el('button', { class: 'btn tiny', onclick: () => file.click() }, owner.photo ? 'Replace photo' : 'Upload photo'),
      owner.photo ? el('button', { class: 'btn tiny', onclick: adjust }, 'Adjust framing') : null,
      owner.photo ? el('button', { class: 'btn tiny ghost', onclick: remove }, 'Remove') : null,
      file
    )
  );
}

/** Thumbnail that shows the chosen framing rather than a plain centred crop. */
function thumb(owner) {
  const size = 54;
  const box = fitRect(owner.photoFit, size, store.photoSize(owner.photo));
  return el(
    'div',
    {
      class: 'photo-thumb photo-frame' + (portraitShape() === 'squircle' ? ' sq' : ''),
      style: `background:${photoMatte(byId(state.tree ? state.tree.template : ''))}`,
    },
    el('img', {
      src: store.photoURL(owner.photo),
      alt: '',
      style: `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;object-fit:${
        box.preserveAspectRatio === 'none' ? 'fill' : 'cover'
      }`,
    })
  );
}

const portraitShape = () => byId(state.tree ? state.tree.template : '').shape;

const transparentPixel = () =>
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54"/>');

const uploadPhoto = (file) => store.putPhoto(file);

/* -------------------------------------------------------------- modals */

function modal({ title, body, foot, wide, onDismiss }) {
  const back = el('div', { class: 'modal-back' });
  const box = el(
    'div',
    { class: 'modal' + (wide ? ' wide' : '') },
    el('div', { class: 'modal-head' }, el('h2', {}, title)),
    el('div', { class: 'modal-body' }, ...[body].flat().filter(Boolean)),
    el('div', { class: 'modal-foot' }, ...[foot].flat().filter(Boolean))
  );
  back.append(box);
  // Backing out counts as a dismissal; a button calling close() directly does not.
  const dismiss = () => { close(); onDismiss?.(); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) dismiss(); });
  const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
  document.addEventListener('keydown', onKey);
  function close() {
    document.removeEventListener('keydown', onKey);
    back.remove();
  }
  $('#modal-root').append(back);
  return { close, box };
}

function confirmModal(title, message, confirmLabel = 'OK') {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: el('p', {}, message),
      foot: [
        el('button', { class: 'btn ghost', onclick: () => { m.close(); resolve(false); } }, 'Cancel'),
        el('button', { class: 'btn primary danger', onclick: () => { m.close(); resolve(true); } }, confirmLabel),
      ],
    });
  });
}

/* ----------------------------------------------------------- photo framing */

const FRAME_PREVIEW = 280; // px; the preview is square, like the portrait slot

/**
 * Pan and zoom a photo inside its portrait frame.
 *
 * The preview places the <img> with the very same maths the SVG uses, so what you nudge
 * here is what gets exported. Resolves to the new fit, `null` when it's back to the
 * default centred crop, or `undefined` if the dialog was dismissed.
 */
async function framePhotoModal(ref, current) {
  await store.primeRefs([ref]); // we need the natural size before we can place anything
  const fit = { ...normalizeFit(current) };
  let natural = store.photoSize(ref);

  const img = el('img', { src: store.photoURL(ref), alt: '', draggable: 'false' });
  const frame = el('div', {
    class: 'frame-box' + (portraitShape() === 'squircle' ? ' sq' : ''),
    // The matte is what prints behind a zoomed-out photo, so preview it, not the UI grey.
    style: `background:${photoMatte(byId(state.tree ? state.tree.template : ''))}`,
  }, img);
  const zoom = el('input', { type: 'range', min: String(MIN_ZOOM), max: String(MAX_ZOOM), step: '0.01', value: String(fit.zoom) });
  const zoomOut = el('span', { class: 'frame-zoom-val' });
  const whole = el('button', { class: 'btn tiny ghost', onclick: () => setZoom(containZoom(natural)) }, 'Whole photo');

  // A photo that failed to measure earlier still decodes here, so take the size from
  // the element and hand it back to the store — the stage render needs it too.
  img.addEventListener('load', () => {
    if (natural) return;
    natural = { w: img.naturalWidth, h: img.naturalHeight };
    store.rememberPhotoSize(ref, natural.w, natural.h);
    paint();
  });

  function paint() {
    const box = fitRect(fit, FRAME_PREVIEW, natural);
    img.style.left = box.x + 'px';
    img.style.top = box.y + 'px';
    img.style.width = box.w + 'px';
    img.style.height = box.h + 'px';
    img.style.objectFit = box.preserveAspectRatio === 'none' ? 'fill' : 'cover';
    zoom.value = String(fit.zoom);
    zoomOut.textContent = Math.round(fit.zoom * 100) + '%';
    frame.classList.toggle('locked', !panRoom().x && !panRoom().y);
    // Nothing to reveal once the whole picture is already in the frame.
    whole.disabled = !natural || fit.zoom <= containZoom(natural) + 0.001;
  }

  /** How many pixels of overflow there are to slide in each axis. */
  function panRoom() {
    const box = fitRect(fit, FRAME_PREVIEW, natural);
    return { x: Math.max(0, box.w - FRAME_PREVIEW), y: Math.max(0, box.h - FRAME_PREVIEW) };
  }

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const setZoom = (z) => { fit.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)); paint(); };

  frame.addEventListener('pointerdown', (e) => {
    const room = panRoom();
    if (!room.x && !room.y) return;
    const from = { px: e.clientX, py: e.clientY, x: fit.x, y: fit.y };
    frame.setPointerCapture(e.pointerId);
    frame.classList.add('dragging');

    const move = (ev) => {
      // Dragging right should uncover what sits off the left edge, so the fraction falls.
      if (room.x) fit.x = clamp01(from.x - (ev.clientX - from.px) / room.x);
      if (room.y) fit.y = clamp01(from.y - (ev.clientY - from.py) / room.y);
      paint();
    };
    const done = () => {
      frame.removeEventListener('pointermove', move);
      frame.classList.remove('dragging');
      frame.releasePointerCapture?.(e.pointerId);
    };
    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerup', done, { once: true });
    frame.addEventListener('pointercancel', done, { once: true });
    e.preventDefault();
  });

  frame.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(fit.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
  zoom.addEventListener('input', () => setZoom(+zoom.value));

  paint();

  return new Promise((resolve) => {
    const m = modal({
      title: 'Adjust framing',
      onDismiss: () => resolve(undefined),
      body: [
        el('div', { class: 'frame-wrap' }, frame),
        el('label', { class: 'frame-zoom' }, el('span', {}, 'Zoom'), zoom, zoomOut),
        el('div', { class: 'frame-fit' }, whole),
        el('p', { class: 'muted frame-hint' }, 'Drag the photo to move it, scroll or use the slider to zoom. Only the part inside the ring is printed — below 100% the photo pulls away from the edges and the gap prints as plain paper.'),
      ],
      foot: [
        el('button', {
          class: 'btn ghost',
          onclick: () => { Object.assign(fit, DEFAULT_FIT); paint(); },
        }, 'Reset'),
        el('button', { class: 'btn ghost', onclick: () => { m.close(); resolve(undefined); } }, 'Cancel'),
        el('button', {
          class: 'btn primary',
          onclick: () => { m.close(); resolve(isDefaultFit(fit) ? null : { ...fit }); },
        }, 'Apply'),
      ],
    });
  });
}

function templatePicker(current, onPick) {
  const grid = el('div', { class: 'tpl-grid' });
  let value = current;
  const paint = () => {
    grid.replaceChildren(
      ...TEMPLATES.map((t) =>
        el(
          'div',
          {
            class: 'tpl' + (t.id === value ? ' sel' : ''),
            onclick: () => { value = t.id; paint(); onPick(value); },
          },
          el('div', { class: 'sw' }, ...t.swatch.map((c) => el('i', { style: `background:${c}` }))),
          el('div', {}, el('b', {}, t.label), el('small', {}, t.blurb))
        )
      )
    );
  };
  paint();
  return grid;
}

/* ------------------------------------------------------------ new tree */

function newTreeModal(withOutline) {
  let template = 'heritage';
  const name = el('input', { placeholder: 'e.g. Narimukkil Muhammed Shah Family Tree' });
  const sub = el('input', { placeholder: 'Subtitle (optional)' });
  const area = el('textarea', {
    rows: 12,
    placeholder: `MUHAMMED SHAH (Late) [1921] + KADEESHABI (Late)\n  SULEIKHA [1948] + ALAVI (Late)\n    SALEEM + SAMEENA\n      SAGIL RAHMAN + SHERIN\n      SALIH RAHMAN\n  ABU (Late) [1951] + NARGIS`,
  });

  const m = modal({
    wide: withOutline,
    title: withOutline ? 'New tree from an outline' : 'New tree',
    body: [
      el('label', { class: 'field' }, el('span', {}, 'Tree name'), name),
      el('label', { class: 'field' }, el('span', {}, 'Subtitle'), sub),
      withOutline
        ? el(
            'label',
            { class: 'field' },
            el('span', {}, 'Outline — indent for each generation, “ + ” for each spouse, “ & ” to name a child’s other parent, “(…)” for a note, “[…]” for a birth year'),
            area
          )
        : null,
      el('label', { class: 'field' }, el('span', {}, 'Template'), templatePicker(template, (v) => (template = v))),
    ],
    foot: [
      el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: create }, 'Create'),
    ],
  });
  setTimeout(() => name.focus(), 30);

  async function create() {
    const body = {
      name: name.value.trim() || 'Untitled Family Tree',
      subtitle: sub.value.trim(),
      template,
    };
    if (withOutline) {
      const root = parseOutline(area.value);
      if (!root) return toast('Add at least one name to the outline', 'err');
      body.root = root;
    }
    const tree = await store.createTree(body);
    m.close();
    await loadLibrary();
    openTree(tree.id);
  }
}

/* -------------------------------------------------------------- design */

/** A row of single-choice chips that repaints itself after every pick. */
function chipRow(opts, get, set) {
  const row = el('div', { class: 'opt-row' });
  const paint = () =>
    row.replaceChildren(
      ...opts.map(([v, label, title]) =>
        el(
          'button',
          { class: 'chip' + (get() === v ? ' sel' : ''), title: title || false, onclick: () => { set(v); paint(); } },
          label
        )
      )
    );
  paint();
  return row;
}

/* --------------------------------------------------------- branch order UI */

function orderModal() {
  const t = state.tree;
  const hint = el('p', { class: 'muted' }, '');

  const paintHint = () => {
    if (!isAuto(t.order)) {
      hint.textContent =
        'Drag any row in the structure list to move a branch — drop on the upper or lower edge of a row to sit before or after it, drop in the middle to move in under it. ↑ and ↓ nudge one step.';
      return;
    }
    const undated = countUndated(t.root);
    hint.textContent = undated
      ? `${undated} ${undated === 1 ? 'person has' : 'people have'} no birth year yet — they hold their current place, after the dated ones in each group. Fill in “Born” on the right to place them.`
      : 'Everyone has a birth year, so every branch is sorted exactly. New people join the end until you give them a year.';
  };

  const chips = chipRow(
    [
      ['manual', 'Manual', 'Arrange branches yourself by dragging, or with ↑ ↓.'],
      ['elder', 'Eldest first', 'Every group of siblings is sorted by birth year, oldest at the top.'],
      ['younger', 'Youngest first', 'Every group of siblings is sorted by birth year, youngest at the top.'],
    ],
    () => t.order || 'manual',
    (v) => { setTreeOrder(v); paintHint(); }
  );
  paintHint();

  const m = modal({
    title: 'Branch order',
    body: [
      el('label', { class: 'field' }, el('span', {}, 'Order siblings by'), chips),
      hint,
      el('p', {}, 'An automatic order re-sorts every level of the tree, and keeps itself up to date as you edit birth years. Moving someone by hand switches back to Manual.'),
    ],
    foot: [el('button', { class: 'btn primary', onclick: () => m.close() }, 'Done')],
  });
}

function designModal() {
  const t = state.tree;

  const chips = (opts, get, set) =>
    chipRow(opts, get, (v) => { set(v); markDirty(); renderStage(); });

  const logoImg = el('img', { class: 'photo-thumb', src: t.logo ? store.photoURL(t.logo) : transparentPixel(), alt: '' });
  const logoFile = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  logoFile.addEventListener('change', async () => {
    const f = logoFile.files[0];
    if (!f) return;
    try {
      t.logo = await uploadPhoto(f);
      logoImg.src = store.photoURL(t.logo);
      markDirty();
      renderStage();
    } catch (e) {
      toast('Upload failed: ' + e.message, 'err');
    }
  });

  const m = modal({
    wide: true,
    title: 'Design',
    body: [
      el('label', { class: 'field' }, el('span', {}, 'Template'),
        templatePicker(t.template, (v) => {
          t.template = v;
          $('#tree-template').value = v;
          markDirty();
          renderStage();
        })),
      el('label', { class: 'field' }, el('span', {}, 'Arrangement'),
        chips(
          [
            ['flow', 'Flow — compact', 'One band per family branch; descendants chain to the right. Matches the reference layout.'],
            ['generations', 'Generations — strict', 'One column per generation exactly. Taller, but generations line up.'],
          ],
          () => t.layout || 'flow',
          (v) => (t.layout = v)
        )),
      el('label', { class: 'field' }, el('span', {}, 'Columns before a band wraps (Flow only)'),
        chips([[4, '4'], [5, '5'], [6, '6'], [8, '8']], () => t.maxCols || 6, (v) => (t.maxCols = v))),
      el('label', { class: 'field' }, el('span', {}, 'Logo (top-left / above the title)'),
        el('div', { class: 'photo-row' }, logoImg,
          el('div', { class: 'photo-btns' },
            el('button', { class: 'btn tiny', onclick: () => logoFile.click() }, t.logo ? 'Replace logo' : 'Upload logo'),
            el('button', { class: 'btn tiny ghost', onclick: () => { t.logo = null; logoImg.src = transparentPixel(); markDirty(); renderStage(); } }, 'Remove'),
            logoFile))),
    ],
    foot: [el('button', { class: 'btn primary', onclick: () => { m.close(); zoomFit(); } }, 'Done')],
  });
}

function outlineModal() {
  const area = el('textarea', { rows: 18 });
  area.value = toOutline(state.tree.root);
  const m = modal({
    wide: true,
    title: 'Edit as outline',
    body: [
      el('p', {}, 'Indent one level per generation. Use “ + ” for a spouse — repeat it for more than one — plus “(…)” for a note and “[…]” for a birth year, e.g. “ALAVI (Late) [1946] + AMINA + ZAINAB”. Where a parent has more than one spouse, end a child’s line with “ & ” and the other parent’s name to say which marriage they belong to. Applying replaces the structure; photos are carried over wherever a name still matches.'),
      area,
    ],
    foot: [
      el('button', { class: 'btn ghost left', onclick: () => { navigator.clipboard?.writeText(area.value); toast('Copied'); } }, 'Copy'),
      el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: apply }, 'Apply'),
    ],
  });

  function apply() {
    const root = parseOutline(area.value);
    if (!root) return toast('Outline is empty', 'err');
    carryPhotos(state.tree.root, root);
    state.tree.root = root;
    reflowOrder(); // a pasted outline is in whatever order it was typed
    state.selected = { id: root.id, side: 'self' };
    state.collapsed = new Set();
    m.close();
    changed();
    toast('Structure updated');
  }
}

/** Re-attach photos from the old tree onto the new one by matching names. */
function carryPhotos(oldRoot, newRoot) {
  const photos = new Map();
  const key = (n) => String(n || '').trim().toLowerCase();
  const collect = (p) => {
    if (!p) return;
    if (p.photo && !photos.has(key(p.name))) photos.set(key(p.name), p.photo);
    for (const s of spousesOf(p)) if (s.photo && !photos.has(key(s.name))) photos.set(key(s.name), s.photo);
    (p.children || []).forEach(collect);
  };
  collect(oldRoot);
  const apply = (p) => {
    if (!p) return;
    if (!p.photo && photos.has(key(p.name))) p.photo = photos.get(key(p.name));
    for (const s of spousesOf(p)) if (!s.photo && photos.has(key(s.name))) s.photo = photos.get(key(s.name));
    (p.children || []).forEach(apply);
  };
  apply(newRoot);
}

/* -------------------------------------------------------------- export */

function exportModal() {
  let format = 'png';
  let scale = 2;
  let page = 'fit';

  const status = el('p', {}, '');
  const chips = (opts, get, set) => {
    const row = el('div', { class: 'opt-row' });
    const paint = () =>
      row.replaceChildren(
        ...opts.map(([v, label]) =>
          el('button', { class: 'chip' + (get() === v ? ' sel' : ''), onclick: () => { set(v); paint(); repaintAll(); } }, label)
        )
      );
    paint();
    return { row, paint };
  };

  const fmt = chips([['png', 'PNG image'], ['pdf', 'PDF document']], () => format, (v) => (format = v));
  const qty = chips(
    [[1, '1× screen'], [2, '2× print'], [3, '3× large'], [4, '4× poster']],
    () => scale,
    (v) => (scale = v)
  );
  const pg = chips(
    [['fit', 'Fit to tree'], ['a4l', 'A4 landscape'], ['a3l', 'A3 landscape'], ['a2l', 'A2 landscape'], ['a4p', 'A4 portrait'], ['a3p', 'A3 portrait']],
    () => page,
    (v) => (page = v)
  );

  const pageField = el('label', { class: 'field' }, el('span', {}, 'Page size'), pg.row);

  function repaintAll() {
    pageField.hidden = format !== 'pdf';
    const w = Math.round(lastSize.width * scale);
    const h = Math.round(lastSize.height * scale);
    status.textContent = `Output: ${w} × ${h} px${format === 'pdf' && page === 'fit' ? ' (page sized to the tree)' : ''}`;
  }

  // Some browsers — notably the in-app ones in Instagram and Facebook — quietly
  // ignore a download, so always leave the finished file reachable by hand.
  const fallback = el('p', { class: 'tiny' }, '');
  fallback.hidden = true;

  const go = el('button', { class: 'btn primary', onclick: run }, 'Export');
  const m = modal({
    title: 'Export',
    body: [
      el('label', { class: 'field' }, el('span', {}, 'Format'), fmt.row),
      el('label', { class: 'field' }, el('span', {}, 'Resolution'), qty.row),
      pageField,
      status,
      fallback,
    ],
    foot: [el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), go],
  });
  repaintAll();

  async function run() {
    go.disabled = true;
    fallback.hidden = true;
    const onProgress = (msg) => (status.textContent = msg);
    try {
      await flushSave();
      const res =
        format === 'png'
          ? await exportPNG(state.tree, { scale, onProgress })
          : await exportPDF(state.tree, { scale, page, onProgress });

      status.textContent = res.clamped
        ? 'Exported at a lower resolution — the full size is more than this browser can render.'
        : 'Export ready.';
      fallback.replaceChildren(
        'Nothing downloaded? ',
        el('a', { href: res.url, download: res.filename, target: '_blank', rel: 'noopener' }, `Open ${res.filename}`)
      );
      fallback.hidden = false;
      go.disabled = false;
      go.textContent = 'Export again';
      toast(res.clamped ? 'Exported at a reduced resolution' : 'Export ready');
    } catch (e) {
      status.textContent = '';
      toast('Export failed: ' + e.message, 'err');
      go.disabled = false;
    }
  }
}

/* ------------------------------------------------------- backup/restore */

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const size = (n) =>
  n >= GB ? `${(n / GB).toFixed(1)} GB` : n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.round(n / KB)} KB`;

async function renderStorage() {
  const line = $('#lib-storage');
  const u = await store.usage();
  if (!u) {
    line.textContent = 'Saved in this browser only.';
    return;
  }
  const room = u.quota ? ` of about ${size(u.quota)} available` : '';
  line.textContent = `${size(u.used)} used${room} — saved in this browser only, never uploaded.`;
}

async function backupAll() {
  if (!state.trees.length) return toast('Nothing to back up yet');
  toast('Preparing backup…');
  const data = await store.exportAll();
  const stamp = new Date().toISOString().slice(0, 10);
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `family-trees-backup-${stamp}.json`);
}

function restoreFlow() {
  pickFile('application/json', async (f) => {
    const data = JSON.parse(await f.text());
    const treeCount = (data.trees || []).length;
    const mode = await restoreModeModal(treeCount, (data.photos || []).length);
    if (!mode) return;
    const n = await store.importAll(data, { replace: mode === 'replace' });
    await loadLibrary();
    toast(`Restored ${n} tree${n === 1 ? '' : 's'}`);
  });
}

function restoreModeModal(trees, photos) {
  return new Promise((resolve) => {
    const m = modal({
      title: 'Restore backup',
      body: el('p', {}, `This file holds ${trees} tree${trees === 1 ? '' : 's'} and ${photos} photo${photos === 1 ? '' : 's'}. Merge keeps what you already have; replace wipes this browser's trees first.`),
      foot: [
        el('button', { class: 'btn ghost', onclick: () => { m.close(); resolve(null); } }, 'Cancel'),
        el('button', { class: 'btn primary danger', onclick: () => { m.close(); resolve('replace'); } }, 'Replace everything'),
        el('button', { class: 'btn primary', onclick: () => { m.close(); resolve('merge'); } }, 'Merge'),
      ],
    });
  });
}

/** One-shot hidden file input, cleaned up after the pick. */
function pickFile(accept, onFile) {
  const input = el('input', { type: 'file', accept, style: 'display:none' });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (f) {
      try {
        await onFile(f);
      } catch (e) {
        toast('Failed: ' + e.message, 'err');
      }
    }
    input.remove();
  });
  document.body.append(input);
  input.click();
}

/* --------------------------------------------------------- json import */

function importJSONFlow() {
  pickFile('application/json', async (f) => {
    const data = JSON.parse(await f.text());
    if (!data.root) throw new Error('not a tree file');
    // Files exported by this app carry their photos inline; older file-backed exports don't.
    if (data.photos) await store.adoptPhotos(data.photos);
    const tree = await store.createTree({
      name: data.name,
      subtitle: data.subtitle,
      template: data.template,
      layout: data.layout,
      maxCols: data.maxCols,
      order: data.order,
      logo: data.logo,
      root: data.root,
    });
    await loadLibrary();
    toast(`Imported “${tree.name}”`);
  });
}

/* --------------------------------------------------------------- wiring */

function boot() {
  $('#tree-template').replaceChildren(
    ...TEMPLATES.map((t) => el('option', { value: t.id }, t.label))
  );

  $('#btn-new').onclick = () => newTreeModal(false);
  $('#btn-new-outline').onclick = () => newTreeModal(true);
  $('#btn-import-json').onclick = importJSONFlow;
  $('#btn-backup').onclick = () => backupAll().catch((e) => toast('Backup failed: ' + e.message, 'err'));
  $('#btn-restore').onclick = restoreFlow;
  $('#lib-empty').querySelector('[data-act=new]').onclick = () => newTreeModal(false);
  $('#lib-search').addEventListener('input', (e) => { state.query = e.target.value; renderLibrary(); });

  $('#btn-back').onclick = closeEditor;
  $('#btn-order').onclick = orderModal;
  $('#btn-design').onclick = designModal;
  $('#btn-outline').onclick = outlineModal;
  $('#btn-export').onclick = exportModal;

  $('#tree-name').addEventListener('input', (e) => { state.tree.name = e.target.value; markDirty(); renderStage(); });
  $('#tree-sub').addEventListener('input', (e) => { state.tree.subtitle = e.target.value; markDirty(); renderStage(); });
  $('#tree-template').addEventListener('change', (e) => { state.tree.template = e.target.value; markDirty(); renderStage(); });

  $('#btn-collapse-all').onclick = () => {
    if (state.collapsed.size) state.collapsed.clear();
    else walk(state.tree.root, (n) => { if ((n.children || []).length) state.collapsed.add(n.id); return null; });
    renderOutline();
  };

  document.querySelector('.zoombar').addEventListener('click', (e) => {
    const z = e.target.dataset.zoom;
    if (!z) return;
    if (z === 'in') setZoom(state.zoom * 1.25);
    else if (z === 'out') setZoom(state.zoom / 1.25);
    else if (z === 'fit') zoomFit();
    else setZoom(1);
  });

  $('#stage').addEventListener('click', (e) => {
    const hit = e.target.closest('[data-id]');
    if (!hit) return;
    state.selected = { id: hit.dataset.id, side: hit.dataset.side };
    renderOutline();
    renderStage();
    renderInspector();
  });

  $('#stage-scroll').addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom(state.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    },
    { passive: false }
  );

  document.addEventListener('keydown', (e) => {
    if (!state.tree || $('#editor').hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); flushSave(); toast('Saved'); }
    if (typing) return;
    if (e.key === 'Enter' && state.selected) { e.preventDefault(); addChild(state.selected.id); }
    if (e.key === 'Tab' && state.selected) { e.preventDefault(); addSibling(state.selected.id); }
  });

  // Ask the browser not to evict this origin's data during routine cleanups.
  store.requestPersistence();
  seedDemoOnce()
    .then(loadLibrary)
    .catch((e) => toast('Could not load trees: ' + e.message, 'err'));
}

const SEED_FLAG = 'familytree.seeded';

/**
 * First visit gets the sample tree so the app isn't a blank page. The flag is set before
 * seeding, so deleting the sample keeps it deleted and a failure never retries forever.
 */
async function seedDemoOnce() {
  if (localStorage.getItem(SEED_FLAG)) return;
  localStorage.setItem(SEED_FLAG, '1');
  try {
    if ((await store.listTrees()).length) return;
    const { createDemoTree } = await import('./demo.js');
    await createDemoTree();
  } catch {
    /* an empty library is a perfectly good fallback */
  }
}

boot();
