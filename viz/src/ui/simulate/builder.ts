/* ---------- Palette, block cards with typed fields, and drag and drop ---------- */
import {
  BLOCK_GROUPS,
  BLOCK_TYPES,
  makeBlock,
  type Block,
  type BlockFields,
  type FieldDef,
  type FieldValue,
  type Scenario
} from '../../engine';
import { state } from '../../state';
import { $, esc, reduceMotion } from '../dom';
import { toast, toastAction } from '../toast';
import { refreshChecks } from './checks';
import { ROLE_COLORS, SVG_CHEV, SVG_COPY, SVG_GRIP, SVG_TRASH, TYPE_COLORS, bIcon } from './consts';
import { blockOf, markEdited, renderPresetChips, safeSummary, setSimTab } from './index';
import { renderDayTimeline } from './timeline';

const scn = (): Scenario => state.scn as Scenario;

/* ---------- Palette ---------- */
export function renderPalette(): void {
  const box = $('#palette');
  box.innerHTML =
    '<h2>Blocks</h2><p class="small muted">Drag a block into the scenario, or click it to add it.</p>' +
    BLOCK_GROUPS.map(g => {
      const types = Object.entries(BLOCK_TYPES).filter(([, T]) => T.group === g.key);
      return (
        '<section><h3>' +
        esc(g.label) +
        '</h3>' +
        types
          .map(
            ([k, T]) =>
              '<button type="button" class="pchip" data-add="' +
              k +
              '"><span class="pi" style="--c:' +
              (TYPE_COLORS[k] || '#5d6b78') +
              '">' +
              bIcon(T.icon) +
              '</span><span class="pt"><b>' +
              esc(T.label) +
              '</b><small>' +
              esc(T.desc) +
              '</small></span></button>'
          )
          .join('') +
        '</section>'
      );
    }).join('');
  box.querySelectorAll<HTMLElement>('.pchip').forEach(b => {
    b.addEventListener('pointerdown', e => startBlockDrag(e, { add: b.dataset.add }));
    b.addEventListener('click', () => {
      if (dragJustEnded) return;
      addBlock(b.dataset.add as string);
    });
  });
}

