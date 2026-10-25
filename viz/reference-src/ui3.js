/* ---------- App shell: five steps (Import, Review, Edit, Simulate, Export) and the side assistant ---------- */
Object.assign(state, {
  step: 'import', spec: null, versions: [], vIndex: -1, source: null, swapSel: [], renameSel: null, editTool: 'swap', editing: false, layout: null,
  selectedRoom: null, planRoutes: { journey: true, staff: false, egress: false }, chat: { turns: [], busy: false, ctl: null }, checks: [], exportMetrics: null
});
const STEPS = ['import', 'review', 'simulate', 'export'];
const ROLE_DOTS = { patient: '#2453d6', nurse: '#11806a', provider: '#8b3fb0', reception: '#5d6b78' };
const caps = { sample: null, downloads: null, toolsOK: false };
const MARK = { first: '#2453d6', second: '#e0592a', rename: '#11806a' };
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  pass: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor" opacity=".15"/><path d="M6 10.5l2.6 2.6L14.5 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fail: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor" opacity=".15"/><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};
const labelOf = id => { const r = state.P && state.P.m.rooms.find(q => q.id === id); return r ? r.label : id; };
const norm = s => String(s || '').toLowerCase().replace(/rooms?/g, '').replace(/[^a-z0-9]/g, '');
function findRoom(text) {
  if (!state.P) return null;
  const n = norm(text), rooms = state.P.m.rooms;
  return rooms.find(r => norm(r.label) === n) || rooms.find(r => norm(r.id) === n) || rooms.find(r => n && norm(r.label).startsWith(n)) || rooms.find(r => n && n.includes(norm(r.label)) && norm(r.label).length > 3) || null;
}

/* ---------- Versions: every change is saved so it can be compared and undone ---------- */
function clonePlaced(it) { return { kind: it.kind, x: it.x, y: it.y, dir: { x: it.dir.x, y: it.dir.y }, w: it.w, d: it.d, block: true, placed: true, room: it.room }; }
function planJsonFromVersion(v) {
  const json = v.spec ? makePlanFromSpec(v.spec) : JSON.parse(JSON.stringify(v.baseJson));
  json.name = v.name; json.blurb = v.blurb || json.blurb || '';
  for (const r of json.rooms) if (v.renames[r.id]) r.label = v.renames[r.id];
  return json;
}
function applyVersion(v, keepCamera) {
  state.json = planJsonFromVersion(v); state.spec = v.spec; state.placed = v.placed.map(clonePlaced);
  state.P = preparePlan(state.json, state.placed);
  state.checks = runChecks(state.P); state.compare = null; state.exportMetrics = null;
  stopPlacing(); selectItem(null);
  if (R3) { if (state.view === 'tour') { tour.playing = false; tour.phase = 'idle'; } if (state.view !== 'orbit') setView('orbit'); buildScene(); }
  resetSim(state.sim ? clamp(state.sim.now, 90, 420) : 90);
  renderPlan2D(); renderDockThumb(); updatePlanHeader(); updateRouteText(); renderVersions(); renderChecks(); renderReviewInfo(); renderEditTools();
  if (state.step === 'export') renderExport();
  if (state.scn) { fillRoomDefaults(state.scn); renderBuilder(); }
  if (!keepCamera) fitCamera(true);
}
function commitVersion(change, mutate) {
  const cur = state.versions[state.vIndex];
  const nv = { n: state.versions.length + 1, change, spec: cur.spec ? JSON.parse(JSON.stringify(cur.spec)) : null, baseJson: cur.baseJson, renames: Object.assign({}, cur.renames), placed: state.placed.map(clonePlaced), name: cur.name, blurb: cur.blurb, source: cur.source, at: new Date() };
  mutate(nv);
  state.versions = state.versions.slice(0, state.vIndex + 1).concat([nv]);
  state.vIndex = state.versions.length - 1;
  applyVersion(nv, true);
  return nv;
}
function afterFurnitureChange(it, how) {
  const cur = state.versions[state.vIndex];
  if (how === 'added' || how === 'removed') {
    const nv = Object.assign({}, cur, { n: state.versions.length + 1, change: (how === 'added' ? 'Added a ' : 'Removed a ') + (PLACE_NAMES[it.kind] || it.kind).toLowerCase(), placed: state.placed.map(clonePlaced), renames: Object.assign({}, cur.renames), at: new Date() });
    state.versions = state.versions.slice(0, state.vIndex + 1).concat([nv]);
    state.vIndex = state.versions.length - 1;
  } else cur.placed = state.placed.map(clonePlaced);
  state.checks = runChecks(state.P); state.exportMetrics = null;
  renderVersions(); renderPlan2D(); renderChecks(); updatePlanHeader();
}
function importPlan(src) {
  let v;
  if (src.kind === 'file') v = { n: 1, change: 'Uploaded ' + (src.file || 'plan.json'), spec: null, baseJson: src.json, renames: {}, placed: [], name: src.json.name || 'Your plan', blurb: src.json.blurb || '', source: 'file', at: new Date() };
  else {
    const spec = JSON.parse(JSON.stringify(SAMPLE_SPECS[src.key])), pipe = src.kind === 'pipeline';
    v = { n: 1, change: pipe ? 'Received from Module 1' : 'Opened ' + spec.name, spec, baseJson: null, renames: {}, placed: [], name: pipe ? 'Primary care clinic' : spec.name, blurb: spec.blurb, source: src.kind, key: src.key, at: new Date() };
  }
  preparePlan(planJsonFromVersion(v), []);
  state.versions = [v]; state.vIndex = 0; state.source = v.source;
  state.swapSel = []; state.renameSel = null; state.selectedRoom = null;
  applyVersion(v);
  renderImportSummary(v);
  document.querySelectorAll('[data-step]').forEach(b => { if (b.dataset.step !== 'import') b.disabled = false; });
  $('#importNext').disabled = false;
}

/* ---------- Steps and the sliding tab highlight ---------- */
function moveGlider() {
  const b = document.querySelector('[data-step][aria-selected="true"]'), g = $('#glider');
  if (!b || !g) return;
  g.style.width = b.offsetWidth + 'px';
  g.style.transform = 'translateX(' + b.offsetLeft + 'px)';
}
function setStep(name) {
  if (!STEPS.includes(name) || (!state.P && name !== 'import')) return;
  state.step = name;
  const app = $('#app');
  STEPS.forEach(s => app.classList.toggle('step-' + s, s === name));
  const idx = STEPS.indexOf(name);
  document.querySelectorAll('[data-step]').forEach(b => {
    const i = STEPS.indexOf(b.dataset.step), on = i === idx;
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    b.classList.toggle('done', !!state.P && i < idx);
  });
  moveGlider();
  if (name !== 'review' && state.view === 'tour') endTour();
  if (name !== 'simulate' && state.view === 'follow') setView('orbit');
  if (name !== 'review') exitEdit(true);
  applyDock(); renderReviewInfo();
  if ((name === 'review' || name === 'simulate') && state.sim && !state.sim.done && !state.playing && !reduceMotion) { state.playing = true; updateTransport(); }
  if (name === 'export') renderExport();
  if (name === 'simulate') { setSimTab(state.simTab); updateLive(true); }
  requestAnimationFrame(() => { resize(); refreshPlanOverlay(); });
  renderEditTools(); renderSuggestions();
  try { history.replaceState(null, '', '#' + name); } catch (e) { /* not allowed in some frames */ }
}
function is3DVisible() { return !!R3 && (state.step === 'review' || (state.step === 'simulate' && state.simTab === 'results')); }
function is2DVisible() { return (state.step === 'review' || (state.step === 'simulate' && state.simTab === 'results')) && !!state.dock && state.dock.open; }

/* ---------- Optional editing, opened from Review ---------- */
function enterEdit() {
  if (!state.P) return;
  if (state.step !== 'review') setStep('review');
  if (state.view === 'tour') endTour();
  if (state.view === 'walk' || state.view === 'follow') setView('orbit');
  state.editing = true;
  highlightRoom(null); state.selectedRoom = null;
  $('#app').classList.add('editing');
  $('#editToggle').textContent = 'Done editing'; $('#editToggle').setAttribute('aria-pressed', 'true');
  $('#rbTitle').textContent = 'Editing the plan';
  $('#rbHint').textContent = 'Click rooms on the floor plan or in the 3D view. Every change is saved as a new version.';
  if (state.editTool !== 'furniture') state.dock.open = true;
  applyDock(); renderEditTools(); renderPlanHint(); refreshPlanOverlay(); renderSuggestions(); renderReviewInfo();
}
function exitEdit(silent) {
  if (!state.editing) return;
  state.editing = false;
  stopPlacing(); selectItem(null); state.swapSel = []; state.renameSel = null;
  $('#app').classList.remove('editing');
  syncEditMarks();
  $('#editToggle').textContent = 'Edit plan'; $('#editToggle').setAttribute('aria-pressed', 'false');
  $('#rbTitle').textContent = 'Review the plan';
  $('#rbHint').textContent = 'Open the floor plan from the corner of the 3D view. Drag it to any corner, and drag its edge to resize it.';
  applyDock(); refreshPlanOverlay(); renderSuggestions(); renderPlanHint(); renderReviewInfo();
  if (!silent && state.versions.length) toast('Editing closed. The plan is now at version ' + state.versions[state.vIndex].n + '.');
}
function renderPlanHint() {
  const el = $('#planHint');
  if (!el) return;
  el.textContent = !state.editing ? 'Click a room to fly there' : state.editTool === 'swap' ? 'Click two rooms to swap them' : state.editTool === 'rename' ? 'Click a room to rename it' : 'Place furniture in the 3D view';
}

