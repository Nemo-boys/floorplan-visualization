/* ---------- Day timeline: bars you can drag to move, or stretch by their edges ---------- */
import {
  BLOCK_TYPES,
  clamp,
  fmtClock,
  hm,
  hmStr,
  roleName,
  roomLabel,
  type Block,
  type TimelineDef
} from '../../engine';
import { state } from '../../state';
import { $, esc } from '../dom';
import { cardColor, focusCard, scheduleChecks, syncCardFields } from './builder';
import { TL_LANES } from './consts';
import { blockOf, markEdited, safeSummary } from './index';

export function timelineLabel(b: Block): string {
  const f = b.fields;
  switch (b.type) {
    case 'shift':
      return f.count + ' ' + roleName(f.role as string, f.count as number);
    case 'break':
      return roleName(f.role as string, 1).replace(/^./, c => c.toUpperCase()) + ' breaks, ' + f.minutes + ' min';
    case 'appointments':
      return f.count + ' appointments';
    case 'walkins':
      return f.count + ' walk-ins';
    case 'out':
      return f.count + ' ' + roleName(f.role as string, f.count as number) + ' out';
    case 'closed':
      return (roomLabel(state.P, f.room as string) || 'A room') + ' closed';
    case 'group':
      return f.count + ' arrive together';
    case 'rule':
      return (
        'Rule: ' +
        (
          { waiting: 'lobby', longest: 'longest wait', desk: 'reception line', free_rooms: 'free rooms' } as Record<
            string,
            string
          >
        )[f.metric as string] +
        (f.op === 'lt' ? ' < ' : ' > ') +
        f.value
      );
    default:
      return BLOCK_TYPES[b.type] ? BLOCK_TYPES[b.type].label : b.type;
  }
}
interface LaneItem {
  b: Block;
  a: number;
  z: number;
  point?: boolean;
  soft?: boolean;
  row?: number;
}
export function renderDayTimeline(): void {
  const box = document.querySelector<HTMLElement>('#dayTimeline'),
    scn = state.scn;
  if (!box || !scn) return;
  const hb = scn.blocks.find(b => b.type === 'hours' && b.enabled !== false);
  let t0 = hb ? hm(hb.fields.opens) : 0,
    t1 = hb ? hm(hb.fields.closes) : 600;
  if (!(t1 > t0)) {
    t0 = 0;
    t1 = 600;
  }
  state.tl = { t0, t1 };
  const X = (t: number): number => ((clamp(t, t0, t1) - t0) / (t1 - t0)) * 100;
  let ticks = '';
  for (let t = Math.ceil((t0 + 480) / 60) * 60 - 480; t <= t1 + 0.1; t += 60)
    ticks += '<span style="left:' + X(t).toFixed(2) + '%">' + fmtClock(t).replace(':00', '') + '</span>';
  const lanes: Record<string, LaneItem[]> = {};
  TL_LANES.forEach(([k]) => {
    lanes[k] = [];
  });
  for (const b of scn.blocks) {
    const T = BLOCK_TYPES[b.type];
    if (b.enabled === false || !T || !T.timeline) continue;
    const L = T.timeline,
      f = b.fields;
    if (L.at) {
      const t = hm(f[L.at]);
      if (!isNaN(t)) lanes[L.lane].push({ b, a: t, z: t, point: true });
    } else {
      const a = hm(f[L.from as string]),
        z = hm(f[L.to as string]);
      if (!isNaN(a) && !isNaN(z)) lanes[L.lane].push({ b, a, z: Math.max(z, a + 5), soft: L.soft });
    }
  }
  let html = '<div class="tl-axis"><span class="tl-name"></span><div class="tl-ticks">' + ticks + '</div></div>';
  for (const [k, name] of TL_LANES) {
    const items = lanes[k].sort((p, q) => p.a - q.a || q.z - p.z),
      rows: number[] = [];
    for (const it of items) {
      let r = rows.findIndex(end => end <= it.a);
      if (r < 0) {
        r = rows.length;
        rows.push(0);
      }
      rows[r] = it.point ? it.a + (t1 - t0) * 0.12 : it.z;
      it.row = r;
    }
    const fires = k === 'rules' && state.run && state.run.fires ? state.run.fires : [];
    html +=
      '<div class="tl-lane" data-lane="' +
      k +
      '" style="--rows:' +
      Math.max(1, rows.length) +
      '"><span class="tl-name">' +
      name +
      '</span><div class="tl-track">' +
      (items.length
        ? ''
        : '<span class="tl-empty">' +
          (
            {
              staff: 'Add a staff shift',
              arrivals: 'Add appointments or walk-ins',
              events: 'Breaks out, closed rooms and groups show here',
              rules: 'Rules show here'
            } as Record<string, string>
          )[k] +
          '</span>') +
      items
        .map(it => {
          const b = it.b,
            c = cardColor(b),
            lbl = esc(timelineLabel(b)),
            tip = esc(BLOCK_TYPES[b.type].label + ': ' + safeSummary(b));
          if (it.point)
            return (
              '<div class="tl-bar point" data-id="' +
              b.id +
              '" style="left:' +
              X(it.a).toFixed(3) +
              '%;--row:' +
              it.row +
              ';--c:' +
              c +
              '" title="' +
              tip +
              '"><span class="dot"></span><span class="lbl">' +
              lbl +
              '</span></div>'
            );
          return (
            '<div class="tl-bar' +
            (it.soft ? ' soft' : '') +
            '" data-id="' +
            b.id +
            '" style="left:' +
            X(it.a).toFixed(3) +
            '%;width:' +
            (X(it.z) - X(it.a)).toFixed(3) +
            '%;--row:' +
            it.row +
            ';--c:' +
            c +
            '" title="' +
            tip +
            '"><span class="h" data-h="l"></span><span class="lbl">' +
            lbl +
            '</span><span class="h" data-h="r"></span></div>'
          );
        })
        .join('') +
      fires
        .map(
          f =>
            '<span class="tl-fire" style="left:' +
            X(f.t).toFixed(3) +
            '%" title="A rule fired at ' +
            fmtClock(f.t) +
            ' on the day shown"></span>'
        )
        .join('') +
      '</div></div>';
  }
  box.innerHTML = html;
}
interface TimelineDrag {
  el: HTMLElement;
  b: Block;
  L: TimelineDef;
  h: string;
  x0: number;
  w: number;
  a0: number;
  z0: number | null;
  moved: boolean;
}
let tlDrag: TimelineDrag | null = null;
export function bindDayTimeline(): void {
  const box = $('#dayTimeline');
  box.addEventListener('pointerdown', e => {
    const el = (e.target as Element).closest<HTMLElement>('.tl-bar');
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const b = blockOf(el.dataset.id as string) as Block,
      L = BLOCK_TYPES[b.type].timeline as TimelineDef,
      track = (el.parentElement as HTMLElement).getBoundingClientRect();
    tlDrag = {
      el,
      b,
      L,
      h: (e.target as HTMLElement).dataset.h || 'm',
      x0: e.clientX,
      w: track.width,
      a0: hm(b.fields[(L.at || L.from) as string]),
      z0: L.at ? null : hm(b.fields[L.to as string]),
      moved: false
    };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });
  box.addEventListener('pointermove', e => {
    const d = tlDrag;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    const { t0, t1 } = state.tl,
      dt = ((e.clientX - d.x0) / d.w) * (t1 - t0),
      snap = (t: number): number => Math.round(t / 5) * 5;
    let a = d.a0,
      z = d.z0 as number;
    const z0 = d.z0 as number;
    if (d.L.at) a = clamp(snap(d.a0 + dt), t0, t1);
    else if (d.h === 'l') a = clamp(snap(d.a0 + dt), t0, z0 - 5);
    else if (d.h === 'r') z = clamp(snap(z0 + dt), d.a0 + 5, t1);
    else {
      const len = z0 - d.a0;
      a = clamp(snap(d.a0 + dt), t0, Math.max(t0, t1 - len));
      z = a + len;
    }
    if (d.L.at) d.b.fields[d.L.at] = hmStr(a);
    else {
      d.b.fields[d.L.from as string] = hmStr(a);
      d.b.fields[d.L.to as string] = hmStr(z);
    }
    const X = (t: number): number => ((t - t0) / (t1 - t0)) * 100;
    d.el.style.left = X(a) + '%';
    if (!d.L.at) d.el.style.width = X(z) - X(a) + '%';
    const tip = $('#tlTip');
    tip.textContent = d.L.at ? fmtClock(a) : fmtClock(a) + ' to ' + fmtClock(z);
    tip.hidden = false;
    const br = $('#dayTimeline').getBoundingClientRect();
    tip.style.left = e.clientX - br.left + 'px';
    tip.style.top = d.el.getBoundingClientRect().top - br.top - 30 + 'px';
    syncCardFields(d.b);
    markEdited();
  });
  const up = (): void => {
    const d = tlDrag;
    if (!d) return;
    tlDrag = null;
    d.el.classList.remove('dragging');
    $('#tlTip').hidden = true;
    if (!d.moved) {
      focusCard(d.b.id, true);
      return;
    }
    scheduleChecks(true);
  };
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
}
