/* ---------- Simulate: scenario builder (typed blocks), results and history ---------- */
const BICON = {
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  repeat: '<path d="M4.5 11a7.5 7.5 0 0 1 13-4.6L19.5 8.5M19.5 4v4.5H15M19.5 13a7.5 7.5 0 0 1-13 4.6L4.5 15.5M4.5 20v-4.5H9"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
  door: '<path d="M6.5 20V4h10v16M4 20h16M13.5 12h.01"/>',
  stethoscope: '<path d="M6 4v5a4 4 0 0 0 8 0V4M10 13v1.5a5 5 0 0 0 10 0V13"/><circle cx="20" cy="11" r="2"/>',
  steps: '<path d="M4 18h5v-4h5v-4h6"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3v3M12.5 3v3"/>',
  'person-off': '<circle cx="11" cy="8" r="3.5"/><path d="M4 20a7 7 0 0 1 11-5.7M16.5 16l4 4M20.5 16l-4 4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  group: '<circle cx="9" cy="8.5" r="3"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14.5 15.5A5 5 0 0 1 21 20"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>'
};
const bIcon = n => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (BICON[n] || BICON.bolt) + '</svg>';
const SVG_GRIP = '<svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="4" cy="3" r="1.3"/><circle cx="10" cy="3" r="1.3"/><circle cx="4" cy="7" r="1.3"/><circle cx="10" cy="7" r="1.3"/><circle cx="4" cy="11" r="1.3"/><circle cx="10" cy="11" r="1.3"/></svg>';
const SVG_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';
const SVG_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/></svg>';
const SVG_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>';
const SVG_WARN = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l8 14H2z" fill="currentColor" opacity=".16"/><path d="M10 7.5v4M10 14.2v.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const TL_LANES = [['staff', 'Staff'], ['arrivals', 'Arrivals'], ['events', 'Changes'], ['rules', 'Rules']];
const TYPE_COLORS = { shift: '#2453d6', break: '#7d8a96', appointments: '#11806a', walkins: '#2f9e73', out: '#c73a1f', closed: '#8b3fb0', group: '#c98a10', rule: '#e0592a', hours: '#5d6b78', run: '#5d6b78', steps: '#2453d6', visit_type: '#2453d6' };
const ROLE_COLORS = { provider: '#8b3fb0', nurse: '#11806a', reception: '#5d6b78' };
const SWEEP_FIELDS = { patients: 'Patients per day', providers: 'Providers', nurses: 'Nurses', receptionists: 'Receptionists' };
const HISTORY_KEY = 'fi.simHistory.v1';
Object.assign(state, { simTab: 'scenario', scn: null, run: null, running: false, history: [], sweep: null, histSel: new Set(), folded: new Set(), probs: [], tl: { t0: 0, t1: 600 } });

/* ---------- Tabs inside Simulate ---------- */
function setSimTab(t) {
  state.simTab = t;
  const app = $('#app');
  ['scenario', 'results', 'history'].forEach(k => app.classList.toggle('sim-' + k, k === t));
  document.querySelectorAll('[data-simtab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.simtab === t)));
  if (t === 'scenario') renderDayTimeline();
  if (t === 'history') renderHistory();
  if (t === 'results') renderResults();
  requestAnimationFrame(() => { resize(); drawTimeline(); });
}
function blockOf(id) { return state.scn.blocks.find(b => b.id === id); }
function safeSummary(b) { try { const T = BLOCK_TYPES[b.type]; return T && T.summary ? T.summary(b.fields, state.P) : ''; } catch (e) { return ''; } }
function markEdited() { if (state.scn) state.scn.edited = true; renderPresetChips(); }

/* ---------- Presets and the scenario header ---------- */
function renderPresetChips() {
  const box = $('#presetRow');
  if (!box || !state.scn) return;
  box.innerHTML = '<span class="small muted">Start from</span>' + Object.entries(SCENARIO_PRESETS).map(([k, p]) => {
    const on = state.scn.preset === k;
    return '<button type="button" class="preset' + (on ? ' on' : '') + '" data-preset="' + k + '" aria-pressed="' + on + '" title="' + esc(p.desc) + '">' + esc(p.label) + (on && state.scn.edited ? '<em>edited</em>' : '') + '</button>';
  }).join('');
  box.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => loadPreset(b.dataset.preset)));
}
function fillRoomDefaults(scn) {
  const ex = state.P && state.P.m.rooms.find(r => r.type === 'exam_room');
  for (const b of scn.blocks) if (b.type === 'closed' && !b.fields.room && ex) b.fields.room = ex.id;
  return scn;
}
function loadPreset(key) {
  const prev = state.scn ? JSON.parse(JSON.stringify(state.scn)) : null;
  state.scn = fillRoomDefaults(makeScenario(key));
  state.folded = new Set();
  renderBuilder();
  if (prev && prev.edited) toastAction('Loaded “' + SCENARIO_PRESETS[key].label + '”. Your edits were replaced.', 'Undo', () => { state.scn = prev; renderBuilder(); });
}
function toastAction(msg, label, fn) {
  const t = $('#toast');
  t.innerHTML = '<span>' + esc(msg) + '</span> <button type="button" class="btn small" id="toastAct">' + esc(label) + '</button>';
  t.hidden = false;
  $('#toastAct').addEventListener('click', () => { t.hidden = true; fn(); });
  clearTimeout(toastAction.timer);
  toastAction.timer = setTimeout(() => { t.hidden = true; }, 7000);
}

/* ---------- Palette ---------- */
function renderPalette() {
  const box = $('#palette');
  box.innerHTML = '<h2>Blocks</h2><p class="small muted">Drag a block into the scenario, or click it to add it.</p>' + BLOCK_GROUPS.map(g => {
    const types = Object.entries(BLOCK_TYPES).filter(([, T]) => T.group === g.key);
    return '<section><h3>' + esc(g.label) + '</h3>' + types.map(([k, T]) => '<button type="button" class="pchip" data-add="' + k + '"><span class="pi" style="--c:' + (TYPE_COLORS[k] || '#5d6b78') + '">' + bIcon(T.icon) + '</span><span class="pt"><b>' + esc(T.label) + '</b><small>' + esc(T.desc) + '</small></span></button>').join('') + '</section>';
  }).join('');
  box.querySelectorAll('.pchip').forEach(b => {
    b.addEventListener('pointerdown', e => startBlockDrag(e, { add: b.dataset.add }));
    b.addEventListener('click', () => { if (dragJustEnded) return; addBlock(b.dataset.add); });
  });
}