/* ---------- Floor plan: a collapsible glass panel inside the 3D view ---------- */
const DOCK_KEY = 'fi.planDock.v1';
function loadDock() {
  try {
    const v = JSON.parse(localStorage.getItem(DOCK_KEY) || 'null');
    if (v && ['tl', 'tr', 'bl', 'br'].includes(v.corner)) return { open: !!v.open, corner: v.corner, w: +v.w || 440, h: +v.h || 300 };
  } catch (e) { /* storage unavailable */ }
  return null;
}
function saveDock() { try { localStorage.setItem(DOCK_KEY, JSON.stringify(state.dock)); } catch (e) { /* storage unavailable */ } }
function applyDock() {
  const d = state.dock, el = $('#planDock'), body = $('#view3dBody');
  if (!el || !body || !d) return;
  const bw = body.clientWidth || 900, bh = body.clientHeight || 560;
  const w = clamp(d.w, 280, Math.max(280, bw - 24)), h = clamp(d.h, 200, Math.max(200, bh - (d.corner[0] === 't' ? 82 : 24)));
  el.style.setProperty('--pd-w', Math.round(w) + 'px'); el.style.setProperty('--pd-h', Math.round(h) + 'px');
  el.dataset.open = String(!!d.open); el.dataset.corner = d.corner;
  $('#pdPill').setAttribute('aria-expanded', String(!!d.open));
  ['tl', 'tr', 'bl', 'br'].forEach(c => body.classList.toggle('dock-' + c, d.corner === c));
  saveDock();
}
function setDockOpen(open) {
  state.dock.open = !!open;
  applyDock();
  if (open) refreshPlanOverlay();
}
function renderDockThumb() { const t = $('#pdThumb'); if (t && state.P) t.innerHTML = planSVG(state.P, { compact: true, labels: false, furniture: false, doors: false, dims: false, entrance: false, windows: false }); }
function bindDock() {
  const el = $('#planDock'), head = $('#pdHead'), pill = $('#pdPill'), body = $('#view3dBody');
  let drag = null;
  pill.addEventListener('click', e => { if (e.detail === 0) setDockOpen(true); });
  $('#pdCollapse').addEventListener('click', () => setDockOpen(false));
  const start = (e, fromPill) => {
    if (e.button !== 0) return;
    if (!fromPill && e.target.closest('button')) return;
    const r = el.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false, fromPill };
    el.setPointerCapture(e.pointerId);
  };
  head.addEventListener('pointerdown', e => start(e, false));
  pill.addEventListener('pointerdown', e => start(e, true));
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    if (!drag.moved) { drag.moved = true; el.classList.add('dragging'); }
    const br = body.getBoundingClientRect();
    const x = clamp(e.clientX - br.left - drag.dx, 0, Math.max(0, br.width - el.offsetWidth)), y = clamp(e.clientY - br.top - drag.dy, 0, Math.max(0, br.height - el.offsetHeight));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) { el.classList.remove('dragging'); if (d.fromPill) setDockOpen(true); return; }
    const before = el.getBoundingClientRect(), br = body.getBoundingClientRect();
    const cx = before.left + before.width / 2 - br.left, cy = before.top + before.height / 2 - br.top;
    state.dock.corner = (cy < br.height / 2 ? 't' : 'b') + (cx < br.width / 2 ? 'l' : 'r');
    el.style.left = el.style.top = el.style.right = el.style.bottom = '';
    applyDock();
    const after = el.getBoundingClientRect();
    el.style.transform = 'translate(' + Math.round(before.left - after.left) + 'px, ' + Math.round(before.top - after.top) + 'px)';
    void el.offsetWidth;
    el.classList.remove('dragging');
    if (!reduceMotion) el.style.transition = 'transform 420ms cubic-bezier(.3, 1.3, .5, 1)';
    el.style.transform = '';
    setTimeout(() => { el.style.transition = ''; }, 440);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  const rz = $('#pdResize');
  let rs = null;
  rz.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); rz.setPointerCapture(e.pointerId); rs = { x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight }; el.classList.add('dragging'); });
  rz.addEventListener('pointermove', e => {
    if (!rs) return;
    const c = state.dock.corner, sx = c[1] === 'r' ? -1 : 1, sy = c[0] === 'b' ? -1 : 1;
    state.dock.w = rs.w + sx * (e.clientX - rs.x); state.dock.h = rs.h + sy * (e.clientY - rs.y);
    applyDock();
  });
  const rend = () => { if (!rs) return; rs = null; el.classList.remove('dragging'); const r = el.getBoundingClientRect(); state.dock.w = r.width; state.dock.h = r.height; saveDock(); };
  rz.addEventListener('pointerup', rend); rz.addEventListener('pointercancel', rend);
  $('#roomCardClose').addEventListener('click', () => { state.selectedRoom = null; highlightRoom(null); renderReviewInfo(); refreshPlanOverlay(); });
}
/* A click on a room in the 3D view: details while reviewing, the edit tools while editing. */
function onRoomTap(r) {
  if (!state.P || (state.step !== 'review' && state.step !== 'simulate')) return;
  if (state.editing) { if (r && r.type !== 'corridor' && (state.editTool === 'swap' || state.editTool === 'rename')) { onPlanRoomClick(r.id); setHoverMark(null); } return; }
  state.selectedRoom = r ? r.id : null;
  highlightRoom(r || null);
  renderReviewInfo(); refreshPlanOverlay();
}
/* ---------- Header, import summary ---------- */
function updatePlanHeader() {
  const v = state.versions[state.vIndex];
  $('#planName').textContent = v ? v.name : 'No plan yet';
  $('#planVersion').textContent = v ? 'Version ' + v.n : 'Start by importing a plan';
}
function renderImportSummary(v) {
  const P = state.P, m = P.m, exams = m.rooms.filter(r => r.type === 'exam_room').length;
  const doorsReal = m.doors.filter(d => !d.isEntrance).length, wins = planWindows(m).length;
  const rows = [
    ['Rooms', m.rooms.length + ' rooms, including ' + exams + ' exam rooms'],
    ['Doors', m.inferredDoors ? 'None in the file, so a door to the corridor was added for each room' : doorsReal + ' doors and openings'],
    ['Entrance', 'On the ' + facadeName(m) + ' side, into the ' + m.rooms[P.info.entK].label.toLowerCase()],
    ['Walls', 'Worked out from the room edges'],
    ['Windows', wins + ' on outside walls'],
    ['Furniture', P.furn.items.length + ' items placed from the room types'],
    ['Waiting room', P.info.seats.length + ' seats']
  ];
  $('#importSummary').hidden = false;
  $('#importName').textContent = v.name;
  $('#importSource').textContent = v.source === 'pipeline' ? 'From the Module 1 pipeline' : v.source === 'file' ? 'Uploaded file' : 'Sample layout';
  $('#importArea').textContent = Math.round(m.rooms.reduce((s, r) => s + r.w * r.h, 0)) + ' m² on a ' + m.W.toFixed(1) + ' × ' + m.D.toFixed(1) + ' m footprint';
  $('#importRead').innerHTML = rows.map(([k, t]) => '<li><span class="ok">' + ICON.pass + '</span><b>' + k + '</b><span>' + esc(t) + '</span></li>').join('');
  $('#importThumb').innerHTML = planSVG(P, { compact: true, labels: false, furniture: true, doors: false, dims: false, entrance: true });
}
function facadeName(m) {
  const d = m.doors.find(q => q.isEntrance);
  if (!d) return 'front';
  const n = inwardDir(d, m);
  return n.y > 0 ? 'south' : n.y < 0 ? 'north' : n.x > 0 ? 'west' : 'east';
}

