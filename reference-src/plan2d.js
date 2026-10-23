/* ---------- 2D plan drawing (SVG). The same drawing is used live, for thumbnails and in the export. ---------- */
const PLAN_COLORS = {
  sheet: '#ffffff', wall: '#27323c', text: '#1f2b36', sub: '#5d6976', dim: '#7a8591', furn: '#c3c9cf', furnFill: '#f4f5f6',
  window: '#5b9bd5', door: '#27323c', swing: '#9aa4ad', path: '#2453d6', staff: '#11806a', egress: '#c73a1f',
  zones: { public: '#e2eef8', clinical: '#e2f2e7', staff: '#f6eed8', support: '#ebe6f5', circulation: '#f2f3f3' }
};
function planSVG(P, opts) {
  opts = Object.assign({ labels: true, furniture: true, doors: true, windows: true, dims: true, entrance: true, live: false, compact: false }, opts || {});
  const m = P.m, S = 100, pad = opts.compact ? 30 : (opts.dims ? 170 : 90), C = PLAN_COLORS;
  const X = x => +(x * S).toFixed(1), Y = y => +((m.D - y) * S).toFixed(1);
  const vb = [-pad, -pad, m.W * S + pad * 2, m.D * S + pad * 2];
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') + '" preserveAspectRatio="xMidYMid meet" font-family="Atkinson Hyperlegible, Helvetica, Arial, sans-serif"' + (opts.live ? ' class="plansvg"' : '') + '>';
  s += '<rect x="' + vb[0] + '" y="' + vb[1] + '" width="' + vb[2] + '" height="' + vb[3] + '" fill="' + C.sheet + '"/>';
  for (const r of m.rooms) s += '<rect class="room" data-id="' + esc(r.id) + '" x="' + X(r.x) + '" y="' + Y(r.y + r.h) + '" width="' + (r.w * S).toFixed(1) + '" height="' + (r.h * S).toFixed(1) + '" fill="' + (C.zones[r.zone] || C.zones.support) + '"/>';
  if (opts.furniture) {
    s += '<g fill="' + C.furnFill + '" stroke="' + C.furn + '" stroke-width="2.5">';
    for (const it of P.furn.items) {
      if (it.kind === 'rug') continue;
      const R = itemRect(it);
      if (it.kind === 'plant') s += '<circle cx="' + X(it.x) + '" cy="' + Y(it.y) + '" r="' + ((R.x1 - R.x0) * S / 2).toFixed(1) + '" fill="#e5f0e1" stroke="#b7cfae"/>';
      else s += '<rect x="' + X(R.x0) + '" y="' + Y(R.y1) + '" width="' + ((R.x1 - R.x0) * S).toFixed(1) + '" height="' + ((R.y1 - R.y0) * S).toFixed(1) + '" rx="4"/>';
    }
    s += '</g>';
  }
  if (opts.live) s += '<g id="planRoutes"></g>';
  const walls = extractWalls(m, P.g);
  s += '<g stroke="' + C.wall + '" stroke-linecap="square">';
  for (const w of walls) {
    const t = w.ext ? 24 : 12;
    s += w.orient === 'v'
      ? '<line x1="' + X(w.at) + '" y1="' + Y(w.from) + '" x2="' + X(w.at) + '" y2="' + Y(w.to) + '" stroke-width="' + t + '"/>'
      : '<line x1="' + X(w.from) + '" y1="' + Y(w.at) + '" x2="' + X(w.to) + '" y2="' + Y(w.at) + '" stroke-width="' + t + '"/>';
  }
  s += '</g>';
  if (opts.windows) {
    for (const q of planWindows(m)) {
      if (q.orient === 'h') {
        s += '<rect x="' + X(q.from) + '" y="' + (Y(q.at) - 13) + '" width="' + ((q.to - q.from) * S).toFixed(1) + '" height="26" fill="' + C.sheet + '"/>';
        s += '<line x1="' + X(q.from) + '" y1="' + (Y(q.at) - 6) + '" x2="' + X(q.to) + '" y2="' + (Y(q.at) - 6) + '" stroke="' + C.window + '" stroke-width="3"/><line x1="' + X(q.from) + '" y1="' + (Y(q.at) + 6) + '" x2="' + X(q.to) + '" y2="' + (Y(q.at) + 6) + '" stroke="' + C.window + '" stroke-width="3"/>';
      } else {
        s += '<rect x="' + (X(q.at) - 13) + '" y="' + Y(q.to) + '" width="26" height="' + ((q.to - q.from) * S).toFixed(1) + '" fill="' + C.sheet + '"/>';
        s += '<line x1="' + (X(q.at) - 6) + '" y1="' + Y(q.from) + '" x2="' + (X(q.at) - 6) + '" y2="' + Y(q.to) + '" stroke="' + C.window + '" stroke-width="3"/><line x1="' + (X(q.at) + 6) + '" y1="' + Y(q.from) + '" x2="' + (X(q.at) + 6) + '" y2="' + Y(q.to) + '" stroke="' + C.window + '" stroke-width="3"/>';
      }
    }
  }
  if (opts.doors) {
    s += '<g fill="none">';
    for (const gp of doorGaps(m)) {
      if (gp.kind !== 'door' || gp.isEntrance) continue;
      const ra = m.rooms.find(r => r.id === gp.a && r.type !== 'corridor') || m.rooms.find(r => r.id === gp.b && r.type !== 'corridor');
      if (!ra) continue;
      const L = Math.min(0.95, gp.to - gp.from - 0.08);
      let hx, hy, ox, oy, cx, cy;
      if (gp.orient === 'v') { const sd = ra.x + ra.w / 2 < gp.at ? -1 : 1; hx = gp.at; hy = gp.from + 0.04; ox = hx + sd * L; oy = hy; cx = hx; cy = hy + L; }
      else { const sd = ra.y + ra.h / 2 < gp.at ? -1 : 1; hx = gp.from + 0.04; hy = gp.at; ox = hx; oy = hy + sd * L; cx = hx + L; cy = hy; }
      const v1x = X(ox) - X(hx), v1y = Y(oy) - Y(hy), v2x = X(cx) - X(hx), v2y = Y(cy) - Y(hy), sweep = v1x * v2y - v1y * v2x > 0 ? 1 : 0;
      s += '<line x1="' + X(hx) + '" y1="' + Y(hy) + '" x2="' + X(ox) + '" y2="' + Y(oy) + '" stroke="' + C.door + '" stroke-width="4"/>';
      s += '<path d="M' + X(ox) + ' ' + Y(oy) + ' A' + (L * S).toFixed(1) + ' ' + (L * S).toFixed(1) + ' 0 0 ' + sweep + ' ' + X(cx) + ' ' + Y(cy) + '" stroke="' + C.swing + '" stroke-width="2" stroke-dasharray="7 6"/>';
    }
    s += '</g>';
  }
  if (opts.labels) {
    for (const r of m.rooms) {
      if (r.type === 'corridor' && opts.compact) continue;
      const name = r.label, area = (r.w * r.h).toFixed(1) + ' m²', cx = X(r.x + r.w / 2), cy = Y(r.y + r.h / 2);
      const fs = clamp(Math.min(r.w, r.h) * 12, 20, 30), est = name.length * fs * 0.56;
      const vertical = est > r.w * S * 0.86 && r.h > r.w;
      const tr = vertical ? ' transform="rotate(-90 ' + cx + ' ' + cy + ')"' : '';
      s += '<g' + tr + ' text-anchor="middle" pointer-events="none"><text x="' + cx + '" y="' + (cy - 2) + '" font-size="' + fs.toFixed(0) + '" font-weight="700" fill="' + C.text + '">' + esc(name) + '</text>';
      if (r.type !== 'corridor') s += '<text x="' + cx + '" y="' + (cy + fs * 0.95) + '" font-size="' + (fs * 0.74).toFixed(0) + '" fill="' + C.sub + '">' + area + '</text>';
      s += '</g>';
    }
  }
  if (opts.entrance) {
    const d = m.doors.find(q => q.isEntrance);
    if (d) {
      const n = inwardDir(d, m), bx = d.cx - n.x * 0.95, by = d.cy - n.y * 0.95, tip = { x: d.cx - n.x * 0.32, y: d.cy - n.y * 0.32 };
      const px = -n.y * 0.34, py = n.x * 0.34;
      s += '<path d="M' + X(tip.x) + ' ' + Y(tip.y) + ' L' + X(bx + px) + ' ' + Y(by + py) + ' L' + X(bx - px) + ' ' + Y(by - py) + ' Z" fill="' + C.path + '"/>';
      if (!opts.compact) s += '<text x="' + X(d.cx - n.x * 1.35) + '" y="' + (Y(d.cy - n.y * 1.35) + (n.y > 0 ? 18 : n.y < 0 ? -6 : 8)) + '" font-size="26" font-weight="700" text-anchor="middle" fill="' + C.path + '">Entrance</text>';
    }
  }
  if (opts.dims) {
    const y0 = -95, x0 = -95, tick = 14;
    s += '<g stroke="' + C.dim + '" stroke-width="2" fill="' + C.dim + '" font-size="26" text-anchor="middle">';
    s += '<line x1="0" y1="' + y0 + '" x2="' + X(m.W) + '" y2="' + y0 + '"/><line x1="0" y1="' + (y0 - tick) + '" x2="0" y2="' + (y0 + tick) + '"/><line x1="' + X(m.W) + '" y1="' + (y0 - tick) + '" x2="' + X(m.W) + '" y2="' + (y0 + tick) + '"/>';
    s += '<text x="' + X(m.W / 2) + '" y="' + (y0 - 14) + '" stroke="none">' + m.W.toFixed(1) + ' m</text>';
    s += '<line x1="' + x0 + '" y1="0" x2="' + x0 + '" y2="' + (m.D * S) + '"/><line x1="' + (x0 - tick) + '" y1="0" x2="' + (x0 + tick) + '" y2="0"/><line x1="' + (x0 - tick) + '" y1="' + (m.D * S) + '" x2="' + (x0 + tick) + '" y2="' + (m.D * S) + '"/>';
    s += '<text x="' + (x0 - 16) + '" y="' + (m.D * S / 2) + '" stroke="none" transform="rotate(-90 ' + (x0 - 16) + ' ' + (m.D * S / 2) + ')">' + m.D.toFixed(1) + ' m</text>';
    s += '</g>';
  }
  if (opts.live) s += '<g id="planSel"></g><g id="planPeople"></g>';
  return s + '</svg>';
}
/* Live overlays on the interactive plan: selection outlines, the patient path, and people as dots. */
function planOverlay(svg, P, o) {
  if (!svg) return;
  const m = P.m, S = 100, X = x => (x * S).toFixed(1), Y = y => ((m.D - y) * S).toFixed(1);
  const sel = svg.querySelector('#planSel'), rt = svg.querySelector('#planRoutes');
  if (sel) {
    let h = '';
    for (const [id, color, dash, badge] of o.outlines || []) {
      const r = m.rooms.find(q => q.id === id);
      if (!r) continue;
      h += '<rect x="' + X(r.x) + '" y="' + Y(r.y + r.h) + '" width="' + (r.w * S).toFixed(1) + '" height="' + (r.h * S).toFixed(1) + '" fill="' + color + '" fill-opacity="0.2" stroke="' + color + '" stroke-width="10"' + (dash ? ' stroke-dasharray="22 12"' : '') + ' pointer-events="none"/>';
      if (badge) { const bx = X(r.x + r.w / 2), by = (+Y(r.y + r.h) + 70).toFixed(1); h += '<g pointer-events="none"><circle cx="' + bx + '" cy="' + by + '" r="52" fill="' + color + '" stroke="#fff" stroke-width="8"/><text x="' + bx + '" y="' + (+by + 19) + '" text-anchor="middle" font-size="56" font-weight="700" fill="#fff">' + esc(badge) + '</text></g>'; }
    }
    sel.innerHTML = h;
  }
  if (rt) {
    let h = '';
    const line = (pts, color, w) => { if (pts && pts.length > 1) h += '<polyline points="' + pts.map(p => X(p.x) + ',' + Y(p.y)).join(' ') + '" fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>'; };
    const r = P.info.routes;
    if (o.staff) for (const st of r.staff) line(st.pts, PLAN_COLORS.staff, 7);
    if (o.journey) for (const l of r.journey.legs) line(l, PLAN_COLORS.path, 10);
    if (o.egress && r.egress) line(r.egress.pts, PLAN_COLORS.egress, 10);
    rt.innerHTML = h;
  }
}
function planPeople(svg, P, sim, colors) {
  const g = svg && svg.querySelector('#planPeople');
  if (!g || !sim) return;
  const m = P.m, S = 100;
  let h = '';
  for (const a of sim.agents) {
    if (!a.active) continue;
    const p = R3 && R3.people.get(a.id), x = p ? p.dx : posAt(a, sim.now).x, y = p ? p.dy : posAt(a, sim.now).y;
    h += '<circle cx="' + (x * S).toFixed(1) + '" cy="' + ((m.D - y) * S).toFixed(1) + '" r="17" fill="' + (colors[a.role] || '#555') + '" stroke="#fff" stroke-width="4"/>';
  }
  g.innerHTML = h;
}
