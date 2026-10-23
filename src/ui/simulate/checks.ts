/* ---------- Checks panel ---------- */
import { compileScenario, fmtClock, roleName, validateScenario } from '../../engine';
import { state } from '../../state';
import { $, esc } from '../dom';
import { ICON } from '../icons';
import { focusCard } from './builder';
import { SVG_WARN } from './consts';

export function refreshChecks(): void {
  if (!state.scn) return;
  const scn = state.scn;
  const probs = validateScenario(scn, state.P);
  state.probs = probs;
  const errs = probs.filter(p => p.level === 'error'),
    warns = probs.filter(p => p.level === 'warning');
  const st = $('#chkStatus');
  st.className = 'chkstatus ' + (errs.length ? 'bad' : warns.length ? 'warn' : 'ok');
  st.innerHTML = errs.length
    ? '<span class="ic">' +
      ICON.fail +
      '</span><span><b>' +
      errs.length +
      (errs.length === 1 ? ' problem' : ' problems') +
      ' to fix</b>Running is blocked until these are fixed.</span>'
    : '<span class="ic">' +
      ICON.pass +
      '</span><span><b>Ready to run</b>' +
      (warns.length
        ? warns.length + (warns.length === 1 ? ' warning, which won’t' : ' warnings, which won’t') + ' stop a run.'
        : 'Everything checks out.') +
      '</span>';
  $('#chkList').innerHTML = probs
    .map(
      (p, i) =>
        '<li class="' +
        p.level +
        '"><button type="button" data-pi="' +
        i +
        '"><span class="ic">' +
        (p.level === 'error' ? ICON.fail : SVG_WARN) +
        '</span><span>' +
        esc(p.msg) +
        '</span></button></li>'
    )
    .join('');
  $('#chkList')
    .querySelectorAll<HTMLElement>('[data-pi]')
    .forEach(btn => btn.addEventListener('click', () => focusProblem(+(btn.dataset.pi as string))));
  document.querySelectorAll<HTMLElement>('.bcard').forEach(c => {
    const mine = probs.filter(p => p.block === c.dataset.id),
      box = c.querySelector<HTMLElement>('.berr');
    if (box) {
      box.hidden = !mine.length;
      box.innerHTML = mine.map(p => '<p class="' + p.level + '">' + esc(p.msg) + '</p>').join('');
    }
    c.classList.toggle(
      'has-error',
      mine.some(p => p.level === 'error')
    );
    c.querySelectorAll<HTMLElement>('.frow').forEach(r =>
      r.classList.toggle(
        'bad',
        mine.some(p => p.level === 'error' && p.field === r.dataset.k)
      )
    );
  });
  let facts = '';
  if (!errs.length) {
    const sc = compileScenario(scn),
      on = scn.blocks.filter(b => b.enabled !== false),
      count = (t: string): number => on.filter(b => b.type === t).length;
    facts =
      '<ul class="facts"><li>About ' +
      sc.patients +
      ' patients, open ' +
      fmtClock(sc.opens) +
      ' to ' +
      fmtClock(sc.closes) +
      '</li><li>' +
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
      '</li>' +
      '<li>' +
      (
        [
          [count('break'), 'break'],
          [count('out'), 'staff out'],
          [count('closed'), 'room closed'],
          [count('group'), 'group arrival'],
          [count('rule'), 'rule']
        ] as [number, string][]
      )
        .filter(x => x[0])
        .map(x => x[0] + ' ' + x[1] + (x[0] > 1 && x[1] !== 'staff out' && x[1] !== 'room closed' ? 's' : ''))
        .join(', ')
        .replace(/^$/, 'No breaks or changes during the day') +
      '</li></ul>';
  }
  $('#chkSummary').innerHTML = facts;
  const rb = scn.blocks.find(b => b.type === 'run' && b.enabled !== false),
    days = rb && Number.isInteger(rb.fields.days) ? (rb.fields.days as number) : 20;
  const runBtn = $<HTMLButtonElement>('#runBtn');
  runBtn.disabled = !!errs.length || state.running;
  runBtn.textContent = state.running ? 'Running…' : 'Run ' + days + (days === 1 ? ' day' : ' days');
  $<HTMLButtonElement>('#sweepBtn').disabled = !!errs.length || state.running;
}
export function focusProblem(i: number): void {
  const p = state.probs[i];
  if (!p) return;
  if (!p.block) {
    const btn = document.querySelector('.pchip');
    if (btn) btn.scrollIntoView({ block: 'nearest' });
    return;
  }
  state.folded.delete(p.block);
  const card = document.querySelector('.bcard[data-id="' + p.block + '"]');
  if (card) card.classList.remove('folded');
  focusCard(p.block, true);
  if (p.field && card) {
    const inp = card.querySelector<HTMLElement>('[data-k="' + p.field + '"]:not(div)');
    if (inp) setTimeout(() => inp.focus(), 200);
  }
}