/* ---------- 2D plan (Review and Edit) ---------- */
function renderPlan2D() {
  if (!state.P) return;
  const host = $('#plan2d');
  host.innerHTML = planSVG(state.P, { live: true });
  host.querySelectorAll('.room').forEach(el => el.addEventListener('click', () => onPlanRoomClick(el.dataset.id)));
  refreshPlanOverlay();
}
function refreshPlanOverlay() {
  const svg = $('#plan2d svg');
  if (!svg || !state.P) return;
  const outlines = [];
  if (state.editing) {
    if (state.editTool === 'swap') state.swapSel.forEach((id, i) => outlines.push([id, i ? MARK.second : MARK.first, false, String(i + 1)]));
    if (state.editTool === 'rename' && state.renameSel) outlines.push([state.renameSel, MARK.rename, false, '✎']);
  } else {
    if (state.view === 'tour' && tour.stops[tour.i] && tour.stops[tour.i].room) outlines.push([tour.stops[tour.i].room.id, '#2453d6', false]);
    else if (state.selectedRoom) outlines.push([state.selectedRoom, '#2453d6', false]);
  }
  planOverlay(svg, state.P, { outlines, journey: state.planRoutes.journey, staff: state.planRoutes.staff, egress: state.planRoutes.egress });
}
function onPlanRoomClick(id) {
  const r = state.P.m.rooms.find(q => q.id === id);
  if (!r) return;
  if (state.editing) {
    if (state.editTool === 'swap') {
      if (state.swapSel.includes(id)) state.swapSel = state.swapSel.filter(x => x !== id);
      else state.swapSel = state.swapSel.length >= 2 ? [id] : state.swapSel.concat([id]);
    } else if (state.editTool === 'rename') { state.renameSel = id; $('#renameInput').value = r.label; setTimeout(() => $('#renameInput').focus(), 0); }
    renderEditTools(); refreshPlanOverlay();
    return;
  }
  state.selectedRoom = id;
  if (state.view === 'tour') endTour();
  focusRoom(r);
  renderReviewInfo(); refreshPlanOverlay();
}
function roomFacts(r) {
  const info = state.P.info, f = [(r.w * r.h).toFixed(1) + ' m², ' + r.w.toFixed(1) + ' × ' + r.h.toFixed(1) + ' m'];
  if (r.type === 'exam_room') { const e = info.allExams.find(x => x.id === r.id); if (e && isFinite(e.distNurse)) f.push(Math.round(e.distNurse) + ' m from the nurse station'); if (e && isFinite(e.distWait)) f.push(Math.round(e.distWait) + ' m from the waiting room'); }
  if (r.type === 'waiting') f.push(info.seats.length + ' seats');
  if (r.type === 'nurse_station') f.push(Math.round(info.avgNurse) + ' m to the average exam room');
  return f;
}
function roomNow(r) {
  const sim = state.sim;
  if (!sim) return '';
  const c = { patient: 0, nurse: 0, provider: 0, reception: 0 };
  for (const a of sim.agents) {
    if (!a.active) continue;
    const p = a.rest && !a.move ? a.rest : posAt(a, sim.now);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) c[a.role]++;
  }
  if (r.type === 'exam_room') return c.patient && c.nurse ? 'A nurse is taking a patient’s vitals.' : c.patient && c.provider ? 'The provider is seeing a patient.' : c.patient ? 'A patient is waiting for the provider.' : 'Empty and ready for the next patient.';
  if (r.type === 'waiting') { const n = sim.waiting.length; return n ? n + (n === 1 ? ' patient is' : ' patients are') + ' waiting to be called.' : 'No one is waiting to be called right now.'; }
  if (r.type === 'reception') return sim.deskQueue.length ? sim.deskQueue.length + ' in line at the counter.' : 'The receptionist is at the counter.';
  if (r.type === 'nurse_station') return c.nurse ? c.nurse + (c.nurse === 1 ? ' nurse is' : ' nurses are') + ' here between patients.' : 'All nurses are out with patients.';
  if (r.type === 'provider_office') return c.provider ? c.provider + (c.provider === 1 ? ' provider is' : ' providers are') + ' working here between visits.' : 'All providers are with patients.';
  const t = c.patient + c.nurse + c.provider + c.reception;
  return t ? t + (t === 1 ? ' person is' : ' people are') + ' here now.' : 'Empty right now.';
}
function renderReviewInfo() {
  const card = $('#roomCard'), box = $('#roomInfo');
  if (!card || !box || !state.P) return;
  const r = state.selectedRoom && state.P.m.rooms.find(q => q.id === state.selectedRoom);
  const show = !!r && !state.editing && state.view !== 'tour' && (state.step === 'review' || state.step === 'simulate');
  card.hidden = !show;
  if (!show) return;
  box.innerHTML = '<h3>' + esc(r.label) + '</h3><p>' + esc(PURPOSE[r.type] || '') + '</p><ul class="facts">' + roomFacts(r).map(f => '<li>' + esc(f) + '</li>').join('') + '</ul><p class="now" id="roomNow">' + esc(roomNow(r)) + '</p>';
}
function updateRouteText() {
  if (!state.P) return;
  const info = state.P.info, r = info.routes, set = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  set('#tJourney', r.journey.examLabel ? Math.round(r.journey.len) + ' m, to ' + r.journey.examLabel + ' and back' : 'No exam room can be reached');
  set('#tStaff', r.staff.length ? Math.round(info.avgNurse) + ' m on average' : 'No exam room can be reached');
  set('#tEgress', r.egress ? Math.round(r.egress.len) + ' m, from ' + r.egress.fromLabel : '');
}

/* ---------- Guided tour captions ---------- */
function onTourStop(i, n, st, ended) {
  $('#tourCount').textContent = 'Stop ' + (i + 1) + ' of ' + n;
  $('#tourPlay').innerHTML = tour.playing ? ICON.pause : ICON.play;
  $('#tourPlay').setAttribute('aria-label', tour.playing ? 'Pause the tour' : 'Resume the tour');
  $('#tourPrev').disabled = i === 0; $('#tourNext').disabled = i === n - 1;
  renderTourCaption(ended);
  refreshPlanOverlay();
}
function renderTourCaption(ended) {
  const st = tour.stops[tour.i];
  if (!st) return;
  const info = state.P.info;
  let title, purpose, now = '', facts = [];
  if (st.kind === 'entrance') { title = 'Entrance'; purpose = 'Patients come in here and head to the reception counter to check in.'; now = state.sim ? state.sim.inClinic + ' patients are inside right now.' : ''; }
  else if (st.kind === 'exit') { title = ended ? 'That’s the whole clinic' : 'Back outside'; purpose = 'Every room connects to the entrance. The farthest room is ' + (info.routes.egress ? Math.round(info.routes.egress.len) + ' m from the exit (' + info.routes.egress.fromLabel + ').' : 'not reachable.'); now = state.sim ? state.sim.seen + ' patients seen so far today.' : ''; }
  else { title = st.room.label; purpose = PURPOSE[st.room.type] || ''; now = roomNow(st.room); facts = roomFacts(st.room); }
  $('#capTitle').textContent = title;
  $('#capPurpose').textContent = purpose;
  $('#capNow').textContent = now;
  $('#capFacts').innerHTML = facts.map(f => '<li>' + esc(f) + '</li>').join('');
}
function onViewChange(v) {
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  const touring = v === 'tour';
  $('#tourBar').hidden = !touring; $('#caption').hidden = !touring;
  if (touring && state.dock && state.dock.open && $('#view3dBody').clientWidth < 760) setDockOpen(false);
  renderReviewInfo();
  refreshPlanOverlay();
}