/* ---------- Block cards with typed fields ---------- */
export function fieldInput(b: Block, k: string, f: FieldDef): string {
  const v = b.fields[k],
    id = 'f_' + b.id + '_' + k;
  let inp = '';
  if (f.type === 'int' || f.type === 'percent')
    inp =
      '<span class="inwrap"><input type="number" inputmode="numeric" id="' +
      id +
      '" data-k="' +
      k +
      '" value="' +
      (typeof v === 'number' && isFinite(v) ? v : '') +
      '" min="' +
      (f.min != null ? f.min : '') +
      '" max="' +
      (f.max != null ? f.max : '') +
      '" step="1">' +
      (f.type === 'percent' ? '<i>%</i>' : '') +
      '</span>';
  else if (f.type === 'time')
    inp = '<input type="time" id="' + id + '" data-k="' + k + '" value="' + esc(v || '') + '" step="300">';
  else if (f.type === 'enum')
    inp =
      '<select id="' +
      id +
      '" data-k="' +
      k +
      '">' +
      Object.entries(f.options as Record<string, string>)
        .map(([o, l]) => '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>' + esc(l) + '</option>')
        .join('') +
      '</select>';
  else if (f.type === 'text')
    inp =
      '<input type="text" id="' +
      id +
      '" data-k="' +
      k +
      '" value="' +
      esc(v || '') +
      '" maxlength="' +
      (f.max || 40) +
      '">';
  else if (f.type === 'range') {
    const r = Array.isArray(v) ? v : ['', ''];
    inp =
      '<span class="rangein"><input type="number" id="' +
      id +
      '" data-k="' +
      k +
      '" data-i="0" value="' +
      r[0] +
      '" min="' +
      f.min +
      '" max="' +
      f.max +
      '" step="1" aria-label="' +
      esc(f.label) +
      ', shortest"><span>to</span><input type="number" data-k="' +
      k +
      '" data-i="1" value="' +
      r[1] +
      '" min="' +
      f.min +
      '" max="' +
      f.max +
      '" step="1" aria-label="' +
      esc(f.label) +
      ', longest"></span>';
  } else if (f.type === 'bool')
    inp =
      '<label class="switch"><input type="checkbox" id="' +
      id +
      '" data-k="' +
      k +
      '"' +
      (v ? ' checked' : '') +
      '><span></span></label>';
  else if (f.type === 'room') {
    const rooms = state.P ? state.P.m.rooms.filter(r => !f.roomTypes || f.roomTypes.includes(r.type)) : [];
    inp =
      '<select id="' +
      id +
      '" data-k="' +
      k +
      '"><option value="">Pick a room</option>' +
      rooms
        .map(
          r => '<option value="' + esc(r.id) + '"' + (r.id === v ? ' selected' : '') + '>' + esc(r.label) + '</option>'
        )
        .join('') +
      '</select>';
  }
  const hide = f.showIf && !f.showIf(b.fields);
  return (
    '<div class="frow t-' +
    f.type +
    (hide ? ' is-hidden' : '') +
    '" data-k="' +
    k +
    '"><label for="' +
    id +
    '">' +
    esc(f.label) +
    '</label>' +
    inp +
    (f.help ? '<small>' + esc(f.help) + '</small>' : '') +
    '</div>'
  );
}
export function cardColor(b: Block): string {
  return b.type === 'shift' ? ROLE_COLORS[b.fields.role as string] || '#2453d6' : TYPE_COLORS[b.type] || '#2453d6';
}
export function cardHTML(b: Block): string {
  const T = BLOCK_TYPES[b.type];
  if (!T)
    return (
      '<article class="bcard bad" data-id="' +
      esc(b.id) +
      '"><header><span class="bt"><b>Unknown block “' +
      esc(b.type) +
      '”</b><span class="bsum">This version doesn’t know this block yet.</span></span><span class="bacts"><button type="button" class="iconbtn sm" data-act="del" aria-label="Remove this block">' +
      SVG_TRASH +
      '</button></span></header></article>'
    );
  const fold = state.folded.has(b.id);
  const acts =
    (T.required
      ? ''
      : '<label class="switch sm" title="Use this block"><input type="checkbox" data-act="toggle"' +
        (b.enabled !== false ? ' checked' : '') +
        ' aria-label="Use this block"><span></span></label>' +
        (T.single
          ? ''
          : '<button type="button" class="iconbtn sm" data-act="dup" aria-label="Copy this block" title="Copy">' +
            SVG_COPY +
            '</button>') +
        '<button type="button" class="iconbtn sm" data-act="del" aria-label="Remove this block" title="Remove">' +
        SVG_TRASH +
        '</button>') +
    '<button type="button" class="iconbtn sm fold" data-act="fold" aria-expanded="' +
    !fold +
    '" aria-label="' +
    (fold ? 'Show the fields' : 'Hide the fields') +
    '">' +
    SVG_CHEV +
    '</button>';
  return (
    '<article class="bcard' +
    (b.enabled === false ? ' off' : '') +
    (fold ? ' folded' : '') +
    '" data-id="' +
    b.id +
    '" style="--c:' +
    cardColor(b) +
    '">' +
    '<header>' +
    (T.single
      ? '<span class="grip ghost" aria-hidden="true"></span>'
      : '<span class="grip" title="Drag to reorder" aria-hidden="true">' + SVG_GRIP + '</span>') +
    '<span class="bi">' +
    bIcon(T.icon) +
    '</span><span class="bt"><b>' +
    esc(T.label) +
    '</b><span class="bsum">' +
    esc(safeSummary(b)) +
    '</span></span><span class="bacts">' +
    acts +
    '</span></header>' +
    '<div class="bfields">' +
    Object.entries(T.fields)
      .map(([k, f]) => fieldInput(b, k, f))
      .join('') +
    '</div><div class="berr" hidden></div></article>'
  );
}
export function renderBuilder(): void {
  const s = state.scn;
  if (!s) return;
  $<HTMLInputElement>('#scnName').value = s.name;
  renderPresetChips();
  const box = $('#scnSections');
  box.innerHTML = BLOCK_GROUPS.map(g => {
    const list = s.blocks.filter(b => (BLOCK_TYPES[b.type] ? BLOCK_TYPES[b.type].group : 'rules') === g.key);
    return (
      '<section class="bsec" data-group="' +
      g.key +
      '"><header><h3>' +
      esc(g.label) +
      '</h3><small>' +
      esc(g.hint) +
      '</small><span class="cnt">' +
      list.length +
      '</span></header><div class="bcards" data-group="' +
      g.key +
      '">' +
      list.map(cardHTML).join('') +
      '<div class="dropslot' +
      (list.length ? ' subtle' : '') +
      '">' +
      (list.length ? 'Drop here' : 'Drag a block here from the list, or click one') +
      '</div></div></section>'
    );
  }).join('');
  refreshChecks();
  renderDayTimeline();
}
export function updateCardSummary(card: HTMLElement, b: Block): void {
  const s = card.querySelector('.bsum');
  if (s) s.textContent = safeSummary(b);
  card.style.setProperty('--c', cardColor(b));
}
export function syncCardFields(b: Block): void {
  const card = document.querySelector<HTMLElement>('.bcard[data-id="' + b.id + '"]');
  if (!card) return;
  card.querySelectorAll<HTMLInputElement>('[data-k]').forEach(el => {
    if (el.tagName === 'DIV') return;
    const k = el.dataset.k as string,
      v = b.fields[k];
    if (el.type === 'time' || el.tagName === 'SELECT' || el.type === 'text') el.value = v == null ? '' : String(v);
  });
  updateCardSummary(card, b);
}
export function parseFieldValue(el: HTMLInputElement, f: FieldDef, cur: FieldValue): FieldValue {
  if (f.type === 'int' || f.type === 'percent') return el.value === '' ? NaN : Number(el.value);
  if (f.type === 'range') {
    const r = Array.isArray(cur) ? cur.slice() : [NaN, NaN];
    r[+(el.dataset.i as string)] = el.value === '' ? NaN : Number(el.value);
    return r;
  }
  if (f.type === 'bool') return el.checked;
  return el.value;
}
let checkTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleChecks(now?: boolean): void {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(
    () => {
      refreshChecks();
      renderDayTimeline();
    },
    now ? 0 : 140
  );
}
export function bindBuilder(): void {
  const box = $('#scnSections');
  const onField = (e: Event): void => {
    const el = e.target as HTMLInputElement,
      card = el.closest<HTMLElement>('.bcard');
    if (!card || !el.dataset.k || el.dataset.act) return;
    const b = blockOf(card.dataset.id as string),
      T = b && BLOCK_TYPES[b.type];
    if (!b || !T) return;
    const f = T.fields[el.dataset.k];
    b.fields[el.dataset.k] = parseFieldValue(el, f, b.fields[el.dataset.k]);
    for (const [k2, f2] of Object.entries(T.fields))
      if (f2.showIf) {
        const row = card.querySelector('.frow[data-k="' + k2 + '"]');
        if (row) row.classList.toggle('is-hidden', !f2.showIf(b.fields));
      }
    updateCardSummary(card, b);
    markEdited();
    scheduleChecks();
  };
  box.addEventListener('input', onField);
  box.addEventListener('change', onField);
  box.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLInputElement>('[data-act]');
    if (!btn) return;
    const card = btn.closest<HTMLElement>('.bcard'),
      id = card && (card.dataset.id as string),
      b = id ? blockOf(id) : undefined,
      act = btn.dataset.act;
    if (!card || !id) return;
    if (act === 'toggle') {
      (b as Block).enabled = btn.checked;
      card.classList.toggle('off', !btn.checked);
      markEdited();
      scheduleChecks(true);
    } else if (act === 'dup') {
      const blk = b as Block;
      const c: Block = JSON.parse(JSON.stringify(blk));
      c.id = makeBlock(blk.type).id;
      const arr = scn().blocks;
      arr.splice(arr.indexOf(blk) + 1, 0, c);
      markEdited();
      renderBuilder();
      focusCard(c.id, true);
    } else if (act === 'del') {
      const arr = scn().blocks,
        i = arr.findIndex(x => x.id === id),
        gone = arr.splice(i, 1)[0];
      markEdited();
      renderBuilder();
      toastAction(
        'Removed “' + (BLOCK_TYPES[gone.type] ? BLOCK_TYPES[gone.type].label : gone.type) + '”.',
        'Undo',
        () => {
          scn().blocks.splice(i, 0, gone);
          renderBuilder();
          focusCard(gone.id, true);
        }
      );
    } else if (act === 'fold') {
      if (state.folded.has(id)) state.folded.delete(id);
      else state.folded.add(id);
      card.classList.toggle('folded');
      btn.setAttribute('aria-expanded', String(!state.folded.has(id)));
    }
  });
  box.addEventListener('pointerdown', e => {
    const g = (e.target as Element).closest('.grip');
    if (!g || g.classList.contains('ghost')) return;
    const card = g.closest<HTMLElement>('.bcard') as HTMLElement;
    startBlockDrag(e, { move: card.dataset.id });
  });
  $('#scnName').addEventListener('input', e => {
    scn().name = (e.target as HTMLInputElement).value.slice(0, 60) || 'My scenario';
    markEdited();
  });
}
export function smartDefaults(type: string): Partial<BlockFields> {
  const on = scn().blocks.filter(b => b.enabled !== false);
  if (type === 'shift') {
    const have = new Set(on.filter(b => b.type === 'shift').map(b => b.fields.role));
    const role = ['provider', 'nurse', 'reception'].find(r => !have.has(r)) || 'nurse';
    return { role, count: role === 'provider' ? 3 : role === 'nurse' ? 2 : 1 };
  }
  if (type === 'closed') {
    const ex = state.P && state.P.m.rooms.find(r => r.type === 'exam_room');
    return { room: ex ? ex.id : '' };
  }
  if (type === 'visit_type') {
    const n = on.filter(b => b.type === 'visit_type').length;
    return n
      ? { name: 'Visit type ' + (n + 1), share: 20, provider_min: [15, 25] }
      : { name: 'Standard visit', share: 100 };
  }
  return {};
}
export function addBlock(type: string, beforeId?: string | null): void {
  const T = BLOCK_TYPES[type];
  if (!T || !state.scn) return;
  const existing = T.single && state.scn.blocks.find(b => b.type === type);
  if (existing) {
    focusCard(existing.id, true);
    toast('This scenario already has “' + T.label + '”.');
    return;
  }
  const b = makeBlock(type, smartDefaults(type));
  insertBlock(b, beforeId);
  markEdited();
  renderBuilder();
  focusCard(b.id, true);
}
export function insertBlock(b: Block, beforeId?: string | null): void {
  const arr = scn().blocks,
    i = beforeId ? arr.findIndex(x => x.id === beforeId) : -1;
  if (i >= 0) arr.splice(i, 0, b);
  else arr.push(b);
}
export function moveBlock(id: string, beforeId?: string | null): void {
  if (id === beforeId) return;
  const arr = scn().blocks,
    i = arr.findIndex(x => x.id === id);
  if (i < 0) return;
  const b = arr.splice(i, 1)[0];
  insertBlock(b, beforeId);
  markEdited();
  renderBuilder();
  focusCard(b.id, true);
}
export function focusCard(id: string, flash?: boolean): void {
  if (state.simTab !== 'scenario') setSimTab('scenario');
  const card = document.querySelector<HTMLElement>('.bcard[data-id="' + id + '"]');
  if (!card) return;
  card.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  if (flash) {
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }
}