/* ---------- Block cards with typed fields ---------- */
function fieldInput(b, k, f) {
  const v = b.fields[k], id = 'f_' + b.id + '_' + k;
  let inp;
  if (f.type === 'int' || f.type === 'percent') inp = '<span class="inwrap"><input type="number" inputmode="numeric" id="' + id + '" data-k="' + k + '" value="' + (typeof v === 'number' && isFinite(v) ? v : '') + '" min="' + (f.min != null ? f.min : '') + '" max="' + (f.max != null ? f.max : '') + '" step="1">' + (f.type === 'percent' ? '<i>%</i>' : '') + '</span>';
  else if (f.type === 'time') inp = '<input type="time" id="' + id + '" data-k="' + k + '" value="' + esc(v || '') + '" step="300">';
  else if (f.type === 'enum') inp = '<select id="' + id + '" data-k="' + k + '">' + Object.entries(f.options).map(([o, l]) => '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
  else if (f.type === 'text') inp = '<input type="text" id="' + id + '" data-k="' + k + '" value="' + esc(v || '') + '" maxlength="' + (f.max || 40) + '">';
  else if (f.type === 'range') { const r = Array.isArray(v) ? v : ['', '']; inp = '<span class="rangein"><input type="number" id="' + id + '" data-k="' + k + '" data-i="0" value="' + r[0] + '" min="' + f.min + '" max="' + f.max + '" step="1" aria-label="' + esc(f.label) + ', shortest"><span>to</span><input type="number" data-k="' + k + '" data-i="1" value="' + r[1] + '" min="' + f.min + '" max="' + f.max + '" step="1" aria-label="' + esc(f.label) + ', longest"></span>'; }
  else if (f.type === 'bool') inp = '<label class="switch"><input type="checkbox" id="' + id + '" data-k="' + k + '"' + (v ? ' checked' : '') + '><span></span></label>';
  else if (f.type === 'room') { const rooms = state.P ? state.P.m.rooms.filter(r => !f.roomTypes || f.roomTypes.includes(r.type)) : []; inp = '<select id="' + id + '" data-k="' + k + '"><option value="">Pick a room</option>' + rooms.map(r => '<option value="' + esc(r.id) + '"' + (r.id === v ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('') + '</select>'; }
  const hide = f.showIf && !f.showIf(b.fields);
  return '<div class="frow t-' + f.type + (hide ? ' is-hidden' : '') + '" data-k="' + k + '"><label for="' + id + '">' + esc(f.label) + '</label>' + inp + (f.help ? '<small>' + esc(f.help) + '</small>' : '') + '</div>';
}
function cardColor(b) { return b.type === 'shift' ? ROLE_COLORS[b.fields.role] || '#2453d6' : TYPE_COLORS[b.type] || '#2453d6'; }
function cardHTML(b) {
  const T = BLOCK_TYPES[b.type];
  if (!T) return '<article class="bcard bad" data-id="' + esc(b.id) + '"><header><span class="bt"><b>Unknown block “' + esc(b.type) + '”</b><span class="bsum">This version doesn’t know this block yet.</span></span><span class="bacts"><button type="button" class="iconbtn sm" data-act="del" aria-label="Remove this block">' + SVG_TRASH + '</button></span></header></article>';
  const fold = state.folded.has(b.id);
  const acts = (T.required ? '' : '<label class="switch sm" title="Use this block"><input type="checkbox" data-act="toggle"' + (b.enabled !== false ? ' checked' : '') + ' aria-label="Use this block"><span></span></label>' + (T.single ? '' : '<button type="button" class="iconbtn sm" data-act="dup" aria-label="Copy this block" title="Copy">' + SVG_COPY + '</button>') + '<button type="button" class="iconbtn sm" data-act="del" aria-label="Remove this block" title="Remove">' + SVG_TRASH + '</button>') + '<button type="button" class="iconbtn sm fold" data-act="fold" aria-expanded="' + !fold + '" aria-label="' + (fold ? 'Show the fields' : 'Hide the fields') + '">' + SVG_CHEV + '</button>';
  return '<article class="bcard' + (b.enabled === false ? ' off' : '') + (fold ? ' folded' : '') + '" data-id="' + b.id + '" style="--c:' + cardColor(b) + '">'
    + '<header>' + (T.single ? '<span class="grip ghost" aria-hidden="true"></span>' : '<span class="grip" title="Drag to reorder" aria-hidden="true">' + SVG_GRIP + '</span>') + '<span class="bi">' + bIcon(T.icon) + '</span><span class="bt"><b>' + esc(T.label) + '</b><span class="bsum">' + esc(safeSummary(b)) + '</span></span><span class="bacts">' + acts + '</span></header>'
    + '<div class="bfields">' + Object.entries(T.fields).map(([k, f]) => fieldInput(b, k, f)).join('') + '</div><div class="berr" hidden></div></article>';
}
function renderBuilder() {
  const scn = state.scn;
  if (!scn) return;
  $('#scnName').value = scn.name;
  renderPresetChips();
  const box = $('#scnSections');
  box.innerHTML = BLOCK_GROUPS.map(g => {
    const list = scn.blocks.filter(b => (BLOCK_TYPES[b.type] ? BLOCK_TYPES[b.type].group : 'rules') === g.key);
    return '<section class="bsec" data-group="' + g.key + '"><header><h3>' + esc(g.label) + '</h3><small>' + esc(g.hint) + '</small><span class="cnt">' + list.length + '</span></header><div class="bcards" data-group="' + g.key + '">' + list.map(cardHTML).join('') + '<div class="dropslot' + (list.length ? ' subtle' : '') + '">' + (list.length ? 'Drop here' : 'Drag a block here from the list, or click one') + '</div></div></section>';
  }).join('');
  refreshChecks(); renderDayTimeline();
}
function updateCardSummary(card, b) { const s = card.querySelector('.bsum'); if (s) s.textContent = safeSummary(b); card.style.setProperty('--c', cardColor(b)); }
function syncCardFields(b) {
  const card = document.querySelector('.bcard[data-id="' + b.id + '"]');
  if (!card) return;
  card.querySelectorAll('[data-k]').forEach(el => { if (el.tagName === 'DIV') return; const k = el.dataset.k, v = b.fields[k]; if (el.type === 'time' || el.tagName === 'SELECT' || el.type === 'text') el.value = v == null ? '' : v; });
  updateCardSummary(card, b);
}
function parseFieldValue(el, f, cur) {
  if (f.type === 'int' || f.type === 'percent') return el.value === '' ? NaN : Number(el.value);
  if (f.type === 'range') { const r = Array.isArray(cur) ? cur.slice() : [NaN, NaN]; r[+el.dataset.i] = el.value === '' ? NaN : Number(el.value); return r; }
  if (f.type === 'bool') return el.checked;
  return el.value;
}
let checkTimer = 0;
function scheduleChecks(now) { clearTimeout(checkTimer); checkTimer = setTimeout(() => { refreshChecks(); renderDayTimeline(); }, now ? 0 : 140); }
function bindBuilder() {
  const box = $('#scnSections');
  const onField = e => {
    const el = e.target, card = el.closest('.bcard');
    if (!card || !el.dataset.k || el.dataset.act) return;
    const b = blockOf(card.dataset.id), T = b && BLOCK_TYPES[b.type];
    if (!T) return;
    const f = T.fields[el.dataset.k];
    b.fields[el.dataset.k] = parseFieldValue(el, f, b.fields[el.dataset.k]);
    for (const [k2, f2] of Object.entries(T.fields)) if (f2.showIf) { const row = card.querySelector('.frow[data-k="' + k2 + '"]'); if (row) row.classList.toggle('is-hidden', !f2.showIf(b.fields)); }
    updateCardSummary(card, b); markEdited(); scheduleChecks();
  };
  box.addEventListener('input', onField);
  box.addEventListener('change', onField);
  box.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.bcard'), id = card && card.dataset.id, b = id && blockOf(id), act = btn.dataset.act;
    if (!card) return;
    if (act === 'toggle') { b.enabled = btn.checked; card.classList.toggle('off', !btn.checked); markEdited(); scheduleChecks(true); }
    else if (act === 'dup') { const c = JSON.parse(JSON.stringify(b)); c.id = makeBlock(b.type).id; const arr = state.scn.blocks; arr.splice(arr.indexOf(b) + 1, 0, c); markEdited(); renderBuilder(); focusCard(c.id, true); }
    else if (act === 'del') { const arr = state.scn.blocks, i = arr.findIndex(x => x.id === id), gone = arr.splice(i, 1)[0]; markEdited(); renderBuilder(); toastAction('Removed “' + (BLOCK_TYPES[gone.type] ? BLOCK_TYPES[gone.type].label : gone.type) + '”.', 'Undo', () => { state.scn.blocks.splice(i, 0, gone); renderBuilder(); focusCard(gone.id, true); }); }
    else if (act === 'fold') { if (state.folded.has(id)) state.folded.delete(id); else state.folded.add(id); card.classList.toggle('folded'); btn.setAttribute('aria-expanded', String(!state.folded.has(id))); }
  });
  box.addEventListener('pointerdown', e => { const g = e.target.closest('.grip'); if (!g || g.classList.contains('ghost')) return; const card = g.closest('.bcard'); startBlockDrag(e, { move: card.dataset.id }); });
  $('#scnName').addEventListener('input', e => { state.scn.name = e.target.value.slice(0, 60) || 'My scenario'; markEdited(); });
}
function smartDefaults(type) {
  const on = state.scn.blocks.filter(b => b.enabled !== false);
  if (type === 'shift') { const have = new Set(on.filter(b => b.type === 'shift').map(b => b.fields.role)); const role = ['provider', 'nurse', 'reception'].find(r => !have.has(r)) || 'nurse'; return { role, count: role === 'provider' ? 3 : role === 'nurse' ? 2 : 1 }; }
  if (type === 'closed') { const ex = state.P && state.P.m.rooms.find(r => r.type === 'exam_room'); return { room: ex ? ex.id : '' }; }
  if (type === 'visit_type') { const n = on.filter(b => b.type === 'visit_type').length; return n ? { name: 'Visit type ' + (n + 1), share: 20, provider_min: [15, 25] } : { name: 'Standard visit', share: 100 }; }
  return {};
}
function addBlock(type, beforeId) {
  const T = BLOCK_TYPES[type];
  if (!T || !state.scn) return;
  const existing = T.single && state.scn.blocks.find(b => b.type === type);
  if (existing) { focusCard(existing.id, true); toast('This scenario already has “' + T.label + '”.'); return; }
  const b = makeBlock(type, smartDefaults(type));
  insertBlock(b, beforeId);
  markEdited(); renderBuilder(); focusCard(b.id, true);
}
function insertBlock(b, beforeId) {
  const arr = state.scn.blocks, i = beforeId ? arr.findIndex(x => x.id === beforeId) : -1;
  if (i >= 0) arr.splice(i, 0, b); else arr.push(b);
}
function moveBlock(id, beforeId) {
  if (id === beforeId) return;
  const arr = state.scn.blocks, i = arr.findIndex(x => x.id === id);
  if (i < 0) return;
  const b = arr.splice(i, 1)[0];
  insertBlock(b, beforeId);
  markEdited(); renderBuilder(); focusCard(b.id, true);
}
function focusCard(id, flash) {
  if (state.simTab !== 'scenario') setSimTab('scenario');
  const card = document.querySelector('.bcard[data-id="' + id + '"]');
  if (!card) return;
  card.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  if (flash) { card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
}

/* ---------- Drag and drop: palette into the scenario, and cards within their section ---------- */
let bDrag = null, dragJustEnded = false;
function startBlockDrag(e, src) {
  if (e.button !== 0 || !state.scn) return;
  e.preventDefault();
  bDrag = { src, x0: e.clientX, y0: e.clientY, active: false, ghost: null, target: null };
  window.addEventListener('pointermove', moveBlockDrag);
  window.addEventListener('pointerup', endBlockDrag);
  window.addEventListener('pointercancel', cancelBlockDrag);
}
function clearInsertLine() { document.querySelectorAll('.insline').forEach(n => n.remove()); }
function moveBlockDrag(e) {
  const d = bDrag;
  if (!d) return;
  if (!d.active) {
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    const type = d.src.add || (blockOf(d.src.move) || {}).type, T = BLOCK_TYPES[type];
    if (!T) { cancelBlockDrag(); return; }
    d.active = true; d.group = T.group;
    document.body.classList.add('dragging-block');
    const sec = document.querySelector('.bsec[data-group="' + T.group + '"]');
    if (sec) sec.classList.add('drop-ok');
    if (d.src.move) { const c = document.querySelector('.bcard[data-id="' + d.src.move + '"]'); if (c) c.classList.add('lifted'); }
    const g = document.createElement('div');
    g.className = 'dragghost'; g.style.setProperty('--c', TYPE_COLORS[type] || '#2453d6');
    g.innerHTML = bIcon(T.icon) + '<span>' + esc(T.label) + '</span>';
    document.body.appendChild(g); d.ghost = g;
  }
  d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
  const cv = $('#scnCanvas'), cr = cv.getBoundingClientRect();
  if (e.clientY < cr.top + 50) cv.scrollTop -= 14; else if (e.clientY > cr.bottom - 50) cv.scrollTop += 14;
  const list = document.querySelector('.bcards[data-group="' + d.group + '"]');
  clearInsertLine();
  if (!list) return;
  const sr = list.closest('.bsec').getBoundingClientRect();
  const over = e.clientX >= cr.left && e.clientX <= cr.right && e.clientY >= sr.top - 40 && e.clientY <= sr.bottom + 40;
  if (!over) { d.target = null; return; }
  const cards = [...list.querySelectorAll('.bcard')].filter(c => c.dataset.id !== d.src.move);
  let idx = cards.length;
  for (let i = 0; i < cards.length; i++) { const r = cards[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { idx = i; break; } }
  d.target = { before: cards[idx] ? cards[idx].dataset.id : null, after: idx > 0 ? cards[idx - 1].dataset.id : null };
  const line = document.createElement('div');
  line.className = 'insline';
  list.insertBefore(line, cards[idx] || list.querySelector('.dropslot'));
}
function cleanupBlockDrag() {
  window.removeEventListener('pointermove', moveBlockDrag);
  window.removeEventListener('pointerup', endBlockDrag);
  window.removeEventListener('pointercancel', cancelBlockDrag);
  document.body.classList.remove('dragging-block');
  document.querySelectorAll('.drop-ok').forEach(n => n.classList.remove('drop-ok'));
  document.querySelectorAll('.lifted').forEach(n => n.classList.remove('lifted'));
  clearInsertLine();
  if (bDrag && bDrag.ghost) bDrag.ghost.remove();
}
function cancelBlockDrag() { cleanupBlockDrag(); bDrag = null; }
function endBlockDrag() {
  const d = bDrag;
  cleanupBlockDrag();
  bDrag = null;
  if (!d || !d.active) return;
  dragJustEnded = true;
  setTimeout(() => { dragJustEnded = false; }, 0);
  if (!d.target) return;
  const arr = state.scn.blocks;
  let before = d.target.before;
  if (!before && d.target.after) { const i = arr.findIndex(x => x.id === d.target.after); before = arr[i + 1] && arr[i + 1].id !== d.src.move ? arr[i + 1].id : null; }
  if (d.src.add) addBlock(d.src.add, before); else moveBlock(d.src.move, before);
}

/* ---------- Day timeline: bars you can drag to move, or stretch by their edges ---------- */
function timelineLabel(b) {
  const f = b.fields;
  switch (b.type) {
    case 'shift': return f.count + ' ' + roleName(f.role, f.count);
    case 'break': return roleName(f.role, 1).replace(/^./, c => c.toUpperCase()) + ' breaks, ' + f.minutes + ' min';
    case 'appointments': return f.count + ' appointments';
    case 'walkins': return f.count + ' walk-ins';
    case 'out': return f.count + ' ' + roleName(f.role, f.count) + ' out';
    case 'closed': return (roomLabel(state.P, f.room) || 'A room') + ' closed';
    case 'group': return f.count + ' arrive together';
    case 'rule': return 'Rule: ' + ({ waiting: 'lobby', longest: 'longest wait', desk: 'reception line', free_rooms: 'free rooms' })[f.metric] + (f.op === 'lt' ? ' < ' : ' > ') + f.value;
    default: return BLOCK_TYPES[b.type] ? BLOCK_TYPES[b.type].label : b.type;
  }
}
function renderDayTimeline() {
  const box = $('#dayTimeline'), scn = state.scn;
  if (!box || !scn) return;
  const hb = scn.blocks.find(b => b.type === 'hours' && b.enabled !== false);
  let t0 = hb ? hm(hb.fields.opens) : 0, t1 = hb ? hm(hb.fields.closes) : 600;
  if (!(t1 > t0)) { t0 = 0; t1 = 600; }
  state.tl = { t0, t1 };
  const X = t => ((clamp(t, t0, t1) - t0) / (t1 - t0) * 100);
  let ticks = '';
  for (let t = Math.ceil((t0 + 480) / 60) * 60 - 480; t <= t1 + 0.1; t += 60) ticks += '<span style="left:' + X(t).toFixed(2) + '%">' + fmtClock(t).replace(':00', '') + '</span>';
  const lanes = {};
  TL_LANES.forEach(([k]) => { lanes[k] = []; });
  for (const b of scn.blocks) {
    const T = BLOCK_TYPES[b.type];
    if (b.enabled === false || !T || !T.timeline) continue;
    const L = T.timeline, f = b.fields;
    if (L.at) { const t = hm(f[L.at]); if (!isNaN(t)) lanes[L.lane].push({ b, a: t, z: t, point: true }); }
    else { const a = hm(f[L.from]), z = hm(f[L.to]); if (!isNaN(a) && !isNaN(z)) lanes[L.lane].push({ b, a, z: Math.max(z, a + 5), soft: L.soft }); }
  }
  let html = '<div class="tl-axis"><span class="tl-name"></span><div class="tl-ticks">' + ticks + '</div></div>';
  for (const [k, name] of TL_LANES) {
    const items = lanes[k].sort((p, q) => p.a - q.a || q.z - p.z), rows = [];
    for (const it of items) { let r = rows.findIndex(end => end <= it.a); if (r < 0) { r = rows.length; rows.push(0); } rows[r] = it.point ? it.a + (t1 - t0) * 0.12 : it.z; it.row = r; }
    const fires = k === 'rules' && state.run && state.run.fires ? state.run.fires : [];
    html += '<div class="tl-lane" data-lane="' + k + '" style="--rows:' + Math.max(1, rows.length) + '"><span class="tl-name">' + name + '</span><div class="tl-track">'
      + (items.length ? '' : '<span class="tl-empty">' + ({ staff: 'Add a staff shift', arrivals: 'Add appointments or walk-ins', events: 'Breaks out, closed rooms and groups show here', rules: 'Rules show here' })[k] + '</span>')
      + items.map(it => {
        const b = it.b, c = cardColor(b), lbl = esc(timelineLabel(b)), tip = esc(BLOCK_TYPES[b.type].label + ': ' + safeSummary(b));
        if (it.point) return '<div class="tl-bar point" data-id="' + b.id + '" style="left:' + X(it.a).toFixed(3) + '%;--row:' + it.row + ';--c:' + c + '" title="' + tip + '"><span class="dot"></span><span class="lbl">' + lbl + '</span></div>';
        return '<div class="tl-bar' + (it.soft ? ' soft' : '') + '" data-id="' + b.id + '" style="left:' + X(it.a).toFixed(3) + '%;width:' + (X(it.z) - X(it.a)).toFixed(3) + '%;--row:' + it.row + ';--c:' + c + '" title="' + tip + '"><span class="h" data-h="l"></span><span class="lbl">' + lbl + '</span><span class="h" data-h="r"></span></div>';
      }).join('')
      + fires.map(f => '<span class="tl-fire" style="left:' + X(f.t).toFixed(3) + '%" title="A rule fired at ' + fmtClock(f.t) + ' on the day shown"></span>').join('')
      + '</div></div>';
  }
  box.innerHTML = html;
}
let tlDrag = null;
function bindDayTimeline() {
  const box = $('#dayTimeline');
  box.addEventListener('pointerdown', e => {
    const el = e.target.closest('.tl-bar');
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const b = blockOf(el.dataset.id), L = BLOCK_TYPES[b.type].timeline, track = el.parentElement.getBoundingClientRect();
    tlDrag = { el, b, L, h: e.target.dataset.h || 'm', x0: e.clientX, w: track.width, a0: hm(b.fields[L.at || L.from]), z0: L.at ? null : hm(b.fields[L.to]), moved: false };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });
  box.addEventListener('pointermove', e => {
    const d = tlDrag;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    const { t0, t1 } = state.tl, dt = (e.clientX - d.x0) / d.w * (t1 - t0), snap = t => Math.round(t / 5) * 5;
    let a = d.a0, z = d.z0;
    if (d.L.at) a = clamp(snap(d.a0 + dt), t0, t1);
    else if (d.h === 'l') a = clamp(snap(d.a0 + dt), t0, d.z0 - 5);
    else if (d.h === 'r') z = clamp(snap(d.z0 + dt), d.a0 + 5, t1);
    else { const len = d.z0 - d.a0; a = clamp(snap(d.a0 + dt), t0, Math.max(t0, t1 - len)); z = a + len; }
    if (d.L.at) d.b.fields[d.L.at] = hmStr(a); else { d.b.fields[d.L.from] = hmStr(a); d.b.fields[d.L.to] = hmStr(z); }
    const X = t => (t - t0) / (t1 - t0) * 100;
    d.el.style.left = X(a) + '%';
    if (!d.L.at) d.el.style.width = (X(z) - X(a)) + '%';
    const tip = $('#tlTip');
    tip.textContent = d.L.at ? fmtClock(a) : fmtClock(a) + ' to ' + fmtClock(z);
    tip.hidden = false;
    const br = $('#dayTimeline').getBoundingClientRect();
    tip.style.left = (e.clientX - br.left) + 'px'; tip.style.top = (d.el.getBoundingClientRect().top - br.top - 30) + 'px';
    syncCardFields(d.b); markEdited();
  });
  const up = () => {
    const d = tlDrag;
    if (!d) return;
    tlDrag = null;
    d.el.classList.remove('dragging');
    $('#tlTip').hidden = true;
    if (!d.moved) { focusCard(d.b.id, true); return; }
    scheduleChecks(true);
  };
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
}

/* ---------- Checks panel ---------- */
function refreshChecks() {
  if (!state.scn) return;
  const probs = validateScenario(state.scn, state.P);
  state.probs = probs;
  const errs = probs.filter(p => p.level === 'error'), warns = probs.filter(p => p.level === 'warning');
  const st = $('#chkStatus');
  st.className = 'chkstatus ' + (errs.length ? 'bad' : warns.length ? 'warn' : 'ok');
  st.innerHTML = errs.length
    ? '<span class="ic">' + ICON.fail + '</span><span><b>' + errs.length + (errs.length === 1 ? ' problem' : ' problems') + ' to fix</b>Running is blocked until these are fixed.</span>'
    : '<span class="ic">' + ICON.pass + '</span><span><b>Ready to run</b>' + (warns.length ? warns.length + (warns.length === 1 ? ' warning, which won’t' : ' warnings, which won’t') + ' stop a run.' : 'Everything checks out.') + '</span>';
  $('#chkList').innerHTML = probs.map((p, i) => '<li class="' + p.level + '"><button type="button" data-pi="' + i + '"><span class="ic">' + (p.level === 'error' ? ICON.fail : SVG_WARN) + '</span><span>' + esc(p.msg) + '</span></button></li>').join('');
  $('#chkList').querySelectorAll('[data-pi]').forEach(btn => btn.addEventListener('click', () => focusProblem(+btn.dataset.pi)));
  document.querySelectorAll('.bcard').forEach(c => {
    const mine = probs.filter(p => p.block === c.dataset.id), box = c.querySelector('.berr');
    if (box) { box.hidden = !mine.length; box.innerHTML = mine.map(p => '<p class="' + p.level + '">' + esc(p.msg) + '</p>').join(''); }
    c.classList.toggle('has-error', mine.some(p => p.level === 'error'));
    c.querySelectorAll('.frow').forEach(r => r.classList.toggle('bad', mine.some(p => p.level === 'error' && p.field === r.dataset.k)));
  });
  let facts = '';
  if (!errs.length) {
    const sc = compileScenario(state.scn), on = state.scn.blocks.filter(b => b.enabled !== false), count = t => on.filter(b => b.type === t).length;
    facts = '<ul class="facts"><li>About ' + sc.patients + ' patients, open ' + fmtClock(sc.opens) + ' to ' + fmtClock(sc.closes) + '</li><li>' + sc.providers + ' ' + roleName('provider', sc.providers) + ', ' + sc.nurses + ' ' + roleName('nurse', sc.nurses) + ', ' + sc.receptionists + ' ' + roleName('reception', sc.receptionists) + '</li>'
      + '<li>' + [[count('break'), 'break'], [count('out'), 'staff out'], [count('closed'), 'room closed'], [count('group'), 'group arrival'], [count('rule'), 'rule']].filter(x => x[0]).map(x => x[0] + ' ' + x[1] + (x[0] > 1 && x[1] !== 'staff out' && x[1] !== 'room closed' ? 's' : '')).join(', ').replace(/^$/, 'No breaks or changes during the day') + '</li></ul>';
  }
  $('#chkSummary').innerHTML = facts;
  const rb = state.scn.blocks.find(b => b.type === 'run' && b.enabled !== false), days = rb && Number.isInteger(rb.fields.days) ? rb.fields.days : 20;
  const runBtn = $('#runBtn');
  runBtn.disabled = !!errs.length || state.running;
  runBtn.textContent = state.running ? 'Running…' : 'Run ' + days + (days === 1 ? ' day' : ' days');
  $('#sweepBtn').disabled = !!errs.length || state.running;
}
function focusProblem(i) {
  const p = state.probs[i];
  if (!p) return;
  if (!p.block) { const btn = document.querySelector('.pchip'); if (btn) btn.scrollIntoView({ block: 'nearest' }); return; }
  state.folded.delete(p.block);
  const card = document.querySelector('.bcard[data-id="' + p.block + '"]');
  if (card) card.classList.remove('folded');
  focusCard(p.block, true);
  if (p.field && card) { const inp = card.querySelector('[data-k="' + p.field + '"]:not(div)'); if (inp) setTimeout(() => inp.focus(), 200); }
}

/* ---------- Running: many days, then the typical day plays in 3D ---------- */
function planTag() { const v = state.versions[state.vIndex]; return v ? { name: v.name, version: v.n } : { name: 'Plan', version: 1 }; }
function setProgress(done, total, label) {
  const bar = $('#runProgress');
  bar.hidden = total === 0;
  bar.querySelector('i').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  bar.querySelector('span').textContent = label || '';
}
async function runDays(sc, n, onTick) {
  const days = [];
  for (let d = 0; d < n; d++) { days.push(runDay(state.P, sc, daySeed(sc.seed, d))); if (onTick && d % 2 === 1) { onTick(d + 1); await new Promise(r => setTimeout(r, 0)); } }
  return days;
}
function playTypical(sc, seed) {
  state.scenario = sc; state.seed = seed;
  resetSim(Math.max(sc.opens, Math.min(90, sc.closes - 60)));
  state.playing = !reduceMotion; updateTransport();
}
async function runScenario(opts) {
  if (state.running || !state.P) return;
  refreshChecks();
  const errs = state.probs.filter(p => p.level === 'error');
  if (errs.length) { setSimTab('scenario'); focusProblem(state.probs.indexOf(errs[0])); toast('Fix this first: ' + errs[0].msg); return; }
  const sc = compileScenario(state.scn), n = sc.days;
  state.running = true; refreshChecks();
  setProgress(0, n, 'Simulating ' + n + ' days…');
  const days = await runDays(sc, n, k => setProgress(k, n, 'Simulating day ' + k + ' of ' + n + '…'));
  const sum = summarizeDays(days), v = verdictOf(sum);
  state.running = false; setProgress(0, 0);
  state.run = { id: 'r' + Date.now().toString(36), at: Date.now(), kind: 'run', name: state.scn.name, scn: JSON.parse(JSON.stringify(state.scn)), sc, sum, v, fires: sum.typical.fireList, plan: planTag() };
  state.sweep = null;
  if (!opts || opts.save !== false) saveHistory(state.run);
  playTypical(sc, sum.typical.seed);
  refreshChecks(); renderDayTimeline(); setSimTab('results');
  return state.run;
}
function runScenarioNow() {
  if (state.running || !state.P) return null;
  refreshChecks();
  if (state.probs.some(p => p.level === 'error')) return null;
  const sc = compileScenario(state.scn), days = [];
  for (let d = 0; d < sc.days; d++) days.push(runDay(state.P, sc, daySeed(sc.seed, d)));
  const sum = summarizeDays(days), v = verdictOf(sum);
  state.run = { id: 'r' + Date.now().toString(36), at: Date.now(), kind: 'run', name: state.scn.name, scn: JSON.parse(JSON.stringify(state.scn)), sc, sum, v, fires: sum.typical.fireList, plan: planTag() };
  saveHistory(state.run);
  playTypical(sc, sum.typical.seed);
  refreshChecks(); renderDayTimeline(); setSimTab('results');
  return state.run;
}
function parseSweepValues(text, field) {
  const max = field === 'patients' ? 200 : 10, min = field === 'patients' ? 1 : 1;
  const vals = String(text || '').split(/[\s,;]+/).map(Number).filter(x => Number.isInteger(x) && x >= min && x <= max);
  return [...new Set(vals)].slice(0, 6);
}
async function runSweep() {
  if (state.running || !state.P) return;
  refreshChecks();
  if (state.probs.some(p => p.level === 'error')) { toast('Fix the problems in the scenario first.'); return; }
  const field = $('#swField').value, vals = parseSweepValues($('#swValues').value, field);
  if (vals.length < 2) { toast('Enter at least two values, like 1, 2, 3.'); return; }
  const base = compileScenario(state.scn), n = Math.min(10, base.days), rows = [], total = vals.length * n;
  state.running = true; refreshChecks();
  for (let i = 0; i < vals.length; i++) {
    const scn = applyOverrides(state.scn, { [field]: vals[i] }), sc = compileScenario(scn);
    const days = await runDays(sc, n, k => setProgress(i * n + k, total, SWEEP_FIELDS[field] + ' = ' + vals[i] + ': day ' + k + ' of ' + n));
    const sum = summarizeDays(days);
    rows.push({ value: vals[i], sum, v: verdictOf(sum), sc });
  }
  state.running = false; setProgress(0, 0);
  const mid = rows[Math.floor((rows.length - 1) / 2)];
  state.run = { id: 'r' + Date.now().toString(36), at: Date.now(), kind: 'range', name: state.scn.name + ': ' + SWEEP_FIELDS[field].toLowerCase() + ' ' + vals.join(', '), scn: JSON.parse(JSON.stringify(state.scn)), sc: mid.sc, sum: mid.sum, v: mid.v, fires: mid.sum.typical.fireList, plan: planTag(), sweep: { field, n, rows: rows.map(r => ({ value: r.value, agg: r.sum.agg, v: r.v })) } };
  saveHistory(state.run);
  playTypical(mid.sc, mid.sum.typical.seed);
  refreshChecks(); setSimTab('results');
}

/* ---------- Results ---------- */
function rng(x, f) { return f(x.mean) + (Math.abs(x.hi - x.lo) > 1e-9 ? '<small>' + f(x.lo) + ' to ' + f(x.hi) + '</small>' : ''); }
const fmtPct = v => Math.round(v * 100) + '%', fmtKm = v => v.toFixed(1) + ' km', fmtN = v => String(Math.round(v));
function renderResults() {
  const box = $('#resultsBody');
  if (!box) return;
  const r = state.run;
  if (!r) {
    box.innerHTML = '<div class="empty"><h3>No results yet</h3><p>Set up a scenario and run it. The answer shows up here, and the 3D plays a typical day.</p><button type="button" class="btn primary" id="goScenario">Set up a scenario</button></div>';
    $('#goScenario').addEventListener('click', () => setSimTab('scenario'));
    $('#playNote').textContent = '';
    return;
  }
  const a = r.sum.agg, v = r.v, n = r.sum.n, tw = r.sum.typical;
  const util = Object.entries(v.util).sort((x, y) => y[1] - x[1]);
  const peak = v.peak && v.peak.lobby ? 'The lobby was fullest around ' + fmtClock(v.peak.t) + ' on the day shown, with ' + v.peak.lobby + ' waiting.' : 'The lobby never really filled up on the day shown.';
  const rules = (r.sc.rules || []).map(rule => { const k = r.sum.fireDays[rule.id] || 0; return '<li><b>Fired on ' + k + ' of ' + n + ' days.</b> ' + esc(rule.label) + '</li>'; }).join('');
  let sweep = '';
  if (r.sweep) {
    const S = r.sweep;
    sweep = '<section class="rsec"><h3>' + esc(SWEEP_FIELDS[S.field]) + ', compared</h3><p class="small muted">' + S.n + ' days each. The 3D plays the middle value.</p><div class="tablewrap"><table class="cmp small"><thead><tr><th scope="col">' + esc(SWEEP_FIELDS[S.field]) + '</th><th scope="col">Verdict</th><th scope="col">Average wait</th><th scope="col">1 in 10 over</th><th scope="col">Busiest</th></tr></thead><tbody>'
      + S.rows.map(x => '<tr><th scope="row">' + x.value + '</th><td><span class="vpill ' + x.v.level + '">' + esc(x.v.title) + '</span></td><td>' + fmtMin(x.agg.avgWait.mean) + '</td><td>' + fmtMin(x.agg.p90Wait.mean) + '</td><td>' + esc(x.v.bottleneck.name) + ' ' + fmtPct(x.v.bottleneck.util) + '</td></tr>').join('') + '</tbody></table></div></section>';
  }
  const ns = a.notSeen.mean >= 0.05 ? ' On average ' + (a.notSeen.mean < 1 ? 'less than 1 patient was' : fmtN(a.notSeen.mean) + ' patients were') + ' still waiting when the staff went home.' : '';
  box.innerHTML = '<p class="rmeta">' + esc(r.name) + '<span>' + n + (n === 1 ? ' day' : ' days') + ' on ' + esc(r.plan.name) + ', version ' + r.plan.version + '</span></p>'
    + '<div class="verdict ' + v.level + '"><span class="vt">' + esc(v.title) + '</span><p>On a typical day the average wait is ' + fmtMin(tw.avgWait) + ', and 1 in 10 patients wait more than ' + fmtMin(tw.p90Wait) + '.' + (n > 1 ? ' Across ' + n + ' days, average waits ranged from ' + fmtMin(a.avgWait.lo) + ' to ' + fmtMin(a.avgWait.hi) + '.' : '') + esc(ns) + '</p></div>'
    + '<section class="rsec"><h3>Busiest: ' + esc(util[0][0]) + '</h3><p class="small">' + (util[0][0] === 'exam rooms' ? 'In use ' : 'Busy ') + fmtPct(util[0][1]) + (util[0][0] === 'exam rooms' ? ' of the day.' : ' of their time on shift.') + ' ' + esc(peak) + '</p><ul class="ubars">' + util.map(([k, x]) => '<li><span>' + esc(k.replace(/^./, c => c.toUpperCase())) + '</span><span class="ub"><i style="width:' + fmtPct(x) + '"></i></span><b>' + fmtPct(x) + '</b></li>').join('') + '</ul></section>'
    + '<section class="rsec"><h3>Across ' + n + (n === 1 ? ' day' : ' days') + '</h3><div class="rgrid">'
    + [['Patients seen', rng(a.seen, fmtN)], ['Average wait', rng(a.avgWait, fmtMin)], ['1 in 10 waited over', rng(a.p90Wait, fmtMin)], ['Time in the clinic', rng(a.avgTime, fmtMin)], ['Walking per nurse', rng(a.nurseKm, fmtKm)], ['Last patient leaves', fmtClock(a.lastExit.mean)]].concat(a.noShows.mean > 0 ? [['No-shows', rng(a.noShows, fmtN)]] : []).concat(a.turnedAway.mean > 0 ? [['Walk-ins turned away', rng(a.turnedAway, fmtN)]] : []).concat(a.notSeen.mean > 0 ? [['Not seen before staff left', rng(a.notSeen, fmtN)]] : []).map(([k, x]) => '<div><span>' + k + '</span><b>' + x + '</b></div>').join('') + '</div></section>'
    + (rules ? '<section class="rsec"><h3>Rules</h3><ul class="rules">' + rules + '</ul></section>' : '')
    + sweep
    + '<div class="row"><button type="button" class="btn" id="cmpLayouts">Compare layouts with this scenario</button><button type="button" class="btn" id="askWhy">Ask the assistant why</button><button type="button" class="btn" id="editScn">Change the scenario</button></div>';
  $('#cmpLayouts').addEventListener('click', runCompare);
  $('#askWhy').addEventListener('click', () => { toggleChat(true); sendChat('Why do patients wait in this scenario, and what would help most?'); });
  $('#editScn').addEventListener('click', () => setSimTab('scenario'));
  $('#playNote').textContent = 'The 3D plays the typical day from this run.';
}

/* ---------- History: every run is saved in this browser ---------- */
function loadHistory() { try { const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(v) ? v.filter(h => h && h.scn && h.agg) : []; } catch (e) { return []; } }
function storeHistory() { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch (e) { /* storage unavailable or full */ } }
function saveHistory(run) {
  const keep = {};
  for (const k of ['seen', 'avgWait', 'p90Wait', 'avgTime', 'nurseKm', 'turnedAway']) keep[k] = run.sum.agg[k];
  const entry = { id: run.id, at: run.at, kind: run.kind, name: run.name, plan: run.plan, scn: run.scn, n: run.sum.n, verdict: { level: run.v.level, title: run.v.title, bottleneck: run.v.bottleneck }, agg: keep, sweep: run.sweep ? { field: run.sweep.field, values: run.sweep.rows.map(x => x.value) } : null };
  state.history = [entry].concat(state.history.filter(h => h.id !== entry.id)).slice(0, 30);
  storeHistory(); renderHistoryCount();
}
function renderHistoryCount() { const c = $('#histCount'); if (c) c.textContent = state.history.length ? String(state.history.length) : ''; }
function scnFacts(scn) {
  try {
    const sc = compileScenario(scn), on = scn.blocks.filter(b => b.enabled !== false), words = { break: ['break', 'breaks'], out: ['staff out', 'staff out'], closed: ['room closed', 'rooms closed'], group: ['group arrival', 'group arrivals'], rule: ['rule', 'rules'] };
    const extra = Object.keys(words).map(t => [t, on.filter(b => b.type === t).length]).filter(x => x[1]);
    return sc.patients + ' patients, ' + sc.providers + ' ' + roleName('provider', sc.providers) + ', ' + sc.nurses + ' ' + roleName('nurse', sc.nurses) + ', ' + sc.receptionists + ' ' + roleName('reception', sc.receptionists) + (extra.length ? ', ' + extra.map(([t, k]) => k + ' ' + words[t][k === 1 ? 0 : 1]).join(', ') : '');
  } catch (e) { return ''; }
}
function renderHistory() {
  renderHistoryCount();
  const box = $('#historyList');
  if (!box) return;
  if (!state.history.length) { box.innerHTML = '<li class="empty"><h3>Nothing here yet</h3><p>Every run you make is saved here, so you can reload a scenario later or compare runs.</p></li>'; $('#histCompare').disabled = true; return; }
  box.innerHTML = state.history.map(h => {
    const when = new Date(h.at), sel = state.histSel.has(h.id);
    return '<li class="' + (sel ? 'sel' : '') + '"><label class="hcheck"><input type="checkbox" data-sel="' + h.id + '"' + (sel ? ' checked' : '') + ' aria-label="Select for comparison"></label>'
      + '<div class="hmain"><b>' + esc(h.name) + '</b><small>' + when.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' on ' + esc(h.plan.name) + ', version ' + h.plan.version + ', ' + h.n + (h.n === 1 ? ' day' : ' days') + (h.kind === 'range' ? ' per value' : '') + '</small><small>' + esc(scnFacts(h.scn)) + '</small></div>'
      + '<span class="vpill ' + h.verdict.level + '">' + esc(h.verdict.title) + '</span>'
      + '<span class="hnum"><b>' + fmtMin(h.agg.avgWait.mean) + '</b>average wait</span><span class="hnum"><b>' + fmtMin(h.agg.p90Wait.mean) + '</b>1 in 10 over</span>'
      + '<span class="hacts"><button type="button" class="btn small" data-load="' + h.id + '">Load scenario</button><button type="button" class="btn small" data-show="' + h.id + '">Run again</button><button type="button" class="iconbtn sm" data-del="' + h.id + '" aria-label="Delete this run">' + SVG_TRASH + '</button></span></li>';
  }).join('');
  $('#histCompare').disabled = state.histSel.size < 2;
  $('#histCompare').textContent = 'Compare selected' + (state.histSel.size ? ' (' + state.histSel.size + ')' : '');
}
function bindHistory() {
  const box = $('#historyList');
  box.addEventListener('change', e => {
    const id = e.target.dataset.sel;
    if (!id) return;
    if (e.target.checked) { if (state.histSel.size >= 4) { e.target.checked = false; toast('Compare up to 4 runs at a time.'); return; } state.histSel.add(id); } else state.histSel.delete(id);
    renderHistory();
  });
  box.addEventListener('click', e => {
    const t = e.target.closest('[data-load],[data-show],[data-del]');
    if (!t) return;
    const id = t.dataset.load || t.dataset.show || t.dataset.del, h = state.history.find(x => x.id === id);
    if (!h) return;
    if (t.dataset.del) { state.history = state.history.filter(x => x.id !== id); state.histSel.delete(id); storeHistory(); renderHistory(); return; }
    state.scn = fillRoomDefaults(JSON.parse(JSON.stringify(h.scn)));
    state.scn.edited = false;
    renderBuilder();
    if (t.dataset.load) { setSimTab('scenario'); toast('Loaded “' + h.name + '” into the scenario.'); }
    else runScenario({ save: false });
  });
  $('#histCompare').addEventListener('click', compareHistory);
  $('#histClear').addEventListener('click', () => {
    const prev = state.history.slice();
    state.history = []; state.histSel.clear(); storeHistory(); renderHistory(); $('#histCompareBox').innerHTML = '';
    toastAction('Cleared the history.', 'Undo', () => { state.history = prev; storeHistory(); renderHistory(); });
  });
}
function compareHistory() {
  const list = state.history.filter(h => state.histSel.has(h.id)).reverse();
  if (list.length < 2) return;
  const sums = list.map(h => new Set(h.scn.blocks.filter(b => b.enabled !== false).map(b => (BLOCK_TYPES[b.type] ? BLOCK_TYPES[b.type].label + ': ' : '') + safeSummary(b))));
  const base = sums[0];
  const diff = (s, i) => {
    if (i === 0) return '<span class="muted">The starting point</span>';
    const added = [...s].filter(x => !base.has(x)), removed = [...base].filter(x => !s.has(x));
    if (!added.length && !removed.length) return '<span class="muted">Same scenario</span>';
    const items = added.map(x => '<li class="add">' + esc(x) + '</li>').concat(removed.map(x => '<li class="rem">' + esc(x) + '</li>')), more = items.length - 8;
    return '<ul class="diff">' + items.slice(0, 8).join('') + (more > 0 ? '<li class="more">and ' + more + ' more ' + (more === 1 ? 'change' : 'changes') + '</li>' : '') + '</ul>';
  };
  const row = (label, f) => '<tr><th scope="row">' + label + '</th>' + list.map((h, i) => '<td>' + f(h, i) + '</td>').join('') + '</tr>';
  const best = (k, i) => { const vals = list.map(h => h.agg[k].mean), m = Math.min(...vals); return Math.abs(list[i].agg[k].mean - m) < 1e-9 && vals.some(x => Math.abs(x - m) > 1e-9); };
  $('#histCompareBox').innerHTML = '<h3>Runs compared</h3><div class="tablewrap"><table class="cmp"><thead><tr><th scope="col"></th>' + list.map(h => '<th scope="col">' + esc(h.name) + '<small>' + new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</small></th>').join('') + '</tr></thead><tbody>'
    + row('Verdict', h => '<span class="vpill ' + h.verdict.level + '">' + esc(h.verdict.title) + '</span>')
    + row('Average wait', (h, i) => '<span class="' + (best('avgWait', i) ? 'best' : '') + '">' + fmtMin(h.agg.avgWait.mean) + '</span>')
    + row('1 in 10 waited over', (h, i) => '<span class="' + (best('p90Wait', i) ? 'best' : '') + '">' + fmtMin(h.agg.p90Wait.mean) + '</span>')
    + row('Patients seen', h => fmtN(h.agg.seen.mean))
    + row('Walking per nurse', (h, i) => '<span class="' + (best('nurseKm', i) ? 'best' : '') + '">' + fmtKm(h.agg.nurseKm.mean) + '</span>')
    + row('Busiest', h => esc(h.verdict.bottleneck.name) + ' ' + fmtPct(h.verdict.bottleneck.util))
    + row('What’s different', (h, i) => diff(sums[i], i))
    + '</tbody></table></div>';
  $('#histCompareBox').scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}

/* ---------- Save and load scenarios as files ---------- */
function bindScenarioFiles() {
  $('#scnDownload').addEventListener('click', () => {
    const data = JSON.stringify({ schema: 'fi.scenario.v1', name: state.scn.name, preset: state.scn.preset, blocks: state.scn.blocks }, null, 2);
    if (!caps.downloads) { toast('Downloads aren’t available in this view.'); return; }
    caps.downloads.save({ filename: slug(state.scn.name) + '.scenario.json', data }).then(() => toast('Saved the scenario.')).catch(e => toast(e && e.code === 'declined' ? 'Download cancelled.' : 'Couldn’t save the scenario.'));
  });
  $('#scnImport').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then(t => {
      const j = JSON.parse(t);
      if (!j || !Array.isArray(j.blocks)) throw new Error('no blocks found');
      const blocks = j.blocks.filter(b => b && typeof b.type === 'string' && b.fields && typeof b.fields === 'object').map(b => ({ id: makeBlock(BLOCK_TYPES[b.type] ? b.type : 'hours').id, type: b.type, enabled: b.enabled !== false, fields: b.fields }));
      state.scn = fillRoomDefaults({ schema: 'fi.scenario.v1', name: String(j.name || f.name).slice(0, 60), preset: 'custom', blocks });
      renderBuilder(); setSimTab('scenario'); toast('Imported ' + f.name + '. Check the list on the right for anything to fix.');
    }).catch(err => toast('Couldn’t read ' + f.name + ': ' + err.message + '.'));
    e.target.value = '';
  });
}
function initSimulate() {
  state.history = loadHistory();
  state.scn = fillRoomDefaults(makeScenario('normal'));
  state.scenario = compileScenario(state.scn);
  renderPalette(); bindBuilder(); bindDayTimeline(); bindHistory(); bindScenarioFiles();
  document.querySelectorAll('[data-simtab]').forEach(b => b.addEventListener('click', () => setSimTab(b.dataset.simtab)));
  $('#runBtn').addEventListener('click', () => runScenario());
  $('#sweepBtn').addEventListener('click', runSweep);
  $('#swField').addEventListener('change', e => { $('#swValues').value = e.target.value === 'patients' ? '40, 60, 80, 100' : e.target.value === 'receptionists' ? '1, 2' : '1, 2, 3'; });
  renderBuilder(); renderResults(); renderHistoryCount();
  setSimTab('scenario');
}