/* ---------- Edit tools and versions ---------- */
function renderEditTools() {
  if (!state.P) return;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === state.editTool)));
  $('#toolSwap').hidden = state.editTool !== 'swap'; $('#toolRename').hidden = state.editTool !== 'rename'; $('#toolFurniture').hidden = state.editTool !== 'furniture';
  const can = !!state.spec, sel = state.swapSel;
  $('#swapNote').hidden = can;
  const chip = (id, i) => '<span class="selchip" style="--c:' + (i ? MARK.second : MARK.first) + '"><b>' + (i + 1) + '</b>' + esc(labelOf(id)) + '</span>';
  $('#swapStatus').innerHTML = !can ? '' : !sel.length ? 'Click the first room, on the floor plan or in the 3D view.' : sel.length === 1 ? chip(sel[0], 0) + '<span class="selnext">Now click the room to swap it with.</span>' : chip(sel[0], 0) + chip(sel[1], 1);
  let preview = '';
  if (can && sel.length === 2) {
    const r = swapInSpec(state.spec, sel[0], sel[1]);
    if (r.error) preview = '<p class="warn">' + esc(r.error) + '</p>';
    else {
      const v = state.versions[state.vIndex], P2 = preparePlan(planJsonFromVersion(Object.assign({}, v, { spec: r.spec })), []);
      const a = Math.round(state.P.info.avgNurse), b = Math.round(P2.info.avgNurse), ja = Math.round(state.P.info.routes.journey.len), jb = Math.round(P2.info.routes.journey.len);
      preview = '<p class="preview">If you swap them:</p><ul class="facts"><li>Nurse walk to the average exam room: ' + a + ' m to ' + b + ' m</li><li>Longest patient journey: ' + ja + ' m to ' + jb + ' m</li></ul>';
    }
  }
  $('#swapPreview').innerHTML = preview;
  $('#swapApply').disabled = !can || sel.length !== 2 || /class="warn"/.test(preview);
  $('#renameRow').hidden = !state.renameSel;
  $('#renameHint').hidden = !!state.renameSel;
  document.querySelectorAll('[data-place]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === state.placing)));
  syncEditMarks();
}
/* Rooms picked while editing are highlighted in 3D with the same colors and numbers as on the plan. */
function syncEditMarks() {
  if (!R3 || !state.P) return;
  const marks = [];
  if (state.editing) {
    if (state.editTool === 'swap') state.swapSel.forEach((id, i) => marks.push({ id, color: i ? MARK.second : MARK.first, num: String(i + 1), text: labelOf(id) }));
    if (state.editTool === 'rename' && state.renameSel) marks.push({ id: state.renameSel, color: MARK.rename, num: null, text: 'Renaming ' + labelOf(state.renameSel) });
  }
  setRoomMarks(marks);
  if (!state.editing) setHoverMark(null);
}
/* While editing, the room under the pointer lights up in the color it would get if clicked. */
function onRoomHover(r) {
  if (!state.editing || (state.editTool !== 'swap' && state.editTool !== 'rename')) { setHoverMark(null); return null; }
  if (!r) { setHoverMark(null); return null; }
  if (r.type === 'corridor') { setHoverMark(null); return 'Pick a room, not the corridor'; }
  if (state.editTool === 'rename') { setHoverMark(r, MARK.rename); return 'Click to rename this room'; }
  const sel = state.swapSel;
  if (sel.includes(r.id)) { setHoverMark(null); return 'Click again to unselect'; }
  if (sel.length === 1) {
    const err = state.spec ? swapInSpec(state.spec, sel[0], r.id).error : 'Swapping works on the sample layouts';
    setHoverMark(r, err ? '#8a96a3' : MARK.second);
    return err ? 'Can’t swap: ' + err.charAt(0).toLowerCase() + err.slice(1) : 'Click to swap with ' + labelOf(sel[0]);
  }
  setHoverMark(r, MARK.first);
  return sel.length === 2 ? 'Click to start a new pair' : 'Click to pick this room first';
}
function applySwap() {
  const [a, b] = state.swapSel, r = swapInSpec(state.spec, a, b);
  if (r.error) { toast(r.error); return { error: r.error }; }
  const la = labelOf(a), lb = labelOf(b), before = Math.round(state.P.info.avgNurse), hadFurniture = state.placed.length > 0;
  commitVersion('Swapped ' + la + ' and ' + lb, nv => { nv.spec = r.spec; nv.placed = []; });
  state.swapSel = []; renderEditTools(); refreshPlanOverlay();
  const after = Math.round(state.P.info.avgNurse);
  toast('Swapped ' + la + ' and ' + lb + ', saved as version ' + state.versions[state.vIndex].n + '.' + (hadFurniture ? ' Added furniture was cleared because the rooms moved.' : ''));
  return { swapped: [la, lb], nurse_walk_avg_m_before: before, nurse_walk_avg_m_after: after, version: state.versions[state.vIndex].n };
}
function applyRename() {
  const id = state.renameSel, name = $('#renameInput').value.trim();
  if (!id || !name || name === labelOf(id)) return;
  const old = labelOf(id);
  commitVersion('Renamed ' + old + ' to ' + name, nv => { nv.renames[id] = name; });
  state.renameSel = null; renderEditTools(); refreshPlanOverlay();
  toast('Renamed ' + old + ' to ' + name + '.');
}
function renderVersions() {
  const box = $('#versions');
  if (!box) return;
  box.innerHTML = state.versions.slice().reverse().map(v => {
    const i = v.n - 1, cur = i === state.vIndex;
    return '<li class="' + (cur ? 'current' : '') + '"><span class="vn">v' + v.n + '</span><span class="vc">' + esc(v.change) + '<small>' + v.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</small></span>' + (cur ? '<span class="tag">Current</span>' : '<button type="button" class="btn small" data-restore="' + i + '">Restore</button>') + '</li>';
  }).join('');
  box.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', () => { state.vIndex = +b.dataset.restore; applyVersion(state.versions[state.vIndex], true); toast('Restored version ' + (state.vIndex + 1) + '.'); }));
}

