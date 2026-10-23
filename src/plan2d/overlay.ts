/* Live overlays on the interactive plan: selection outlines, the patient path, and people as dots. */
import { posAt, type ClinicSim, type PreparedPlan } from '../engine';
import { esc } from '../ui/esc';
import { R3 } from '../view3d/r3';
import { PLAN_COLORS } from './plan-svg';

/* An outline: room id, color, dashed, and an optional badge (a number or a pencil). */
export type Outline = [string, string, boolean, string?];
export interface OverlayOpts {
  outlines?: Outline[];
  journey?: boolean;
  staff?: boolean;
  egress?: boolean;
}
export function planOverlay(svg: Element | null, P: PreparedPlan, o: OverlayOpts): void {
  if (!svg) return;
  const m = P.m,
    S = 100,
    X = (x: number): string => (x * S).toFixed(1),
    Y = (y: number): string => ((m.D - y) * S).toFixed(1);
  const sel = svg.querySelector('#planSel'),
    rt = svg.querySelector('#planRoutes');
  if (sel) {
    let h = '';
    for (const [id, color, dash, badge] of o.outlines || []) {
      const r = m.rooms.find(q => q.id === id);
      if (!r) continue;
      h +=
        '<rect x="' +
        X(r.x) +
        '" y="' +
        Y(r.y + r.h) +
        '" width="' +
        (r.w * S).toFixed(1) +
        '" height="' +
        (r.h * S).toFixed(1) +
        '" fill="' +
        color +
        '" fill-opacity="0.2" stroke="' +
        color +
        '" stroke-width="10"' +
        (dash ? ' stroke-dasharray="22 12"' : '') +
        ' pointer-events="none"/>';
      if (badge) {
        const bx = X(r.x + r.w / 2),
          by = (+Y(r.y + r.h) + 70).toFixed(1);
        h +=
          '<g pointer-events="none"><circle cx="' +
          bx +
          '" cy="' +
          by +
          '" r="52" fill="' +
          color +
          '" stroke="#fff" stroke-width="8"/><text x="' +
          bx +
          '" y="' +
          (+by + 19) +
          '" text-anchor="middle" font-size="56" font-weight="700" fill="#fff">' +
          esc(badge) +
          '</text></g>';
      }
    }
    sel.innerHTML = h;
  }
  if (rt) {
    let h = '';
    const line = (pts: { x: number; y: number }[] | null | undefined, color: string, w: number): void => {
      if (pts && pts.length > 1)
        h +=
          '<polyline points="' +
          pts.map(p => X(p.x) + ',' + Y(p.y)).join(' ') +
          '" fill="none" stroke="' +
          color +
          '" stroke-width="' +
          w +
          '" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>';
    };
    const r = P.info.routes;
    if (o.staff) for (const st of r.staff) line(st.pts, PLAN_COLORS.staff, 7);
    if (o.journey) for (const l of r.journey.legs) line(l, PLAN_COLORS.path, 10);
    if (o.egress && r.egress) line(r.egress.pts, PLAN_COLORS.egress, 10);
    rt.innerHTML = h;
  }
}
export function planPeople(
  svg: Element | null,
  P: PreparedPlan,
  sim: ClinicSim | null,
  colors: Record<string, string>
): void {
  const g = svg && svg.querySelector('#planPeople');
  if (!g || !sim) return;
  const m = P.m,
    S = 100;
  let h = '';
  for (const a of sim.agents) {
    if (!a.active) continue;
    const p = R3 && R3.people.get(a.id),
      x = p ? p.dx : posAt(a, sim.now).x,
      y = p ? p.dy : posAt(a, sim.now).y;
    h +=
      '<circle cx="' +
      (x * S).toFixed(1) +
      '" cy="' +
      ((m.D - y) * S).toFixed(1) +
      '" r="17" fill="' +
      (colors[a.role] || '#555') +
      '" stroke="#fff" stroke-width="4"/>';
  }
  g.innerHTML = h;
}
