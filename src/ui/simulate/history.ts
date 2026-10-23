/* ---------- History: every run is saved in this browser ---------- */
import { BLOCK_TYPES, compileScenario, fmtMin, roleName, type Scenario } from '../../engine';
import { state, type HistoryEntry, type Run } from '../../state';
import { $, esc, reduceMotion } from '../dom';
import { toast, toastAction } from '../toast';
import { renderBuilder } from './builder';
import { HISTORY_KEY, SVG_TRASH } from './consts';
import { fillRoomDefaults, safeSummary, setSimTab } from './index';
import { fmtKm, fmtN, fmtPct } from './results';
import { runScenario } from './runner';

export function loadHistory(): HistoryEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(v) ? v.filter(h => h && h.scn && h.agg) : [];
  } catch {
    return [];
  }
}
export function storeHistory(): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  } catch {
    /* storage unavailable or full */
  }
}
export function saveHistory(run: Run): void {
  const keep: HistoryEntry['agg'] = {};
  for (const k of ['seen', 'avgWait', 'p90Wait', 'avgTime', 'nurseKm', 'turnedAway'] as const) keep[k] = run.sum.agg[k];
  const entry: HistoryEntry = {
    id: run.id,
    at: run.at,
    kind: run.kind,
    name: run.name,
    plan: run.plan,
    scn: run.scn,
    n: run.sum.n,
    verdict: { level: run.v.level, title: run.v.title, bottleneck: run.v.bottleneck },
    agg: keep,
    sweep: run.sweep ? { field: run.sweep.field, values: run.sweep.rows.map(x => x.value) } : null
  };
  state.history = [entry].concat(state.history.filter(h => h.id !== entry.id)).slice(0, 30);
  storeHistory();
  renderHistoryCount();
}
export function renderHistoryCount(): void {
  const c = document.querySelector('#histCount');
  if (c) c.textContent = state.history.length ? String(state.history.length) : '';
}
const WORDS: Record<string, [string, string]> = {
  break: ['break', 'breaks'],
  out: ['staff out', 'staff out'],
  closed: ['room closed', 'rooms closed'],
  group: ['group arrival', 'group arrivals'],
  rule: ['rule', 'rules']
};
export function scnFacts(scn: Scenario): string {
  try {
    const sc = compileScenario(scn),
      on = scn.blocks.filter(b => b.enabled !== false);
    const extra = Object.keys(WORDS)
      .map((t): [string, number] => [t, on.filter(b => b.type === t).length])
      .filter(x => x[1]);
    return (
      sc.patients +
      ' patients, ' +
      sc.providers +
      ' ' +
      roleName('provider', sc.providers) +
      ', ' +
      sc.nurses +
      ' ' +
      roleName('nurse', sc.nurses) +
      ', ' +
      sc.receptionists +
      ' ' +
      roleName('reception', sc.receptionists) +
      (extra.length ? ', ' + extra.map(([t, k]) => k + ' ' + WORDS[t][k === 1 ? 0 : 1]).join(', ') : '')
    );
  } catch {
    return '';
  }
}
export function renderHistory(): void {
  renderHistoryCount();
  const box = document.querySelector<HTMLElement>('#historyList');
  if (!box) return;
  const cmp = $<HTMLButtonElement>('#histCompare');
  if (!state.history.length) {
    box.innerHTML =
      '<li class="empty"><h3>Nothing here yet</h3><p>Every run you make is saved here, so you can reload a scenario later or compare runs.</p></li>';
    cmp.disabled = true;
    return;
  }
  box.innerHTML = state.history
    .map(h => {
      const when = new Date(h.at),
        sel = state.histSel.has(h.id);
      return (
        '<li class="' +
        (sel ? 'sel' : '') +
        '"><label class="hcheck"><input type="checkbox" data-sel="' +
        h.id +
        '"' +
        (sel ? ' checked' : '') +
        ' aria-label="Select for comparison"></label>' +
        '<div class="hmain"><b>' +
        esc(h.name) +
        '</b><small>' +
        when.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ', ' +
        when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
        ' on ' +
        esc(h.plan.name) +
        ', version ' +
        h.plan.version +
        ', ' +
        h.n +
        (h.n === 1 ? ' day' : ' days') +
        (h.kind === 'range' ? ' per value' : '') +
        '</small><small>' +
        esc(scnFacts(h.scn)) +
        '</small></div>' +
        '<span class="vpill ' +
        h.verdict.level +
        '">' +
        esc(h.verdict.title) +
        '</span>' +
        '<span class="hnum"><b>' +
        fmtMin(h.agg.avgWait.mean) +
        '</b>average wait</span><span class="hnum"><b>' +
        fmtMin(h.agg.p90Wait.mean) +
        '</b>1 in 10 over</span>' +
        '<span class="hacts"><button type="button" class="btn small" data-load="' +
        h.id +
        '">Load scenario</button><button type="button" class="btn small" data-show="' +
        h.id +
        '">Run again</button><button type="button" class="iconbtn sm" data-del="' +
        h.id +
        '" aria-label="Delete this run">' +
        SVG_TRASH +
        '</button></span></li>'
      );
    })
    .join('');
  cmp.disabled = state.histSel.size < 2;
  cmp.textContent = 'Compare selected' + (state.histSel.size ? ' (' + state.histSel.size + ')' : '');
}
export function bindHistory(): void {
  const box = $('#historyList');
  box.addEventListener('change', e => {
    const input = e.target as HTMLInputElement,
      id = input.dataset.sel;
    if (!id) return;
    if (input.checked) {
      if (state.histSel.size >= 4) {
        input.checked = false;
        toast('Compare up to 4 runs at a time.');
        return;
      }
      state.histSel.add(id);
    } else state.histSel.delete(id);
    renderHistory();
  });
  box.addEventListener('click', e => {
    const t = (e.target as Element).closest<HTMLElement>('[data-load],[data-show],[data-del]');
    if (!t) return;
    const id = (t.dataset.load || t.dataset.show || t.dataset.del) as string,
      h = state.history.find(x => x.id === id);
    if (!h) return;
    if (t.dataset.del) {
      state.history = state.history.filter(x => x.id !== id);
      state.histSel.delete(id);
      storeHistory();
      renderHistory();
      return;
    }
    state.scn = fillRoomDefaults(JSON.parse(JSON.stringify(h.scn)));
    state.scn.edited = false;
    renderBuilder();
    if (t.dataset.load) {
      setSimTab('scenario');
      toast('Loaded “' + h.name + '” into the scenario.');
    } else runScenario({ save: false });
  });
  $('#histCompare').addEventListener('click', compareHistory);
  $('#histClear').addEventListener('click', () => {
    const prev = state.history.slice();
    state.history = [];
    state.histSel.clear();
    storeHistory();
    renderHistory();
    $('#histCompareBox').innerHTML = '';
    toastAction('Cleared the history.', 'Undo', () => {
      state.history = prev;
      storeHistory();
      renderHistory();
    });
  });
}
export function compareHistory(): void {
  const list = state.history.filter(h => state.histSel.has(h.id)).reverse();
  if (list.length < 2) return;
  const sums = list.map(
    h =>
      new Set(
        h.scn.blocks
          .filter(b => b.enabled !== false)
          .map(b => (BLOCK_TYPES[b.type] ? BLOCK_TYPES[b.type].label + ': ' : '') + safeSummary(b))
      )
  );
  const base = sums[0];
  const diff = (s: Set<string>, i: number): string => {
    if (i === 0) return '<span class="muted">The starting point</span>';
    const added = [...s].filter(x => !base.has(x)),
      removed = [...base].filter(x => !s.has(x));
    if (!added.length && !removed.length) return '<span class="muted">Same scenario</span>';
    const items = added
        .map(x => '<li class="add">' + esc(x) + '</li>')
        .concat(removed.map(x => '<li class="rem">' + esc(x) + '</li>')),
      more = items.length - 8;
    return (
      '<ul class="diff">' +
      items.slice(0, 8).join('') +
      (more > 0 ? '<li class="more">and ' + more + ' more ' + (more === 1 ? 'change' : 'changes') + '</li>' : '') +
      '</ul>'
    );
  };
  const row = (label: string, f: (h: HistoryEntry, i: number) => string): string =>
    '<tr><th scope="row">' + label + '</th>' + list.map((h, i) => '<td>' + f(h, i) + '</td>').join('') + '</tr>';
  const best = (k: string, i: number): boolean => {
    const vals = list.map(h => h.agg[k].mean),
      m = Math.min(...vals);
    return Math.abs(list[i].agg[k].mean - m) < 1e-9 && vals.some(x => Math.abs(x - m) > 1e-9);
  };
  $('#histCompareBox').innerHTML =
    '<h3>Runs compared</h3><div class="tablewrap"><table class="cmp"><thead><tr><th scope="col"></th>' +
    list
      .map(
        h =>
          '<th scope="col">' +
          esc(h.name) +
          '<small>' +
          new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
          '</small></th>'
      )
      .join('') +
    '</tr></thead><tbody>' +
    row('Verdict', h => '<span class="vpill ' + h.verdict.level + '">' + esc(h.verdict.title) + '</span>') +
    row(
      'Average wait',
      (h, i) => '<span class="' + (best('avgWait', i) ? 'best' : '') + '">' + fmtMin(h.agg.avgWait.mean) + '</span>'
    ) +
    row(
      '1 in 10 waited over',
      (h, i) => '<span class="' + (best('p90Wait', i) ? 'best' : '') + '">' + fmtMin(h.agg.p90Wait.mean) + '</span>'
    ) +
    row('Patients seen', h => fmtN(h.agg.seen.mean)) +
    row(
      'Walking per nurse',
      (h, i) => '<span class="' + (best('nurseKm', i) ? 'best' : '') + '">' + fmtKm(h.agg.nurseKm.mean) + '</span>'
    ) +
    row('Busiest', h => esc(h.verdict.bottleneck.name) + ' ' + fmtPct(h.verdict.bottleneck.util)) +
    row('What’s different', (h, i) => diff(sums[i], i)) +
    '</tbody></table></div>';
  $('#histCompareBox').scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}