/* ---------- Simulate: day, numbers, checks, comparison ---------- */
function resetSim(startAt) {
  if (!state.P) return;
  state.sim = new ClinicSim(state.P.m, state.P.g, state.P.pf, state.P.info, state.scenario, state.seed);
  if (startAt) state.sim.advanceTo(startAt);
  if (R3) { for (const p of R3.people.values()) R3.root.remove(p.root); R3.people.clear(); }
  $('#dayMsg').textContent = '';
  if (state.layers.traffic) paintHeat();
  updateLive(true);
}
function seek(min) {
  if (!state.sim) return;
  if (min >= state.sim.now) state.sim.advanceTo(min); else resetSim(min);
  if (R3) { for (const p of R3.people.values()) R3.root.remove(p.root); R3.people.clear(); }
  if (state.layers.traffic) paintHeat();
  if (state.sim.done) dayDone(); else updateLive(true);
}
function dayDone() {
  state.playing = false;
  const mt = state.sim.metrics();
  $('#dayMsg').textContent = 'Day finished at ' + fmtClock(mt.lastExit) + ' with ' + mt.seen + ' patients seen.';
  if (state.layers.traffic) paintHeat();
  updateTransport(); updateLive(true);
}
const KPIS = [
  ['seen', 'Patients seen', m => String(m.seen)],
  ['avgWait', 'Average wait', m => fmtMin(m.avgWait)],
  ['p90Wait', '1 in 10 waited over', m => fmtMin(m.p90Wait)],
  ['avgTime', 'Time in the clinic', m => fmtMin(m.avgTime)],
  ['nurseKm', 'Walking per nurse', m => m.nurseKm.toFixed(1) + ' km'],
  ['examUse', 'Exam rooms in use', m => Math.round(m.examUse * 100) + '%']
];
function buildKpis() { $('#kpis').innerHTML = KPIS.map(([k, label]) => '<div class="kpi"><span class="kpi-label">' + label + '</span><span class="kpi-value" id="kpi_' + k + '">0</span></div>').join(''); }
let lastLive = 0;
function updateLive(force) {
  const s = state.sim;
  if (!s) return;
  const now = performance.now();
  if (!force && now - lastLive < 300) return;
  lastLive = now;
  $('#clock').textContent = fmtClock(s.now);
  $('#liveIn').textContent = s.inClinic; $('#liveWait').textContent = s.waiting.length; $('#liveSeen').textContent = s.seen;
  if (state.step === 'simulate' || force) drawTimeline();
}
function updateTransport() {
  const b = $('#playBtn');
  if (!b) return;
  b.setAttribute('aria-label', state.playing ? 'Pause the day' : 'Play the day');
  b.innerHTML = state.playing ? ICON.pause : ICON.play;
}
function drawTimeline() {
  const cv = $('#tl'), s = state.sim;
  if (!cv || !s || !cv.clientWidth) return;
  const w = cv.clientWidth, h = cv.clientHeight || 34, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const { t0, t1 } = dayRange(s), g = cv.getContext('2d'), T = themeColors(), X = t => clamp((t - t0) / (t1 - t0), 0, 1) * w;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  renderTicks(t0, t1);
  g.fillStyle = T.rule; g.fillRect(0, h - 6, w, 3);
  const ser = s.series, mx = Math.max(4, ...ser.map(p => p.inClinic));
  const area = (key, color, alpha) => {
    g.beginPath(); g.moveTo(0, h - 8);
    for (let i = 0; i < ser.length; i++) { const p = ser[i], nx = i + 1 < ser.length ? ser[i + 1].t : s.now, yy = h - 8 - (p[key] / mx) * (h - 12); g.lineTo(X(p.t), yy); g.lineTo(X(nx), yy); }
    g.lineTo(X(s.now), h - 8); g.closePath(); g.fillStyle = color; g.globalAlpha = alpha; g.fill(); g.globalAlpha = 1;
  };
  area('inClinic', T.accent, 0.18); area('lobby', T.warn, 0.6);
  g.fillStyle = T.accent; g.fillRect(0, h - 6, X(s.now), 3);
  g.beginPath(); g.arc(X(s.now), h - 4.5, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = T.warn;
  for (const f of s.fires || []) { const x = X(f.t); g.beginPath(); g.moveTo(x - 5, 1); g.lineTo(x + 5, 1); g.lineTo(x, 9); g.closePath(); g.fill(); }
}
function dayRange(s) { const t0 = s.opens != null ? s.opens : 0, t1 = Math.max(s.closes != null ? s.closes : 600, s.lastExit || 0, t0 + 60); return { t0, t1 }; }
let tickKey = '';
function renderTicks(t0, t1) {
  const key = t0 + ':' + Math.round(t1);
  if (key === tickKey) return;
  tickKey = key;
  const box = $('#tlTicks');
  if (!box) return;
  const out = [];
  for (let t = Math.ceil((t0 + 480) / 120) * 120 - 480; t <= t1; t += 120) out.push('<span style="left:' + ((t - t0) / (t1 - t0) * 100).toFixed(2) + '%">' + fmtClock(t).replace(':00', '') + '</span>');
  box.innerHTML = out.join('');
}
function renderChecks() {
  const box = $('#checks');
  if (!box) return;
  const pass = state.checks.filter(c => c.pass).length;
  $('#checksSummary').textContent = pass + ' of ' + state.checks.length + ' example checks pass';
  box.innerHTML = state.checks.map(c => '<li class="' + (c.pass ? 'pass' : 'fail') + '"><span class="ic">' + (c.pass ? ICON.pass : ICON.fail) + '</span><span><b>' + esc(c.label) + '</b><small>' + esc(c.detail) + '</small><em>' + esc(c.source) + '</em></span></li>').join('');
}
function headlessDay(P, sc) { const sim = new ClinicSim(P.m, P.g, P.pf, P.info, sc || state.scenario, state.seed); sim.runAll(); return sim.metrics(); }
function quickMeans(P, sc, n) {
  const days = [];
  for (let d = 0; d < n; d++) days.push(runDay(P, sc, daySeed(sc.seed || 42, d)));
  const sum = summarizeDays(days), out = {};
  for (const k of DAY_KEYS) out[k] = sum.agg[k].mean;
  return out;
}
function compareRows(sc) {
  sc = sc || state.scenario;
  const v = state.versions[state.vIndex], rows = [{ name: v.name + (state.versions.length > 1 ? ', version ' + v.n : ''), m: quickMeans(state.P, sc, 5), info: state.P.info, current: true }];
  for (const k of ['A', 'B', 'C']) {
    if (v.key === k && state.vIndex === 0 && !Object.keys(v.renames).length) continue;
    const P = preparePlan(SAMPLES[k], []);
    rows.push({ name: P.m.name, m: quickMeans(P, sc, 5), info: P.info });
  }
  return rows;
}
function runCompare() {
  const rows = compareRows();
  state.compare = { scenarioKey: state.scenario.label, rows };
  const lines = [
    ['Patients seen', r => r.m.seen, 'max', v => String(v)],
    ['Average wait', r => r.m.avgWait, 'min', fmtMin],
    ['1 in 10 waited over', r => r.m.p90Wait, 'min', fmtMin],
    ['Walking per nurse', r => r.m.nurseKm, 'min', v => v.toFixed(1) + ' km'],
    ['Exam rooms in use', r => r.m.examUse, null, v => Math.round(v * 100) + '%'],
    ['Longest patient journey', r => r.info.routes.journey.len, 'min', v => Math.round(v) + ' m'],
    ['Longest way out', r => r.info.routes.egress ? r.info.routes.egress.len : 0, 'min', v => Math.round(v) + ' m']
  ];
  let html = '<thead><tr><th scope="col">Same day, same arrivals</th>' + rows.map(r => '<th scope="col">' + esc(r.name) + (r.current ? '<small>Yours</small>' : '') + '</th>').join('') + '</tr></thead><tbody>';
  for (const [label, get, better, fmt] of lines) {
    const vals = rows.map(get), mx = Math.max(...vals.map(Math.abs), 1e-9), bestV = better === 'max' ? Math.max(...vals) : better === 'min' ? Math.min(...vals) : null, same = vals.every(x => Math.abs(x - vals[0]) < 1e-9);
    html += '<tr><th scope="row">' + label + '</th>' + vals.map(x => '<td' + (bestV !== null && !same && Math.abs(x - bestV) < 1e-9 ? ' class="best"' : '') + '><span class="num">' + fmt(x) + '</span><span class="bar"><i style="width:' + Math.round(Math.abs(x) / mx * 100) + '%"></i></span></td>').join('') + '</tr>';
  }
  $('#compareTable').innerHTML = html + '</tbody>';
  const byNurse = rows.slice().sort((a, b) => a.m.nurseKm - b.m.nurseKm), lo = byNurse[0], hi = byNurse[byNurse.length - 1], pct = hi.m.nurseKm ? Math.round((1 - lo.m.nurseKm / hi.m.nurseKm) * 100) : 0;
  $('#compareHeadline').textContent = pct > 0 ? lo.name + ' needs ' + pct + '% less nurse walking than ' + hi.name + ' on the same day.' : 'The layouts perform about the same on this day.';
  $('#compareCaption').textContent = '“' + state.scenario.label + '”, averaged over 5 days each: about ' + state.scenario.patients + ' patients, ' + state.scenario.providers + ' ' + roleName('provider', state.scenario.providers) + ', ' + state.scenario.nurses + ' ' + roleName('nurse', state.scenario.nurses) + '.';
  $('#comparePanel').hidden = false;
}

/* ---------- Export ---------- */
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clinic'; }
function renderExport() {
  if (!state.P) return;
  const v = state.versions[state.vIndex], P = state.P;
  if (!state.exportMetrics) state.exportMetrics = quickMeans(P, state.scenario, 5);
  const mt = state.exportMetrics, pass = state.checks.filter(c => c.pass).length;
  $('#exName').textContent = v.name;
  $('#exVersion').textContent = 'Version ' + v.n + ': ' + v.change;
  $('#exStats').innerHTML = [
    ['Rooms', P.m.rooms.length + ' (' + P.info.exams.length + ' exam rooms)'],
    ['Floor area', Math.round(P.m.rooms.reduce((s, r) => s + r.w * r.h, 0)) + ' m²'],
    ['Checks', pass + ' of ' + state.checks.length + ' pass'],
    ['Average wait', fmtMin(mt.avgWait) + ' (' + state.scenario.label + ')'],
    ['Walking per nurse', mt.nurseKm.toFixed(1) + ' km per day'],
    ['Longest patient journey', Math.round(P.info.routes.journey.len) + ' m']
  ].map(([k, t]) => '<div><dt>' + k + '</dt><dd>' + esc(t) + '</dd></div>').join('');
  $('#exPreview').innerHTML = planSVG(P, { furniture: true, labels: true, dims: true });
  const name = slug(v.name) + '-v' + v.n;
  $('#exZipName').textContent = name + '.zip';
  $('#exGlbNote').hidden = !!R3;
  const noDl = !caps.downloads;
  document.querySelectorAll('[data-export]').forEach(b => { b.disabled = noDl || (b.dataset.export === 'zip' && false); });
  $('#exDlNote').hidden = !noDl;
}
async function saveFile(filename, makeData) {
  const status = $('#exStatus');
  if (!caps.downloads) { status.textContent = 'Downloads aren’t available in this view. Open the artifact in Claude to save files.'; return; }
  status.textContent = 'Preparing ' + filename + '…';
  try {
    const data = makeData();
    const r = await caps.downloads.save({ filename, data });
    status.textContent = r && r.status === 'delivered' ? 'Sent ' + filename + '.' : 'Saved ' + filename + '.';
  } catch (e) {
    status.textContent = e && e.code === 'declined' ? 'Download cancelled.' : e && e.code === 'rate_limited' ? 'A download is already waiting for your answer.' : 'Couldn’t save ' + filename + (e && e.code ? ' (' + e.code + ')' : '') + '.';
  }
}
function planJsonExport() {
  const v = state.versions[state.vIndex], out = JSON.parse(JSON.stringify(state.json));
  out.version = v.n; out.exported_at = new Date().toISOString();
  out.furniture_added = state.placed.map(it => ({ kind: it.kind, center_mm: [Math.round(it.x * 1000), Math.round(it.y * 1000)], facing: it.dir }));
  out.checks = state.checks.map(c => ({ rule: c.label, pass: c.pass, detail: c.detail, source: c.source }));
  return JSON.stringify(out, null, 2);
}
function exportBundle() {
  const v = state.versions[state.vIndex], when = new Date().toISOString().slice(0, 10), files = [];
  if (R3) files.push({ name: 'clinic.glb', data: writeGLB(buildExportModel()) });
  files.push({ name: 'plan.json', data: planJsonExport() });
  files.push({ name: 'plan.svg', data: planSVG(state.P, {}) });
  files.push({ name: 'build_in_blender.py', data: blenderScript(v.name) });
  files.push({ name: 'claude-skill/floorplan-to-blender/SKILL.md', data: skillMd() });
  files.push({ name: 'README.md', data: readmeMd(v.name, v.n, when) });
  return makeZip(files);
}

/* ---------- Assistant: answers from the plan and the simulation, and can act on the page ---------- */
const SUGGESTIONS = {
  import: ['What can you help with?', 'Open the plan from Module 1'],
  review: ['Take me on the tour', 'Show me the nurse station', 'Which exam room is farthest from the nurses?'],
  edit: ['Swap the nurse station with Exam 4', 'Make the waiting room bigger', 'What should I change first?'],
  simulate: ['Why are patients waiting?', 'What if we add a nurse?', 'Can this handle 90 patients a day?'],
  export: ['What’s in the export?', 'How do I open it in Blender?']
};
function renderSuggestions() {
  const box = $('#chatSuggest');
  if (!box) return;
  box.innerHTML = (SUGGESTIONS[state.step === 'review' && state.editing ? 'edit' : state.step] || []).map(s => '<button type="button" class="chip">' + esc(s) + '</button>').join('');
  box.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => sendChat(b.textContent)));
}
function chatContext() {
  if (!state.P) return { step: state.step, plan: 'none imported yet' };
  const P = state.P, m = P.m, v = state.versions[state.vIndex], mt = state.sim.metrics();
  return {
    step: state.step, plan: v.name, version: v.n, can_swap_rooms: !!state.spec, footprint_m: [m.W, m.D],
    rooms: m.rooms.filter(r => r.type !== 'corridor').map(r => ({ name: r.label, type: r.type, area_m2: +(r.w * r.h).toFixed(1), side_of_corridor: r.y + r.h / 2 < m.D / 2 ? 'south' : 'north' })),
    waiting_seats: P.info.seats.length, nurse_to_average_exam_room_m: Math.round(P.info.avgNurse), longest_patient_journey_m: Math.round(P.info.routes.journey.len),
    longest_way_out_m: P.info.routes.egress ? Math.round(P.info.routes.egress.len) : null,
    scenario_in_builder: state.scn ? { name: state.scn.name, blocks: state.scn.blocks.filter(b => b.enabled !== false && BLOCK_TYPES[b.type]).map(b => BLOCK_TYPES[b.type].label + ': ' + safeSummary(b)) } : null,
    last_run: state.run ? { name: state.run.name, days: state.run.sum.n, verdict: state.run.v.title, busiest: state.run.v.bottleneck.name + ' ' + Math.round(state.run.v.bottleneck.util * 100) + '%', utilization: Object.fromEntries(Object.entries(state.run.v.util).map(([k, x]) => [k, Math.round(x * 100) + '%'])), average_wait_min: +state.run.sum.agg.avgWait.mean.toFixed(1), one_in_ten_wait_min: +state.run.sum.agg.p90Wait.mean.toFixed(1), rules_fired_days: state.run.sum.fireDays } : null,
    playback_now: { time: fmtClock(state.sim.now), seen: mt.seen, waiting: state.sim.waiting.length },
    checks: state.checks.map(c => c.label + ': ' + (c.pass ? 'pass' : 'fail'))
  };
}
function chatRules() {
  return 'You are the assistant inside Floorplan Intelligence, where a team reviews a clinic floor plan, changes it, simulates a day in it and then exports it to Blender.\n'
    + 'Reply in plain language in 1 to 4 short sentences. No headings. Use the tools for facts and never invent numbers.\n'
    + 'Simulate has a scenario builder made of typed blocks (staff shifts, appointments, walk-ins, visit types, breaks, staff out, closed rooms, group arrivals, When/Then rules). '
    + 'Capacity or what-if questions such as "can it handle 90 patients?" or "what if we add a nurse?": run simulate_day with those numbers (it changes the scenario in the builder for that run only) and report the verdict, the busiest resource, the average wait and the 1-in-10 wait. '
    + 'To run the builder\'s scenario as it is, use run_scenario. When explaining waits, name the busiest resource from last_run and suggest one concrete change to try.\n'
    + 'To show a room use show_room. To take someone around the clinic use start_tour.\n'
    + 'Editing is optional: it opens from the Review step (open_editor). Changes: when two rooms on the same side of the corridor should trade places and can_swap_rooms is true, use swap_rooms and report before and after. '
    + 'For other layout changes (resizing, adding or removing rooms) explain that in the full product the request goes to the plan generator (Module 1), and offer a swap or a simulation that helps now.\n'
    + 'Exports contain clinic.glb for Blender, plan.json, plan.svg, a Blender build script and a Claude skill.\n'
    + 'Current state of the page (JSON): ' + JSON.stringify(chatContext());
}
function scenarioFrom(i) {
  const base = state.scenario, n = (x, d) => (x == null || isNaN(+x) ? d : clamp(Math.round(+x), 1, 200));
  return Object.assign({}, base, { patients: n(i && i.patients, base.patients), providers: n(i && i.providers, base.providers), nurses: n(i && i.nurses, base.nurses) });
}
function whatIf(i) {
  const o = {}, n = x => (x == null || isNaN(+x) ? null : clamp(Math.round(+x), 1, 200));
  if (i && n(i.patients) != null) o.patients = n(i.patients);
  if (i && n(i.providers) != null) o.providers = clamp(n(i.providers), 1, 10);
  if (i && n(i.nurses) != null) o.nurses = clamp(n(i.nurses), 1, 10);
  return compileScenario(applyOverrides(state.scn, o));
}
function toolSimulate(i) {
  if (!state.P) throw new Error('No plan is loaded yet.');
  if (state.probs.some(p => p.level === 'error')) throw new Error('The scenario in the builder has problems to fix first: ' + state.probs.find(p => p.level === 'error').msg);
  const sc = whatIf(i), days = [];
  for (let d = 0; d < 5; d++) days.push(runDay(state.P, sc, daySeed(sc.seed, d)));
  const sum = summarizeDays(days), v = verdictOf(sum), a = sum.agg;
  return { patients: sc.patients, providers: sc.providers, nurses: sc.nurses, days: 5, verdict: v.title, busiest: v.bottleneck.name + ' ' + Math.round(v.bottleneck.util * 100) + '%', seen: Math.round(a.seen.mean), avg_wait_min: +a.avgWait.mean.toFixed(1), one_in_ten_wait_min: +a.p90Wait.mean.toFixed(1), time_in_clinic_min: Math.round(a.avgTime.mean), nurse_km_each: +a.nurseKm.mean.toFixed(2), day_ends: fmtClock(a.lastExit.mean) };
}
function toolCompare(i) {
  if (!state.P) throw new Error('No plan is loaded yet.');
  const sc = whatIf(i);
  return compareRows(sc).map(r => ({ layout: r.name, avg_wait_min: +r.m.avgWait.toFixed(1), one_in_ten_wait_min: +r.m.p90Wait.toFixed(1), nurse_km_each: +r.m.nurseKm.toFixed(2), longest_patient_journey_m: Math.round(r.info.routes.journey.len) }));
}
function toolShowRoom(name) {
  const r = findRoom(name);
  if (!r) throw new Error('No room called "' + name + '". Rooms: ' + state.P.m.rooms.map(q => q.label).join(', '));
  if (state.step !== 'review' && state.step !== 'simulate') setStep('review');
  state.selectedRoom = r.id; focusRoom(r); renderReviewInfo(); refreshPlanOverlay();
  return { shown: r.label };
}
function toolSwap(a, b) {
  const ra = findRoom(a), rb = findRoom(b);
  if (!ra || !rb) throw new Error('Couldn’t find ' + (!ra ? '"' + a + '"' : '"' + b + '"') + '.');
  if (!state.editing) enterEdit();
  state.swapSel = [ra.id, rb.id];
  const r = applySwap();
  if (r.error) throw new Error(r.error);
  return r;
}
const CHAT_TOOLS = [
  { name: 'simulate_day', description: 'Runs one simulated clinic day on the current plan. Optional numbers override the current scenario. Returns waits in minutes, nurse walking in km per nurse, exam-room use and when the day ends.', inputSchema: { type: 'object', properties: { patients: { type: 'number' }, providers: { type: 'number' }, nurses: { type: 'number' } } }, execute: i => { const r = toolSimulate(i); chatNote('Ran a day with ' + r.patients + ' patients'); return r; } },
  { name: 'compare_layouts', description: 'Runs the same simulated day on the current plan and the sample layouts, and returns key numbers for each.', inputSchema: { type: 'object', properties: { patients: { type: 'number' }, providers: { type: 'number' }, nurses: { type: 'number' } } }, execute: i => { chatNote('Compared layouts on the same day'); return toolCompare(i); } },
  { name: 'show_room', description: 'Moves the camera to a room and highlights it on the plan. Pass the room name, for example "Exam 3" or "Nurse station". Returns the room shown.', inputSchema: { type: 'object', properties: { room: { type: 'string' } }, required: ['room'] }, execute: i => { const r = toolShowRoom(String(i.room)); chatNote('Showed ' + r.shown); return r; } },
  { name: 'swap_rooms', description: 'Swaps two rooms on the same side of the corridor and saves a new version (sample layouts only). Returns nurse walking before and after, or an error saying why not.', inputSchema: { type: 'object', properties: { room_a: { type: 'string' }, room_b: { type: 'string' } }, required: ['room_a', 'room_b'] }, execute: i => { const r = toolSwap(String(i.room_a), String(i.room_b)); chatNote('Swapped ' + r.swapped.join(' and ')); return r; } },
  { name: 'run_scenario', description: 'Runs the scenario that is in the Simulate builder for its number of days, saves it to History and opens the results. Returns the verdict and key numbers.', execute: () => { if (state.step !== 'simulate') setStep('simulate'); const r = runScenarioNow(); if (!r) throw new Error('The scenario has problems to fix first.'); chatNote('Ran “' + r.name + '”'); return { name: r.name, days: r.sum.n, verdict: r.v.title, busiest: r.v.bottleneck.name, avg_wait_min: +r.sum.agg.avgWait.mean.toFixed(1), one_in_ten_wait_min: +r.sum.agg.p90Wait.mean.toFixed(1) }; } },
  { name: 'start_tour', description: 'Opens the Review step and starts the guided tour of every room in the 3D view.', execute: () => { setStep('review'); startTour(0); chatNote('Started the guided tour'); return { started: true }; } },
  { name: 'open_editor', description: 'Opens the optional edit panel in Review, where rooms can be swapped or renamed and furniture added.', execute: () => { enterEdit(); chatNote('Opened the editor'); return { editing: true }; } },
  { name: 'go_to_step', description: 'Opens one of the four steps: import, review, simulate or export.', inputSchema: { type: 'object', properties: { step: { type: 'string', enum: STEPS } }, required: ['step'] }, execute: i => { setStep(String(i.step)); return { step: state.step }; } }
];
function chatBubble(role, text) {
  const box = $('#chatLog'), el = document.createElement('div');
  el.className = 'msg ' + ({ user: 'me', assistant: 'bot' }[role] || role); el.textContent = text;
  box.appendChild(el); box.scrollTop = box.scrollHeight;
  return el;
}
function chatNote(text) { const el = chatBubble('note', text); return el; }
function fallbackReply(text) {
  const t = text.toLowerCase();
  try {
    if (/tour|show me around|walk me/.test(t)) { if (!state.P) importPlan({ kind: 'pipeline', key: 'A' }); setStep('review'); startTour(0); return 'Starting the guided tour. Use the controls under the 3D view to pause or skip.'; }
    const sw = t.match(/swap (?:the )?(.+?) (?:and|with) (?:the )?(.+?)[.?!]*$/);
    if (sw && state.P) { const r = toolSwap(sw[1], sw[2]); return 'Swapped ' + r.swapped.join(' and ') + '. Nurse walk to the average exam room went from ' + r.nurse_walk_avg_m_before + ' m to ' + r.nurse_walk_avg_m_after + ' m.'; }
    if (/bigger|smaller|larger|resize|enlarge|shrink|add (a|an|another|one)|remove|delete/.test(t)) return 'Resizing, adding or removing rooms goes to the plan generator (Module 1) in the full product. In this preview, choose Edit plan in the Review step to swap two rooms, rename rooms or add furniture.';
    if (state.P && /compare|best layout|which layout/.test(t)) { const rows = toolCompare({}), best = rows.slice().sort((a, b) => a.nurse_km_each - b.nurse_km_each)[0]; return best.layout + ' has the least nurse walking on this day: ' + best.nurse_km_each + ' km per nurse. Open Simulate and choose Compare layouts for the full table.'; }
    const num = t.match(/(\d+)\s*(?:patients?|visits?)/);
    if (state.P && (num || /\bhandle\b|capacity|how many|how long|why .*wait|wait time/.test(t))) { const r = toolSimulate({ patients: num ? +num[1] : undefined }); return 'On a day with ' + r.patients + ' patients, the average wait is ' + r.avg_wait_min + ' min and 1 in 10 patients wait more than ' + r.one_in_ten_wait_min + ' min. Each nurse walks ' + r.nurse_km_each + ' km.'; }
    const room = state.P && findRoom(t.replace(/^(show|where is|go to|see)( me)?( the)?/, ''));
    if (room) { toolShowRoom(room.label); return 'Here’s ' + room.label + '. ' + (PURPOSE[room.type] || ''); }
    if (/export|blender/.test(t)) return 'The export is a .zip with clinic.glb (open it in Blender with File > Import > glTF 2.0), plan.json, plan.svg, a Blender build script and a Claude skill.';
  } catch (e) { return e.message; }
  return 'In this view I can run a day ("can it handle 90 patients?"), compare layouts, show a room, swap two rooms or start the tour.';
}
async function sendChat(text) {
  text = String(text || '').trim();
  if (!text || state.chat.busy) return;
  $('#chatInput').value = '';
  chatBubble('user', text);
  state.chat.turns.push({ role: 'user', content: text });
  if (!caps.sample) { const r = fallbackReply(text); chatBubble('assistant', r); state.chat.turns.push({ role: 'assistant', content: r }); return; }
  const bubble = chatBubble('assistant', 'Thinking…');
  state.chat.busy = true; state.chat.ctl = new AbortController();
  $('#chatStop').hidden = false; $('#chatSend').disabled = true;
  try {
    const turns = [{ role: 'user', content: chatRules() }].concat(state.chat.turns.slice(-10));
    const opts = { modelTier: 'quick', signal: state.chat.ctl.signal, onText: ({ text: t }) => { bubble.textContent = t; $('#chatLog').scrollTop = $('#chatLog').scrollHeight; } };
    if (caps.toolsOK) opts.tools = CHAT_TOOLS; else opts.cache = false;
    const { text: answer } = await caps.sample(turns, opts);
    bubble.textContent = answer;
    state.chat.turns.push({ role: 'assistant', content: answer });
  } catch (e) {
    const code = e && e.code;
    if (code === 'cancelled') bubble.textContent = (e.text || '') + (e.text ? '\n' : '') + 'Stopped.';
    else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable'].includes(code)) {
      caps.sample = null; updateChatMode();
      const r = fallbackReply(text); bubble.textContent = r; state.chat.turns.push({ role: 'assistant', content: r });
    } else if (code === 'rate_limited') bubble.textContent = 'Too many questions at once. Wait a moment, then ask again.';
    else bubble.textContent = (e && e.text) || 'Something went wrong. Try asking again.';
  } finally {
    state.chat.busy = false; $('#chatStop').hidden = true; $('#chatSend').disabled = false;
  }
}
function updateChatMode() {
  $('#chatMode').textContent = caps.sample ? 'Preview: answers come from Claude in this artifact. The real build uses Nemotron on Token Factory.' : 'Simple answers only: Claude isn’t available in this view. The real build uses Nemotron on Token Factory.';
}
function toggleChat(open) {
  const app = $('#app'), on = open == null ? !app.classList.contains('chat-open') : open;
  app.classList.toggle('chat-open', on);
  $('#assistant').hidden = !on;
  $('#assistantBtn').setAttribute('aria-pressed', String(on));
  if (on) setTimeout(() => $('#chatInput').focus(), 50);
  requestAnimationFrame(() => { resize(); moveGlider(); });
}