/* ---------- Drag and drop: palette into the scenario, and cards within their section ---------- */
interface BlockDrag {
  src: { add?: string; move?: string };
  x0: number;
  y0: number;
  active: boolean;
  ghost: HTMLElement | null;
  target: { before: string | null; after: string | null } | null;
  group?: string;
}
let bDrag: BlockDrag | null = null,
  dragJustEnded = false;
export function startBlockDrag(e: PointerEvent, src: BlockDrag['src']): void {
  if (e.button !== 0 || !state.scn) return;
  e.preventDefault();
  bDrag = { src, x0: e.clientX, y0: e.clientY, active: false, ghost: null, target: null };
  window.addEventListener('pointermove', moveBlockDrag);
  window.addEventListener('pointerup', endBlockDrag);
  window.addEventListener('pointercancel', cancelBlockDrag);
}
export function clearInsertLine(): void {
  document.querySelectorAll('.insline').forEach(n => n.remove());
}
export function moveBlockDrag(e: PointerEvent): void {
  const d = bDrag;
  if (!d) return;
  if (!d.active) {
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    const type = d.src.add || blockOf(d.src.move as string)?.type,
      T = type ? BLOCK_TYPES[type] : undefined;
    if (!T || !type) {
      cancelBlockDrag();
      return;
    }
    d.active = true;
    d.group = T.group;
    document.body.classList.add('dragging-block');
    const sec = document.querySelector('.bsec[data-group="' + T.group + '"]');
    if (sec) sec.classList.add('drop-ok');
    if (d.src.move) {
      const c = document.querySelector('.bcard[data-id="' + d.src.move + '"]');
      if (c) c.classList.add('lifted');
    }
    const g = document.createElement('div');
    g.className = 'dragghost';
    g.style.setProperty('--c', TYPE_COLORS[type] || '#2453d6');
    g.innerHTML = bIcon(T.icon) + '<span>' + esc(T.label) + '</span>';
    document.body.appendChild(g);
    d.ghost = g;
  }
  const ghost = d.ghost as HTMLElement;
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';
  const cv = $('#scnCanvas'),
    cr = cv.getBoundingClientRect();
  if (e.clientY < cr.top + 50) cv.scrollTop -= 14;
  else if (e.clientY > cr.bottom - 50) cv.scrollTop += 14;
  const list = document.querySelector('.bcards[data-group="' + d.group + '"]');
  clearInsertLine();
  if (!list) return;
  const sr = (list.closest('.bsec') as HTMLElement).getBoundingClientRect();
  const over = e.clientX >= cr.left && e.clientX <= cr.right && e.clientY >= sr.top - 40 && e.clientY <= sr.bottom + 40;
  if (!over) {
    d.target = null;
    return;
  }
  const cards = [...list.querySelectorAll<HTMLElement>('.bcard')].filter(c => c.dataset.id !== d.src.move);
  let idx = cards.length;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) {
      idx = i;
      break;
    }
  }
  d.target = {
    before: cards[idx] ? (cards[idx].dataset.id as string) : null,
    after: idx > 0 ? (cards[idx - 1].dataset.id as string) : null
  };
  const line = document.createElement('div');
  line.className = 'insline';
  list.insertBefore(line, cards[idx] || list.querySelector('.dropslot'));
}
export function cleanupBlockDrag(): void {
  window.removeEventListener('pointermove', moveBlockDrag);
  window.removeEventListener('pointerup', endBlockDrag);
  window.removeEventListener('pointercancel', cancelBlockDrag);
  document.body.classList.remove('dragging-block');
  document.querySelectorAll('.drop-ok').forEach(n => n.classList.remove('drop-ok'));
  document.querySelectorAll('.lifted').forEach(n => n.classList.remove('lifted'));
  clearInsertLine();
  if (bDrag && bDrag.ghost) bDrag.ghost.remove();
}
export function cancelBlockDrag(): void {
  cleanupBlockDrag();
  bDrag = null;
}
export function endBlockDrag(): void {
  const d = bDrag;
  cleanupBlockDrag();
  bDrag = null;
  if (!d || !d.active) return;
  dragJustEnded = true;
  setTimeout(() => {
    dragJustEnded = false;
  }, 0);
  if (!d.target) return;
  const arr = scn().blocks;
  let before = d.target.before;
  if (!before && d.target.after) {
    const i = arr.findIndex(x => x.id === (d.target as NonNullable<BlockDrag['target']>).after);
    before = arr[i + 1] && arr[i + 1].id !== d.src.move ? arr[i + 1].id : null;
  }
  if (d.src.add) addBlock(d.src.add, before);
  else moveBlock(d.src.move as string, before);
}
