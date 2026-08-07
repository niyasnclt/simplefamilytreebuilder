import { renderSVG } from './render.js';
import { TEMPLATES, byId } from './templates.js';
import { exportPNG, exportPDF, forgetPhotoCache, download, slug } from './exporter.js';
import { parseOutline, toOutline, uid } from './outline.js';

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

/* ------------------------------------------------------------------ api */

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: opts.body && !opts.raw ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.raw ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.status === 204 ? null : res.json();
}

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
  state.trees = await api('/trees');
  renderLibrary();
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
          ? el('img', { src: t.cover, alt: '' })
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
  const copy = await api(`/trees/${t.id}/duplicate`, { method: 'POST' });
  await loadLibrary();
  toast(`Duplicated as “${copy.name}”`);
}

async function deleteTree(t) {
  const ok = await confirmModal('Delete tree?', `“${t.name}” will be permanently removed. Photos stay on disk.`, 'Delete');
  if (!ok) return;
  await api(`/trees/${t.id}`, { method: 'DELETE' });
  await loadLibrary();
  toast('Tree deleted');
}

async function exportJSON(t) {
  const full = await api(`/trees/${t.id}`);
  download(new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' }), `${slug(full.name)}.json`);
}

/* --------------------------------------------------------- editor: open */

async function openTree(id) {
  state.tree = await api(`/trees/${id}`);
  state.selected = { id: state.tree.root.id, side: 'self' };
  state.collapsed = new Set();
  state.dirty = false;
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
    await api(`/trees/${snapshot.id}`, { method: 'PUT', body: snapshot });
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
  return { id: uid(), name, note: '', photo: null, spouse: null, children: [] };
}

function addChild(id) {
  const hit = find(id);
  if (!hit) return;
  const kid = newPerson('');
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
  hit.parent.children.splice(hit.index + 1, 0, sib);
  state.selected = { id: sib.id, side: 'self' };
  changed();
  focusName();
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
  changed();
}

function setSpouse(id, on) {
  const hit = find(id);
  if (!hit) return;
  hit.node.spouse = on ? { name: '', note: '', photo: null } : null;
  if (!on && state.selected?.side === 'spouse') state.selected = { id, side: 'self' };
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

/* ------------------------------------------------------------- outline */

function renderOutline() {
  const box = $('#outline');
  box.replaceChildren(outlineNode(state.tree.root, true));
}

function outlineNode(p, isRoot) {
  const kids = p.children || [];
  const isCollapsed = state.collapsed.has(p.id);
  const selected = state.selected && state.selected.id === p.id;

  const twist = el(
    'span',
    {
      class: 'o-twist' + (kids.length ? '' : ' leaf'),
      onclick: (e) => {
        e.stopPropagation();
        state.collapsed.has(p.id) ? state.collapsed.delete(p.id) : state.collapsed.add(p.id);
        renderOutline();
      },
    },
    isCollapsed ? '▶' : '▼'
  );

  const nameHtml =
    escapeHtml(p.name || 'Unnamed') +
    (p.note ? ` <em>(${escapeHtml(p.note)})</em>` : '') +
    (p.spouse && p.spouse.name ? ` <span class="sp">+ ${escapeHtml(p.spouse.name)}</span>` : '');

  const row = el(
    'div',
    {
      class: 'o-row' + (selected ? ' sel' : ''),
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

  const wrapNode = el('div', {}, row);
  if (kids.length) {
    wrapNode.append(
      el('div', { class: 'o-kids', hidden: isCollapsed || null }, ...kids.map((k) => outlineNode(k, false)))
    );
  }
  return wrapNode;
}

function btn(label, title, onclick) {
  return el('button', { title, onclick: (e) => { e.stopPropagation(); onclick(); } }, label);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* --------------------------------------------------------------- stage */

let lastSize = { width: 1, height: 1 };

function renderStage() {
  const { svg, width, height } = renderSVG(state.tree, { selected: state.selected, interactive: true });
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
      photoField(p.photo, async (url) => { p.photo = url; markDirty(); renderStage(); renderInspector(); })
    )
  );

  if (p.spouse) {
    parts.push(
      section(
        'Spouse',
        textField('Name', p.spouse.name, (v) => { p.spouse.name = v; markDirty(); renderOutline(); renderStage(); }),
        textField('Note', p.spouse.note, (v) => { p.spouse.note = v; markDirty(); renderStage(); }, null, 'e.g. Late'),
        photoField(p.spouse.photo, async (url) => { p.spouse.photo = url; markDirty(); renderStage(); renderInspector(); }),
        el('button', { class: 'btn tiny ghost danger', onclick: () => setSpouse(p.id, false) }, 'Remove spouse')
      )
    );
  } else {
    parts.push(el('button', { class: 'btn ghost', onclick: () => setSpouse(p.id, true) }, '+ Add spouse'));
  }

  parts.push(
    section(
      'Family',
      el(
        'div',
        { class: 'insp-actions' },
        el('button', { class: 'btn', onclick: () => addChild(p.id) }, '+ Child'),
        isRoot ? null : el('button', { class: 'btn', onclick: () => addSibling(p.id) }, '+ Sibling'),
        isRoot ? null : el('button', { class: 'btn ghost', onclick: () => movePerson(p.id, -1) }, '↑'),
        isRoot ? null : el('button', { class: 'btn ghost', onclick: () => movePerson(p.id, 1) }, '↓'),
        isRoot ? null : el('button', { class: 'btn ghost danger', onclick: () => confirmDelete(p) }, 'Delete')
      ),
      el('p', { class: 'muted', style: 'margin:0;font-size:12px;line-height:1.5' },
        `${(p.children || []).length} child${(p.children || []).length === 1 ? '' : 'ren'}` +
          (isRoot ? ' · this is the root of the tree' : ''))
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

function textField(label, value, onInput, id, placeholder) {
  const input = el('input', { value: value || '', placeholder: placeholder || '', id: id || false });
  input.addEventListener('input', () => onInput(input.value));
  return el('label', { class: 'field' }, el('span', {}, label), input);
}

function photoField(url, onSet) {
  const img = el('img', { class: 'photo-thumb', src: url || transparentPixel(), alt: '' });
  const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const url = await uploadPhoto(f);
      onSet(url);
      toast('Photo added');
    } catch (e) {
      toast('Upload failed: ' + e.message, 'err');
    }
    file.value = '';
  });
  return el(
    'div',
    { class: 'photo-row' },
    img,
    el(
      'div',
      { class: 'photo-btns' },
      el('button', { class: 'btn tiny', onclick: () => file.click() }, url ? 'Replace photo' : 'Upload photo'),
      url ? el('button', { class: 'btn tiny ghost', onclick: () => onSet(null) }, 'Remove') : null,
      file
    )
  );
}

const transparentPixel = () =>
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54"/>');

async function uploadPhoto(file) {
  const res = await fetch('/api/photos', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).url;
}

/* -------------------------------------------------------------- modals */

function modal({ title, body, foot, wide }) {
  const back = el('div', { class: 'modal-back' });
  const box = el(
    'div',
    { class: 'modal' + (wide ? ' wide' : '') },
    el('div', { class: 'modal-head' }, el('h2', {}, title)),
    el('div', { class: 'modal-body' }, ...[body].flat().filter(Boolean)),
    el('div', { class: 'modal-foot' }, ...[foot].flat().filter(Boolean))
  );
  back.append(box);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
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
    placeholder: `MUHAMMED SHAH (Late) + KADEESHABI (Late)\n  SULEIKHA + ALAVI (Late)\n    SALEEM + SAMEENA\n      SAGIL RAHMAN + SHERIN\n      SALIH RAHMAN\n  ABU (Late) + NARGIS`,
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
            el('span', {}, 'Outline — indent for each generation, use “ + ” for a spouse, “(…)” for a note'),
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
    const tree = await api('/trees', { method: 'POST', body });
    m.close();
    await loadLibrary();
    openTree(tree.id);
  }
}

/* -------------------------------------------------------------- design */

function designModal() {
  const t = state.tree;

  const chips = (opts, get, set) => {
    const row = el('div', { class: 'opt-row' });
    const paint = () =>
      row.replaceChildren(
        ...opts.map(([v, label, title]) =>
          el(
            'button',
            { class: 'chip' + (get() === v ? ' sel' : ''), title: title || false, onclick: () => { set(v); paint(); markDirty(); renderStage(); } },
            label
          )
        )
      );
    paint();
    return row;
  };

  const logoImg = el('img', { class: 'photo-thumb', src: t.logo || transparentPixel(), alt: '' });
  const logoFile = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  logoFile.addEventListener('change', async () => {
    const f = logoFile.files[0];
    if (!f) return;
    try {
      t.logo = await uploadPhoto(f);
      logoImg.src = t.logo;
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
      el('p', {}, 'Indent one level per generation. Use “ + ” for a spouse and “(…)” for a note, e.g. “ALAVI (Late)”. Applying replaces the structure; photos are carried over wherever a name still matches.'),
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
    if (p.spouse && p.spouse.photo && !photos.has(key(p.spouse.name))) photos.set(key(p.spouse.name), p.spouse.photo);
    (p.children || []).forEach(collect);
  };
  collect(oldRoot);
  const apply = (p) => {
    if (!p) return;
    if (!p.photo && photos.has(key(p.name))) p.photo = photos.get(key(p.name));
    if (p.spouse && !p.spouse.photo && photos.has(key(p.spouse.name))) p.spouse.photo = photos.get(key(p.spouse.name));
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

  const go = el('button', { class: 'btn primary', onclick: run }, 'Export');
  const m = modal({
    title: 'Export',
    body: [
      el('label', { class: 'field' }, el('span', {}, 'Format'), fmt.row),
      el('label', { class: 'field' }, el('span', {}, 'Resolution'), qty.row),
      pageField,
      status,
    ],
    foot: [el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), go],
  });
  repaintAll();

  async function run() {
    go.disabled = true;
    const onProgress = (msg) => (status.textContent = msg);
    try {
      await flushSave();
      const res =
        format === 'png'
          ? await exportPNG(state.tree, { scale, onProgress })
          : await exportPDF(state.tree, { scale, page, onProgress });
      m.close();
      toast(res.clamped ? 'Exported (scaled down to fit the browser’s canvas limit)' : 'Export ready');
    } catch (e) {
      status.textContent = '';
      toast('Export failed: ' + e.message, 'err');
      go.disabled = false;
    }
  }
}

/* --------------------------------------------------------- json import */

function importJSONFlow() {
  const file = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.root) throw new Error('not a tree file');
      const tree = await api('/trees', {
        method: 'POST',
        body: { name: data.name, subtitle: data.subtitle, template: data.template, logo: data.logo, root: data.root },
      });
      await loadLibrary();
      toast(`Imported “${tree.name}”`);
    } catch (e) {
      toast('Import failed: ' + e.message, 'err');
    }
    file.remove();
  });
  document.body.append(file);
  file.click();
}

/* --------------------------------------------------------------- wiring */

function boot() {
  $('#tree-template').replaceChildren(
    ...TEMPLATES.map((t) => el('option', { value: t.id }, t.label))
  );

  $('#btn-new').onclick = () => newTreeModal(false);
  $('#btn-new-outline').onclick = () => newTreeModal(true);
  $('#btn-import-json').onclick = importJSONFlow;
  $('#lib-empty').querySelector('[data-act=new]').onclick = () => newTreeModal(false);
  $('#lib-search').addEventListener('input', (e) => { state.query = e.target.value; renderLibrary(); });

  $('#btn-back').onclick = closeEditor;
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

  loadLibrary().catch((e) => toast('Could not load trees: ' + e.message, 'err'));
}

boot();