/* ---------- Bindings ---------- */
function bindUI() {
  document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => setStep(b.dataset.step)));
  $('#stepper').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...document.querySelectorAll('[data-step]')].filter(b => !b.disabled), i = tabs.findIndex(b => b.dataset.step === state.step);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (n) { setStep(n.dataset.step); n.focus(); }
  });
  document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => setStep(b.dataset.next)));
  $('#openPipeline').addEventListener('click', () => importPlan({ kind: 'pipeline', key: 'A' }));
  document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => importPlan({ kind: 'sample', key: b.dataset.sample })));
  $('#fileInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0], msg = $('#fileMsg');
    if (!f) return;
    f.text().then(t => { const json = JSON.parse(t); importPlan({ kind: 'file', json, file: f.name }); state.uploaded = json; msg.hidden = true; })
      .catch(err => { msg.hidden = false; msg.textContent = 'Couldn’t read ' + f.name + ': ' + err.message + '. The page expects plan.json v0.1: rooms with "rect" or "polygon_mm", and doors with "center_mm".'; });
  });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'tour') startTour(0); else if (state.view === 'tour') { endTour(); if (v !== 'orbit') setView(v); } else setView(v);
  }));
  document.querySelectorAll('[data-walls]').forEach(b => b.addEventListener('click', () => { state.walls = b.dataset.walls; document.querySelectorAll('[data-walls]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.walls === state.walls))); buildWalls(); syncEditMarks(); }));
  $('#tourPlay').addEventListener('click', () => { tour.playing = !tour.playing; if (tour.playing && tour.phase === 'dwell' && tour.t >= tour.dwell) nextTourStop(); onTourStop(tour.i, tour.stops.length, tour.stops[tour.i]); });
  $('#tourPrev').addEventListener('click', prevTourStop);
  $('#tourNext').addEventListener('click', nextTourStop);
  $('#tourExit').addEventListener('click', endTour);
  const route = (id, key) => $(id).addEventListener('change', e => { state.planRoutes[key] = e.target.checked; state.routes[key] = e.target.checked; if (R3 && R3.routeMeshes) R3.routeMeshes[key].visible = e.target.checked; refreshPlanOverlay(); });
  route('#rJourney', 'journey'); route('#rStaff', 'staff'); route('#rEgress', 'egress');
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { state.editTool = b.dataset.tool; if (state.editTool !== 'furniture') stopPlacing(); state.swapSel = []; state.renameSel = null; if (state.editing && state.editTool !== 'furniture') setDockOpen(true); renderEditTools(); renderPlanHint(); refreshPlanOverlay(); }));
  $('#editToggle').addEventListener('click', () => state.editing ? exitEdit() : enterEdit());
  $('#doneEditing').addEventListener('click', () => exitEdit());
  bindDock();
  $('#swapApply').addEventListener('click', applySwap);
  $('#swapClear').addEventListener('click', () => { state.swapSel = []; renderEditTools(); refreshPlanOverlay(); });
  $('#renameSave').addEventListener('click', applyRename);
  $('#renameInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyRename(); });
  document.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => { if (state.placing === b.dataset.place) stopPlacing(); else startPlacing(b.dataset.place); renderEditTools(); }));
  $('#rotateBtn').addEventListener('click', rotateSelected);
  $('#removeBtn').addEventListener('click', removeSelected);
  $('#askBigger').addEventListener('click', () => { toggleChat(true); $('#chatInput').value = 'Make the waiting room 20% bigger'; $('#chatInput').focus(); });
  $('#playBtn').addEventListener('click', () => { if (state.sim.done) resetSim(0); state.playing = !state.playing; updateTransport(); });
  $('#restartBtn').addEventListener('click', () => { resetSim(0); updateTransport(); });
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { state.speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  $('#tl').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(), d = dayRange(state.sim); seek(d.t0 + clamp((e.clientX - r.left) / r.width, 0, 1) * (d.t1 - d.t0)); });
  $('#closeCompare').addEventListener('click', () => { $('#comparePanel').hidden = true; });
  $('#lyrTraffic').addEventListener('change', e => { state.layers.traffic = e.target.checked; if (R3 && R3.heat) R3.heat.mesh.visible = e.target.checked; if (e.target.checked) paintHeat(); });
  $('#lyrWaits').addEventListener('change', e => { state.layers.waits = e.target.checked; });
  document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => {
    const v = state.versions[state.vIndex], base = slug(v.name) + '-v' + v.n, kind = b.dataset.export;
    if (kind === 'zip') saveFile(base + '.zip', exportBundle);
    else if (kind === 'json') saveFile(base + '.json', planJsonExport);
    else if (kind === 'svg') saveFile(base + '.svg', () => planSVG(state.P, {}));
  }));
  $('#assistantBtn').addEventListener('click', () => toggleChat());
  $('#chatClose').addEventListener('click', () => toggleChat(false));
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); sendChat($('#chatInput').value); });
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat($('#chatInput').value); } });
  $('#chatStop').addEventListener('click', () => state.chat.ctl && state.chat.ctl.abort());
  window.addEventListener('keydown', e => {
    if (/input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (state.placing) stopPlacing(); else if (state.selected) selectItem(null); else if (state.view === 'tour') endTour(); else if (state.view !== 'orbit') setView('orbit'); renderEditTools(); return; }
    if (k === 'r' && state.editing) { rotateSelected(); return; }
    if ((k === 'delete' || k === 'backspace') && state.selected) { e.preventDefault(); removeSelected(); return; }
    if (state.view === 'walk' && ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { walker.keys.add(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => walker.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => walker.keys.clear());
  document.querySelectorAll('[data-pad]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); walker.pad.add(b.dataset.pad); });
    const stop = () => walker.pad.delete(b.dataset.pad);
    b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
  });
  $('#zoomIn').addEventListener('click', () => { if (state.view !== 'orbit') { if (state.view === 'tour') endTour(); else setView('orbit'); } orbit.goal.r = clamp(orbit.goal.r * 0.78, 5, 90); });
  $('#zoomOut').addEventListener('click', () => { if (state.view !== 'orbit') { if (state.view === 'tour') endTour(); else setView('orbit'); } orbit.goal.r = clamp(orbit.goal.r * 1.28, 5, 90); });
  $('#zoomFit').addEventListener('click', () => { if (state.view !== 'orbit') { if (state.view === 'tour') endTour(); else setView('orbit'); } fitCamera(); highlightRoom(null); state.selectedRoom = null; renderReviewInfo(); refreshPlanOverlay(); });
}
function rendererNote() {
  const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator, badge = $('#rendererBadge');
  if (!R3) { badge.textContent = '3D off'; badge.title = 'The 3D renderer didn’t start in this browser.'; return; }
  badge.textContent = R3.gl2 ? 'WebGL2' : 'WebGL1';
  badge.title = gpu ? 'This preview renders with WebGL2. WebGPU is available here, so the real build will use it with WebGL2 as the fallback.' : 'This preview renders with WebGL2. WebGPU isn’t available here, which is when the real build falls back to WebGL2.';
}
function applyTheme() {
  const T = themeColors();
  if (R3 && state.P) {
    R3.scene.background = texFrom(gradientTex([[0, T.sky], [1, T.horizon]], 4, 256, true), 1, 1, false);
    if (R3.scene.fog) R3.scene.fog.color.set(T.horizon);
    R3.mat.ground.color.set(T.ground);
    if (R3.routeMeshes) for (const [k, c] of [['journey', T.accent], ['staff', T.staff], ['egress', T.egress]]) R3.routeMeshes[k].children.forEach(o => o.material.color.set(c));
  }
  $('#swJ').style.background = T.accent; $('#swS').style.background = T.staff; $('#swE').style.background = T.egress;
  drawTimeline();
}
function resize() {
  if (!R3) return;
  const st = $('#view3dBody'), w = st.clientWidth, h = st.clientHeight;
  if (!w || !h) return;
  R3.renderer.setSize(w, h);
  R3.camera.aspect = w / h;
  R3.camera.updateProjectionMatrix();
}
let last = performance.now(), lastSun = 0, lastHeat = 0, lastPeople2d = 0, lastCaption = 0;
function loop(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
  last = ts;
  const sim = state.sim;
  if (state.P && sim && state.playing && !sim.done) { sim.advanceTo(sim.now + dt * state.speed); if (sim.done) dayDone(); }
  if (is3DVisible() && state.P) {
    if (ts - lastSun > 400) { setSun(sim ? sim.now : 90); lastSun = ts; }
    R3.tex.chevron.offset.x -= dt * 0.9;
    updatePeople(dt);
    pulseMarks(ts);
    if (state.view === 'orbit') applyOrbit(dt);
    else if (state.view === 'walk') updateWalk(dt);
    else if (state.view === 'tour') updateTour(dt);
    else updateFollow(dt);
    R3.renderer.render(R3.scene, R3.camera);
  }
  if (state.P) {
    updateLive(false);
    if (is2DVisible() && ts - lastPeople2d > 140) { planPeople($('#plan2d svg'), state.P, sim, ROLE_DOTS); lastPeople2d = ts; }
    if (ts - lastCaption > 700) {
      if (state.view === 'tour') { const el = $('#capNow'), st = tour.stops[tour.i]; if (el && st && st.room) el.textContent = roomNow(st.room); }
      const rn = $('#roomNow'), sr = state.selectedRoom && state.P.m.rooms.find(q => q.id === state.selectedRoom);
      if (rn && sr) rn.textContent = roomNow(sr);
      lastCaption = ts;
    }
    if (state.layers.traffic && state.step === 'simulate' && ts - lastHeat > 700) { paintHeat(); lastHeat = ts; }
  }
  requestAnimationFrame(loop);
}
function initCapabilities() {
  const cl = window.claude;
  updateChatMode();
  if (!cl || typeof cl.use !== 'function') { renderExport(); return; }
  cl.use('sample').then(fn => {
    caps.sample = fn || null; updateChatMode();
    if (fn && fn.limits) fn.limits().then(l => { caps.toolsOK = !!(l && l.tools); }).catch(() => { caps.toolsOK = false; });
  }).catch(() => { caps.sample = null; updateChatMode(); });
  cl.use('downloads').then(d => { caps.downloads = d || null; if (state.step === 'export') renderExport(); }).catch(() => { caps.downloads = null; });
}
function renderSampleThumbs() {
  for (const k of ['A', 'B', 'C']) {
    const el = $('#thumb' + k), t = $('#thumbText' + k);
    if (!el) continue;
    const P = preparePlan(SAMPLES[k], []);
    el.innerHTML = planSVG(P, { compact: true, labels: false, furniture: true, doors: false, dims: false });
    if (t) t.textContent = SAMPLE_SPECS[k].blurb + '. Nurses walk ' + Math.round(P.info.avgNurse) + ' m to the average exam room.';
  }
}
function init() {
  const want = (location.hash || '').replace('#', '');
  state.dock = loadDock() || { open: false, corner: 'br', w: 440, h: 300 };
  initThree();
  renderSampleThumbs();
  bindUI();
  initSimulate();
  rendererNote();
  updatePlanHeader();
  renderSuggestions();
  setStep('import');
  document.querySelectorAll('[data-step]').forEach(b => { if (b.dataset.step !== 'import') b.disabled = true; });
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { resize(); applyDock(); moveGlider(); drawTimeline(); }); ['#workspace', '#view3dBody'].forEach(s => ro.observe($(s))); }
  window.addEventListener('resize', () => { resize(); moveGlider(); });
  if (window.matchMedia) { const q = window.matchMedia('(prefers-color-scheme: dark)'); if (q.addEventListener) q.addEventListener('change', applyTheme); }
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { moveGlider(); if (R3 && state.P) buildLabels(); });
  if ((STEPS.includes(want) && want !== 'import') || want === 'edit') { importPlan({ kind: 'pipeline', key: 'A' }); setStep(want === 'edit' ? 'review' : want); if (want === 'edit') enterEdit(); }
  state.playing = !reduceMotion;
  updateTransport();
  applyTheme();
  initCapabilities();
  requestAnimationFrame(loop);
}
init();
