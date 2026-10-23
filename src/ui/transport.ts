/* ---------- The day being shown: reset, seek, end of day, and the transport bar ---------- */
import { ClinicSim, clamp, fmtClock, fmtMin, type Metrics } from '../engine';
import { state } from '../state';
import { paintHeat } from '../view3d/scene';
import { R3 } from '../view3d/r3';
import { $ } from './dom';
import { ICON } from './icons';
import { themeColors } from './theme';

export function resetSim(startAt: number): void {
  if (!state.P) return;
  state.sim = new ClinicSim(state.P.m, state.P.g, state.P.pf, state.P.info, state.scenario, state.seed);
  if (startAt) state.sim.advanceTo(startAt);
  if (R3) {
    for (const p of R3.people.values()) R3.root.remove(p.root);
    R3.people.clear();
  }
  $('#dayMsg').textContent = '';
  if (state.layers.traffic) paintHeat();
  updateLive(true);
}
export function seek(min: number): void {
  if (!state.sim) return;
  if (min >= state.sim.now) state.sim.advanceTo(min);
  else resetSim(min);
  if (R3) {
    for (const p of R3.people.values()) R3.root.remove(p.root);
    R3.people.clear();
  }
  if (state.layers.traffic) paintHeat();
  if ((state.sim as ClinicSim).done) dayDone();
  else updateLive(true);
}
export function dayDone(): void {
  state.playing = false;
  const mt = (state.sim as ClinicSim).metrics();
  $('#dayMsg').textContent = 'Day finished at ' + fmtClock(mt.lastExit) + ' with ' + mt.seen + ' patients seen.';
  if (state.layers.traffic) paintHeat();
  updateTransport();
  updateLive(true);
}
export const KPIS: [keyof Metrics, string, (m: Metrics) => string][] = [
  ['seen', 'Patients seen', m => String(m.seen)],
  ['avgWait', 'Average wait', m => fmtMin(m.avgWait)],
  ['p90Wait', '1 in 10 waited over', m => fmtMin(m.p90Wait)],
  ['avgTime', 'Time in the clinic', m => fmtMin(m.avgTime)],
  ['nurseKm', 'Walking per nurse', m => m.nurseKm.toFixed(1) + ' km'],
  ['examUse', 'Exam rooms in use', m => Math.round(m.examUse * 100) + '%']
];
/* Kept from the reference, which has no #kpis element in the page, so nothing calls it. */
export function buildKpis(): void {
  $('#kpis').innerHTML = KPIS.map(
    ([k, label]) =>
      '<div class="kpi"><span class="kpi-label">' +
      label +
      '</span><span class="kpi-value" id="kpi_' +
      k +
      '">0</span></div>'
  ).join('');
}
let lastLive = 0;
export function updateLive(force: boolean): void {
  const s = state.sim;
  if (!s) return;
  const now = performance.now();
  if (!force && now - lastLive < 300) return;
  lastLive = now;
  $('#clock').textContent = fmtClock(s.now);
  $('#liveIn').textContent = String(s.inClinic);
  $('#liveWait').textContent = String(s.waiting.length);
  $('#liveSeen').textContent = String(s.seen);
  if (state.step === 'simulate' || force) drawTimeline();
}
export function updateTransport(): void {
  const b = document.querySelector('#playBtn');
  if (!b) return;
  b.setAttribute('aria-label', state.playing ? 'Pause the day' : 'Play the day');
  b.innerHTML = state.playing ? ICON.pause : ICON.play;
}
export function drawTimeline(): void {
  const cv = document.querySelector<HTMLCanvasElement>('#tl'),
    s = state.sim;
  if (!cv || !s || !cv.clientWidth) return;
  const w = cv.clientWidth,
    h = cv.clientHeight || 34,
    dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const { t0, t1 } = dayRange(s),
    g = cv.getContext('2d') as CanvasRenderingContext2D,
    T = themeColors(),
    X = (t: number): number => clamp((t - t0) / (t1 - t0), 0, 1) * w;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  renderTicks(t0, t1);
  g.fillStyle = T.rule;
  g.fillRect(0, h - 6, w, 3);
  const ser = s.series,
    mx = Math.max(4, ...ser.map(p => p.inClinic));
  const area = (key: 'inClinic' | 'lobby', color: string, alpha: number): void => {
    g.beginPath();
    g.moveTo(0, h - 8);
    for (let i = 0; i < ser.length; i++) {
      const p = ser[i],
        nx = i + 1 < ser.length ? ser[i + 1].t : s.now,
        yy = h - 8 - (p[key] / mx) * (h - 12);
      g.lineTo(X(p.t), yy);
      g.lineTo(X(nx), yy);
    }
    g.lineTo(X(s.now), h - 8);
    g.closePath();
    g.fillStyle = color;
    g.globalAlpha = alpha;
    g.fill();
    g.globalAlpha = 1;
  };
  area('inClinic', T.accent, 0.18);
  area('lobby', T.warn, 0.6);
  g.fillStyle = T.accent;
  g.fillRect(0, h - 6, X(s.now), 3);
  g.beginPath();
  g.arc(X(s.now), h - 4.5, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = T.warn;
  for (const f of s.fires || []) {
    const x = X(f.t);
    g.beginPath();
    g.moveTo(x - 5, 1);
    g.lineTo(x + 5, 1);
    g.lineTo(x, 9);
    g.closePath();
    g.fill();
  }
}
export function dayRange(s: { opens?: number | null; closes?: number | null; lastExit?: number }): {
  t0: number;
  t1: number;
} {
  const t0 = s.opens != null ? s.opens : 0,
    t1 = Math.max(s.closes != null ? s.closes : 600, s.lastExit || 0, t0 + 60);
  return { t0, t1 };
}
let tickKey = '';
export function renderTicks(t0: number, t1: number): void {
  const key = t0 + ':' + Math.round(t1);
  if (key === tickKey) return;
  tickKey = key;
  const box = document.querySelector('#tlTicks');
  if (!box) return;
  const out: string[] = [];
  for (let t = Math.ceil((t0 + 480) / 120) * 120 - 480; t <= t1; t += 120)
    out.push(
      '<span style="left:' +
        (((t - t0) / (t1 - t0)) * 100).toFixed(2) +
        '%">' +
        fmtClock(t).replace(':00', '') +
        '</span>'
    );
  box.innerHTML = out.join('');
}
