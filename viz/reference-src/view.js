/* ===== View: renderer, building, furniture, people, cameras, controls ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);
const reduceMotion = mq('(prefers-reduced-motion: reduce)');
const isTouch = mq('(pointer: coarse)');
const SAMPLES = { A: makeSamplePlan('A'), B: makeSamplePlan('B'), C: makeSamplePlan('C') };
const state = {
  key: 'A', json: null, P: null, sim: null, playing: false, speed: 1 / 6, scenario: SCENARIOS.normal, seed: 7,
  view: 'orbit', walls: 'cut', layers: { labels: true, zones: false, furniture: true, traffic: false, waits: true },
  routes: { journey: true, staff: false, egress: false }, compare: null, uploaded: null,
  placed: [], placing: null, ghostRot: 0, selected: null, followId: null, toastTimer: 0
};
let R3 = null;
function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function themeColors() {
  const v = n => css(n) || '#888888';
  return {
    zones: { public: v('--z-public'), clinical: v('--z-clinical'), staff: v('--z-staff'), support: v('--z-support'), circulation: v('--z-circulation') },
    accent: v('--accent'), staff: v('--staff'), egress: v('--egress'), warn: v('--warn'), sky: v('--sky'), horizon: v('--horizon'), ground: v('--ground'),
    ink: v('--ink'), ink2: v('--ink-2'), panel: v('--panel'), rule: v('--rule'),
    roles: { patient: v('--r-patient'), nurse: v('--r-nurse'), provider: v('--r-provider'), reception: v('--r-reception') }
  };
}
const W2 = () => state.P.m.W, D2 = () => state.P.m.D;
const wx = x => x - W2() / 2;
const wz = y => -(y - D2() / 2);
const yawOf = (dx, dy) => Math.atan2(dx, -dy);
function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }
function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { t.hidden = true; }, 3600); }
function showNotice(text) { const n = $('#notice'); n.textContent = text; n.hidden = !text; }

/* ---------- Textures drawn in the browser (no image downloads) ---------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texFrom(c, sx, sy, repeat) {
  const t = new THREE.CanvasTexture(c);
  if (repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = R3 ? R3.aniso : 1;
  t.userData.size = [sx || 1, sy || 1];
  return t;
}
function woodTex() {
  const c = makeCanvas(512, 512), g = c.getContext('2d'), rnd = mulberry32(11), pw = 512 / 12;
  for (let r = 0; r < 12; r++) {
    let x = -rnd() * 320;
    while (x < 512) {
      const len = 170 + rnd() * 260, b = 194 + rnd() * 24;
      g.fillStyle = 'rgb(' + Math.round(b + 24) + ',' + Math.round(b + 3) + ',' + Math.round(b - 34) + ')';
      g.fillRect(x, r * pw, len, pw);
      g.globalAlpha = 0.08; g.strokeStyle = '#6b4a2a'; g.lineWidth = 1;
      for (let q = 0; q < 6; q++) {
        const yy = r * pw + 3 + rnd() * (pw - 6);
        g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + len * 0.3, yy + (rnd() - 0.5) * 5, x + len * 0.7, yy + (rnd() - 0.5) * 5, x + len, yy + (rnd() - 0.5) * 3); g.stroke();
      }
      g.globalAlpha = 1; g.fillStyle = 'rgba(90,60,30,0.32)'; g.fillRect(x, r * pw, 1.4, pw);
      x += len;
    }
    g.fillStyle = 'rgba(90,60,30,0.26)'; g.fillRect(0, r * pw, 512, 1.2);
  }
  return texFrom(c, 2.4, 2.4);
}
function speckleTex(base, specks, size, tiles, grout) {
  const c = makeCanvas(256, 256), g = c.getContext('2d'), rnd = mulberry32(5);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let q = 0; q < 2200; q++) { g.fillStyle = specks[(rnd() * specks.length) | 0]; g.globalAlpha = 0.18 + rnd() * 0.32; const s = 0.6 + rnd() * 1.5; g.fillRect(rnd() * 256, rnd() * 256, s, s); }
  g.globalAlpha = 1;
  if (tiles) { g.strokeStyle = grout; g.lineWidth = 1.4; for (let q = 0; q <= tiles; q++) { const p = q * 256 / tiles; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.moveTo(0, p); g.lineTo(256, p); g.stroke(); } }
  return texFrom(c, size, size);
}
function carpetTex() {
  const c = makeCanvas(256, 256), g = c.getContext('2d'), rnd = mulberry32(9);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const b = 150 + rnd() * 14; g.fillStyle = 'rgb(' + Math.round(b + 22) + ',' + Math.round(b + 16) + ',' + Math.round(b + 6) + ')'; g.fillRect(tx * 64, ty * 64, 64, 64);
    for (let q = 0; q < 380; q++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,50,40,0.12)'; g.fillRect(tx * 64 + rnd() * 64, ty * 64 + rnd() * 64, 1.2, 1.2); }
  }
  return texFrom(c, 2.0, 2.0);
}
function gradientTex(stops, w, h, vertical) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), gr = vertical ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0);
  for (const [t, col] of stops) gr.addColorStop(t, col);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return c;
}
function chevronTex() {
  const c = makeCanvas(128, 64), g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.moveTo(34, 10); g.lineTo(64, 32); g.lineTo(34, 54); g.lineTo(46, 54); g.lineTo(76, 32); g.lineTo(46, 10); g.closePath(); g.fill();
  const t = texFrom(c, 1, 1);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
function labelTex(name, sub) {
  const c = makeCanvas(512, 168), g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(30,42,54,0.82)';
  g.font = '700 62px "Atkinson Hyperlegible", system-ui, sans-serif';
  g.fillText(name, 256, 62, 500);
  g.fillStyle = 'rgba(30,42,54,0.6)';
  g.font = '400 42px "Atkinson Hyperlegible", system-ui, sans-serif';
  g.fillText(sub, 256, 126, 500);
  return texFrom(c, 1, 1, false);
}

/* ---------- Renderer, light and environment ---------- */
function initThree() {
  if (typeof THREE === 'undefined') { showNotice('The 3D view couldn’t load because the three.js script didn’t arrive. The plan, simulation and results still work.'); return false; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { showNotice('This browser couldn’t start WebGL, so the 3D view is off. The plan, simulation and results still work.'); return false; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('#view').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  R3 = { renderer, scene, camera, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()), gl2: renderer.capabilities.isWebGL2, cache: {}, people: new Map() };
  scene.environment = buildEnvironment(renderer);
  const sun = new THREE.DirectionalLight(0xfff3e4, 2.7);
  sun.castShadow = true;
  const big = renderer.capabilities.maxTextureSize >= 8192 && !isTouch;
  sun.shadow.mapSize.set(big ? 4096 : 2048, big ? 4096 : 2048);
  sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.022;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.HemisphereLight(0xe3ebf3, 0x8b8578, 0.32);
  scene.add(fill);
  R3.sun = sun; R3.fill = fill;
  R3.root = new THREE.Group();
  scene.add(R3.root);
  makeMaterials();
  bindPointer(renderer.domElement);
  return true;
}
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(60, 32, 16), pos = geo.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) / 60 + 1) / 2; cols.push(0.32 + 0.52 * t, 0.34 + 0.52 * t, 0.37 + 0.55 * t); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.98), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(34, 20, 0, 48, 0, 2.4);
  panel(22, 11, -40, 20, 22, 1.5);
  panel(18, 9, 34, 16, -28, 1.1);
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  return tex;
}
function setSun(min) {
  if (!R3) return;
  const h = clamp(8 + min / 60, 9, 17), az = (h - 12) / 6 * (Math.PI / 2) * 0.9, el = Math.max(0.42, Math.sin(Math.PI * (h - 6) / 12) * 1.02);
  const r = 40, ce = Math.cos(el);
  R3.sun.position.set(-Math.sin(az) * ce * r, Math.sin(el) * r, Math.cos(az) * ce * r + 6);
  R3.sun.target.position.set(0, 0, 0);
  const warm = clamp(1 - (el - 0.42) / 0.6, 0, 1);
  R3.sun.color.setRGB(1, 0.95 - warm * 0.1, 0.89 - warm * 0.2);
  R3.sun.intensity = 2.4 + (1 - warm) * 0.5;
}
function M(color, rough, metal, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough == null ? 0.7 : rough, metalness: metal || 0, envMapIntensity: 0.75 }, extra || {})); }
function makeMaterials() {
  const floor = (tex, rough, tint) => M(tint || '#ffffff', rough, 0, { map: tex });
  R3.tex = {
    wood: woodTex(),
    vinyl: speckleTex('#eef2ef', ['#c9d3cd', '#b4c3bb', '#ffffff', '#9fb2a8'], 2.0),
    vinylGrey: speckleTex('#e2e5e6', ['#c3c8cb', '#aeb5ba', '#ffffff'], 2.0),
    corridor: speckleTex('#e9e7e2', ['#cfcbc3', '#b9b4aa', '#ffffff', '#a39d92'], 2.4, 4, 'rgba(150,145,135,0.55)'),
    tile: speckleTex('#e8eef1', ['#ffffff', '#cbd5db'], 1.2, 6, 'rgba(160,172,180,0.8)'),
    carpet: carpetTex(),
    ao: texFrom(gradientTex([[0, '#000'], [1, '#fff']], 4, 64, true), 1, 1, false),
    chevron: chevronTex()
  };
  R3.mat = {
    floorWood: floor(R3.tex.wood, 0.55), floorVinyl: floor(R3.tex.vinyl, 0.42), floorGrey: floor(R3.tex.vinylGrey, 0.5),
    floorCorridor: floor(R3.tex.corridor, 0.38), floorTile: floor(R3.tex.tile, 0.3), floorCarpet: floor(R3.tex.carpet, 1),
    wall: M('#f4f3ef', 0.92), wallExt: M('#e8e6e0', 0.95), cap: M('#37414a', 0.7), base: M('#cfcdc6', 0.95), ground: M('#d9ddda', 1),
    paving: M('#c9c5bc', 0.95), frame: M('#59636c', 0.42, 0.45), sill: M('#e9e8e3', 0.5),
    glass: new THREE.MeshStandardMaterial({ color: '#bcd6e5', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.3, envMapIntensity: 1.8, depthWrite: false }),
    door: M('#c69e70', 0.55), white: M('#f2f2ef', 0.55), wood: M('#c9a376', 0.6), woodDark: M('#8a6644', 0.6), metal: M('#6a737b', 0.4, 0.6),
    chrome: M('#d8dcdf', 0.22, 1), vinylTeal: M('#4a8f99', 0.42), fabricBlue: M('#56729a', 0.9), fabricSlate: M('#5d6b78', 0.9),
    fabricWarm: M('#b98d63', 0.95), fabricMint: M('#8fb8a6', 0.92), plant: M('#5b8f4c', 0.85, 0, { flatShading: true }),
    plantDark: M('#3f7041', 0.85, 0, { flatShading: true }), pot: M('#e9e5de', 0.6), soil: M('#4a3a2c', 1),
    screen: M('#10161c', 0.25, 0.2, { emissive: new THREE.Color('#2b5d8a'), emissiveIntensity: 0.6 }), paper: M('#fbfaf6', 0.9),
    ceramic: M('#f7f7f4', 0.16), rug: M('#d2c4ae', 1), rugInner: M('#c4b59c', 1), red: M('#c0392b', 0.5), blueBin: M('#3f6fa8', 0.55),
    cardboard: M('#c9a679', 0.9), counterTop: M('#e7ebed', 0.32), steel: M('#b9c0c6', 0.28, 0.85), bag: M('#6d8fb4', 0.9),
    trunk: M('#7a5a3c', 0.9), leaf: M('#86b464', 0.85, 0, { flatShading: true }), leaf2: M('#64a05a', 0.85, 0, { flatShading: true }), hedge: M('#6c9d58', 0.9, 0, { flatShading: true }),
    mattress: M('#eef3f6', 0.8), blanket: M('#8fb0cf', 0.9)
  };
  R3.mat.ao = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, alphaMap: R3.tex.ao, depthWrite: false });
}

/* ---------- Geometry helpers ---------- */
function geoCache(key, make) { const c = R3.cache; if (!c[key]) c[key] = make(); return c[key]; }
function roundedBoxGeo(w, h, d, r) {
  return geoCache('rb' + [w, h, d, r].map(v => v.toFixed(3)).join(','), () => {
    const bs = Math.min(r, h * 0.35, w * 0.3, d * 0.3), sw = w - 2 * bs, sd = d - 2 * bs, rr = Math.max(0.001, Math.min(r * 0.6, sw / 2, sd / 2));
    const s = new THREE.Shape(), x = -sw / 2, y = -sd / 2;
    s.moveTo(x + rr, y); s.lineTo(x + sw - rr, y); s.quadraticCurveTo(x + sw, y, x + sw, y + rr); s.lineTo(x + sw, y + sd - rr);
    s.quadraticCurveTo(x + sw, y + sd, x + sw - rr, y + sd); s.lineTo(x + rr, y + sd); s.quadraticCurveTo(x, y + sd, x, y + sd - rr);
    s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.002, h - 2 * bs), bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 3, curveSegments: 5 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bs - h / 2, 0);
    return g;
  });
}
const BOX = () => geoCache('box', () => new THREE.BoxGeometry(1, 1, 1));
function Bx(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(BOX(), mat); m.scale.set(w, h, d); m.position.set(x, y, z); return m; }
function Cy(rt, rb, h, mat, x, y, z, seg) { const m = new THREE.Mesh(geoCache('cy' + [rt, rb, h, seg || 16].join(','), () => new THREE.CylinderGeometry(rt, rb, h, seg || 16)), mat); m.position.set(x, y, z); return m; }
function Rb(w, h, d, r, mat, x, y, z) { const m = new THREE.Mesh(roundedBoxGeo(w, h, d, r), mat); m.position.set(x, y, z); return m; }
function rot(o, x, y, z) { o.rotation.set(x || 0, y || 0, z || 0); return o; }
function Sp(r, mat, x, y, z, detail) { const m = new THREE.Mesh(geoCache('ico' + r + ',' + (detail || 1), () => new THREE.IcosahedronGeometry(r, detail || 1)), mat); m.position.set(x, y, z); return m; }
/* Merge many small meshes into one mesh per material, so a furnished clinic stays fast. */
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] });
    buckets.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    let n = 0;
    for (const g of b.geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of b.geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = !b.mat.transparent; mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
/* Flat quads lying on the floor (x0..x1, y0..y1 in plan metres) with world-space texture coordinates. */
function floorQuads(rects, y, uvSize) {
  const pos = [], nor = [], uv = [];
  for (const r of rects) {
    const xs = [r.x0, r.x1], ys = [r.y0, r.y1];
    const P = [[xs[0], ys[0]], [xs[1], ys[0]], [xs[1], ys[1]], [xs[0], ys[0]], [xs[1], ys[1]], [xs[0], ys[1]]];
    for (const [px, py] of P) {
      pos.push(wx(px), y, wz(py)); nor.push(0, 1, 0);
      if (r.uv) uv.push(...r.uv(px, py)); else uv.push(px / uvSize[0], py / uvSize[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/* ---------- Furniture models (local +z is the front of the item) ---------- */
const FURN = {
  chair(it) {
    const g = new THREE.Group(), m = R3.mat;
    if (it.tone === 'task') {
      g.add(Cy(0.028, 0.028, 0.36, m.metal, 0, 0.23, 0, 10));
      for (let q = 0; q < 5; q++) { const a = q / 5 * Math.PI * 2, l = Bx(0.03, 0.025, 0.27, m.metal, Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13); l.rotation.y = a; g.add(l); }
      g.add(Rb(0.47, 0.08, 0.45, 0.04, m.fabricSlate, 0, 0.46, 0));
      g.add(Rb(0.44, 0.44, 0.07, 0.035, m.fabricSlate, 0, 0.8, -0.2));
      return g;
    }
    const seat = it.tone === 'waiting' ? m.fabricBlue : it.tone === 'cafe' ? m.wood : m.fabricSlate;
    g.add(Rb(0.48, 0.07, 0.46, 0.035, seat, 0, 0.45, 0.01));
    g.add(Rb(0.48, 0.42, 0.06, 0.03, seat, 0, 0.73, -0.21));
    for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) g.add(Cy(0.014, 0.014, 0.42, m.metal, x, 0.21, z, 8));
    return g;
  },
  stool() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Cy(0.2, 0.2, 0.07, m.fabricSlate, 0, 0.55, 0, 20));
    g.add(Cy(0.025, 0.025, 0.48, m.chrome, 0, 0.28, 0, 10));
    for (let q = 0; q < 5; q++) { const a = q / 5 * Math.PI * 2, l = Bx(0.025, 0.025, 0.24, m.metal, Math.sin(a) * 0.12, 0.035, Math.cos(a) * 0.12); l.rotation.y = a; g.add(l); }
    return g;
  },
  examTable() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Rb(0.62, 0.58, 1.5, 0.04, m.white, 0, 0.29, 0.12));
    g.add(Rb(0.72, 0.12, 1.2, 0.05, m.vinylTeal, 0, 0.66, 0.3));
    const back = Rb(0.72, 0.12, 0.66, 0.05, m.vinylTeal, 0, 0.8, -0.5); back.rotation.x = 0.42; g.add(back);
    g.add(Bx(0.5, 0.006, 1.18, m.paper, 0, 0.723, 0.3));
    g.add(Bx(0.36, 0.1, 0.12, m.white, 0, 0.32, 0.93));
    g.add(rot(Cy(0.05, 0.05, 0.56, m.paper, 0, 0.98, -0.83, 14), 0, 0, Math.PI / 2));
    return g;
  },
  casework(it) {
    const g = new THREE.Group(), m = R3.mat, w = it.w, n = Math.max(1, Math.round(w / 0.5));
    g.add(Bx(w, 0.86, 0.57, m.white, 0, 0.43, -0.015));
    g.add(Bx(w + 0.02, 0.04, 0.62, m.counterTop, 0, 0.88, 0));
    for (let q = 1; q < n; q++) g.add(Bx(0.006, 0.76, 0.006, m.metal, -w / 2 + q * w / n, 0.44, 0.27));
    for (let q = 0; q < n; q++) g.add(Bx(0.12, 0.014, 0.014, m.chrome, -w / 2 + (q + 0.5) * w / n, 0.78, 0.28));
    if (it.sink) { g.add(Bx(0.42, 0.02, 0.36, m.steel, w / 2 - 0.42, 0.897, 0.02)); const f = Cy(0.012, 0.012, 0.24, m.chrome, w / 2 - 0.42, 1.0, -0.2, 8); g.add(f); g.add(Bx(0.012, 0.012, 0.14, m.chrome, w / 2 - 0.42, 1.11, -0.14)); }
    if (it.monitor) {
      g.add(Bx(0.5, 0.3, 0.025, m.screen, -w / 2 + 0.45, 1.17, -0.12));
      g.add(Bx(0.05, 0.2, 0.05, m.metal, -w / 2 + 0.45, 0.99, -0.15));
      g.add(Bx(0.42, 0.016, 0.15, m.metal, -w / 2 + 0.45, 0.908, 0.1));
      g.add(Bx(0.22, 0.03, 0.16, m.red, -w / 2 + 0.95, 1.25, -0.26));
    }
    return g;
  },
  workstation(it) {
    const g = new THREE.Group(), m = R3.mat, w = it.w, n = it.seats || 1;
    g.add(Bx(w, 0.035, 0.7, m.wood, 0, 0.74, 0));
    g.add(Bx(0.04, 0.72, 0.62, m.white, -w / 2 + 0.03, 0.36, 0));
    g.add(Bx(0.04, 0.72, 0.62, m.white, w / 2 - 0.03, 0.36, 0));
    g.add(Bx(w - 0.1, 0.42, 0.02, m.white, 0, 0.5, -0.32));
    for (let q = 0; q < n; q++) {
      const x = (q - (n - 1) / 2) * (w / n);
      g.add(Bx(0.54, 0.32, 0.025, m.screen, x, 1.05, -0.2));
      g.add(Bx(0.05, 0.16, 0.05, m.metal, x, 0.84, -0.23));
      g.add(Bx(0.2, 0.012, 0.16, m.metal, x, 0.763, -0.23));
      g.add(Bx(0.42, 0.016, 0.14, m.metal, x, 0.766, 0.08));
      g.add(Bx(0.06, 0.016, 0.1, m.white, x + 0.3, 0.766, 0.1));
    }
    g.add(Bx(0.21, 0.012, 0.3, m.paper, -w / 2 + 0.28, 0.766, 0.08));
    g.add(Cy(0.04, 0.035, 0.09, m.ceramic, w / 2 - 0.24, 0.8, 0.12, 12));
    return g;
  },
  counter(it) {
    const g = new THREE.Group(), m = R3.mat, w = it.w;
    g.add(Bx(w, 1.04, 0.08, m.wood, 0, 0.52, 0.29));
    g.add(Bx(w + 0.06, 0.04, 0.32, m.counterTop, 0, 1.06, 0.25));
    g.add(Bx(w, 0.035, 0.6, m.white, 0, 0.74, 0));
    g.add(Bx(0.04, 0.72, 0.55, m.white, -w / 2 + 0.02, 0.36, -0.02));
    g.add(Bx(0.04, 0.72, 0.55, m.white, w / 2 - 0.02, 0.36, -0.02));
    const mon = Bx(0.5, 0.3, 0.025, m.screen, 0, 1.0, 0.12); g.add(mon);
    g.add(Bx(0.05, 0.14, 0.05, m.metal, 0, 0.82, 0.15));
    g.add(Bx(0.42, 0.016, 0.15, m.metal, 0, 0.766, -0.12));
    g.add(Bx(0.18, 0.05, 0.12, m.metal, w / 2 - 0.35, 0.78, -0.05));
    g.add(Bx(0.08, 0.24, 0.06, m.red, -w / 2 + 0.3, 1.2, 0.25));
    return g;
  },
  sinkCounter(it) {
    const g = new THREE.Group(), m = R3.mat, w = it.w;
    g.add(Bx(w, 0.86, 0.57, m.white, 0, 0.43, -0.015));
    g.add(Bx(w + 0.02, 0.04, 0.62, it.lab ? m.counterTop : m.counterTop, 0, 0.88, 0));
    const n = Math.max(1, Math.round(w / 0.55));
    for (let q = 1; q < n; q++) g.add(Bx(0.006, 0.76, 0.006, m.metal, -w / 2 + q * w / n, 0.44, 0.27));
    if (!it.noSink) { g.add(Bx(0.46, 0.02, 0.38, m.steel, w * 0.25, 0.897, 0.02)); g.add(Cy(0.013, 0.013, 0.26, m.chrome, w * 0.25, 1.01, -0.2, 8)); }
    if (it.lab) {
      const x0 = -w / 2 + 0.35;
      g.add(Cy(0.13, 0.15, 0.18, m.white, x0, 0.99, -0.05, 18));
      g.add(Bx(0.18, 0.05, 0.22, m.metal, x0 + 0.5, 0.925, -0.05));
      g.add(Bx(0.05, 0.28, 0.05, m.metal, x0 + 0.5, 1.07, -0.13));
      g.add(rot(Cy(0.03, 0.04, 0.1, m.metal, x0 + 0.5, 1.12, -0.02, 10), 0.5, 0, 0));
      for (let q = 0; q < 6; q++) g.add(Cy(0.012, 0.012, 0.09, q % 2 ? m.red : m.blueBin, x0 + 0.9 + q * 0.04, 0.95, 0.05, 8));
    }
    return g;
  },
  shelf(it) {
    const g = new THREE.Group(), m = R3.mat, w = it.w, h = it.tall ? 1.85 : 1.2, d = 0.4, rnd = mulberry32(Math.round(it.x * 97 + it.y * 31));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(Bx(0.025, h, 0.025, m.steel, sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02)));
    const levels = it.tall ? [0.12, 0.55, 0.98, 1.41, 1.83] : [0.12, 0.6, 1.18];
    for (const y of levels) g.add(Bx(w, 0.02, d, m.steel, 0, y, 0));
    for (let li = 0; li < levels.length - 1; li++) {
      let x = -w / 2 + 0.06;
      while (x < w / 2 - 0.2) {
        const bw = 0.18 + rnd() * 0.3, bh = 0.14 + rnd() * 0.22, mat = [m.cardboard, m.blueBin, m.white, m.cardboard][(rnd() * 4) | 0];
        if (x + bw > w / 2 - 0.04) break;
        g.add(Bx(bw, Math.min(bh, levels[li + 1] - levels[li] - 0.04), d * (0.7 + rnd() * 0.2), mat, x + bw / 2, levels[li] + 0.01 + Math.min(bh, levels[li + 1] - levels[li] - 0.04) / 2, 0));
        x += bw + 0.04 + rnd() * 0.06;
      }
    }
    return g;
  },
  cabinet(it) {
    const g = new THREE.Group(), m = R3.mat, w = it.w || 1.0;
    g.add(Bx(w, 1.9, 0.44, m.white, 0, 0.95, 0));
    g.add(Bx(0.006, 1.82, 0.006, m.metal, 0, 0.95, 0.222));
    g.add(Bx(w - 0.06, 0.006, 0.006, m.metal, 0, 0.95, 0.222));
    for (const sx of [-1, 1]) { g.add(Bx(0.014, 0.18, 0.02, m.chrome, sx * 0.06, 1.25, 0.235)); g.add(Bx(0.014, 0.12, 0.02, m.chrome, sx * 0.06, 0.75, 0.235)); }
    return g;
  },
  fileCabinet() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Bx(0.5, 1.32, 0.6, m.metal, 0, 0.66, 0));
    for (let q = 0; q < 4; q++) { g.add(Bx(0.44, 0.005, 0.006, m.chrome, 0, 0.33 + q * 0.32, 0.302)); g.add(Bx(0.14, 0.02, 0.02, m.chrome, 0, 0.18 + q * 0.32, 0.31)); }
    return g;
  },
  toilet() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Cy(0.16, 0.12, 0.38, m.ceramic, 0, 0.19, 0.05, 20));
    g.add(Cy(0.19, 0.19, 0.04, m.ceramic, 0, 0.41, 0.06, 22));
    g.add(Rb(0.4, 0.36, 0.17, 0.04, m.ceramic, 0, 0.62, -0.25));
    g.add(rot(Cy(0.016, 0.016, 0.62, m.chrome, 0.42, 0.85, 0.05, 8), Math.PI / 2, 0, 0));
    return g;
  },
  basin() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Rb(0.52, 0.16, 0.42, 0.06, m.ceramic, 0, 0.8, 0));
    g.add(Cy(0.016, 0.016, 0.16, m.chrome, 0, 0.93, -0.15, 8));
    g.add(Bx(0.03, 0.03, 0.1, m.chrome, 0, 1.0, -0.12));
    return g;
  },
  bin() { const g = new THREE.Group(), m = R3.mat; g.add(Cy(0.17, 0.15, 0.42, m.metal, 0, 0.21, 0, 18)); g.add(Cy(0.175, 0.175, 0.03, m.white, 0, 0.43, 0, 18)); return g; },
  hamper() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Bx(0.46, 0.02, 0.46, m.steel, 0, 0.12, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(Cy(0.012, 0.012, 0.86, m.steel, sx * 0.21, 0.5, sz * 0.21, 8));
    g.add(Rb(0.42, 0.62, 0.42, 0.08, m.bag, 0, 0.5, 0));
    return g;
  },
  table() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Rb(1.2, 0.04, 0.8, 0.02, m.wood, 0, 0.74, 0));
    for (const [x, z] of [[-0.54, -0.34], [0.54, -0.34], [-0.54, 0.34], [0.54, 0.34]]) g.add(Cy(0.02, 0.02, 0.72, m.metal, x, 0.36, z, 8));
    g.add(Cy(0.04, 0.035, 0.1, m.ceramic, 0.2, 0.81, 0.1, 12));
    g.add(Sp(0.07, m.plant, -0.3, 0.83, -0.05));
    return g;
  },
  kitchenette(it) {
    const g = new THREE.Group(), m = R3.mat, w = it.w;
    g.add(Bx(w, 0.86, 0.58, m.wood, 0, 0.43, -0.02));
    g.add(Bx(w + 0.02, 0.04, 0.62, m.counterTop, 0, 0.88, 0));
    g.add(Bx(0.46, 0.02, 0.38, m.steel, -w * 0.2, 0.897, 0.02));
    g.add(Cy(0.013, 0.013, 0.26, m.chrome, -w * 0.2, 1.01, -0.2, 8));
    g.add(Bx(0.48, 0.28, 0.36, m.metal, w / 2 - 0.36, 1.04, -0.08));
    g.add(Bx(0.3, 0.18, 0.005, m.screen, w / 2 - 0.4, 1.05, 0.102));
    g.add(Cy(0.08, 0.08, 0.22, m.white, w * 0.15, 1.01, -0.12, 14));
    return g;
  },
  fridge() { const g = new THREE.Group(), m = R3.mat; g.add(Rb(0.6, 1.8, 0.64, 0.03, m.steel, 0, 0.9, 0)); g.add(Bx(0.02, 0.5, 0.03, m.metal, 0.22, 1.25, 0.33)); g.add(Bx(0.58, 0.005, 0.01, m.metal, 0, 1.2, 0.322)); return g; },
  plant(it) {
    const g = new THREE.Group(), m = R3.mat, rnd = mulberry32(Math.round(it.x * 131 + it.y * 17));
    g.add(Cy(0.17, 0.13, 0.36, m.pot, 0, 0.18, 0, 18));
    g.add(Cy(0.155, 0.155, 0.02, m.soil, 0, 0.35, 0, 18));
    for (let q = 0; q < 6; q++) { const a = rnd() * Math.PI * 2, rr = 0.04 + rnd() * 0.1; g.add(Sp(0.12 + rnd() * 0.1, q % 2 ? m.plant : m.plantDark, Math.cos(a) * rr, 0.5 + rnd() * 0.55, Math.sin(a) * rr)); }
    return g;
  },
  rug(it) { const g = new THREE.Group(), m = R3.mat; g.add(Bx(it.w, 0.012, it.d, m.rug, 0, 0.006, 0)); g.add(Bx(it.w - 0.22, 0.013, it.d - 0.22, m.rugInner, 0, 0.007, 0)); return g; },
  drawChair() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Bx(0.5, 0.42, 0.5, m.metal, 0, 0.21, 0));
    g.add(Rb(0.56, 0.1, 0.56, 0.04, m.fabricBlue, 0, 0.47, 0.02));
    g.add(Rb(0.56, 0.62, 0.1, 0.04, m.fabricBlue, 0, 0.82, -0.26));
    for (const sx of [-1, 1]) g.add(Rb(0.1, 0.08, 0.6, 0.03, m.fabricBlue, sx * 0.33, 0.7, 0.05));
    return g;
  },
  procTable() { const g = FURN.examTable(); g.add(Cy(0.02, 0.02, 1.9, m2().chrome, 0.7, 0.95, -0.4, 8)); const lamp = Cy(0.2, 0.24, 0.12, m2().white, 0.45, 1.9, 0, 20); g.add(lamp); return g; },
  cart() { const g = new THREE.Group(), m = R3.mat; g.add(Bx(0.5, 0.75, 0.8, m.white, 0, 0.45, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rot(Cy(0.04, 0.04, 0.03, m.metal, sx * 0.2, 0.04, sz * 0.33, 10), 0, 0, Math.PI / 2)); return g; },
  bed() {
    const g = new THREE.Group(), m = R3.mat;
    g.add(Bx(0.9, 0.08, 2.0, m.metal, 0, 0.4, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.add(Cy(0.025, 0.025, 0.36, m.chrome, sx * 0.38, 0.2, sz * 0.9, 8)); g.add(rot(Cy(0.05, 0.05, 0.04, m.metal, sx * 0.38, 0.04, sz * 0.9, 10), 0, 0, Math.PI / 2)); }
    g.add(Rb(0.9, 0.18, 1.96, 0.06, m.mattress, 0, 0.53, 0));
    g.add(Rb(0.92, 0.07, 1.25, 0.05, m.blanket, 0, 0.63, 0.32));
    g.add(Rb(0.55, 0.12, 0.32, 0.06, m.mattress, 0, 0.68, -0.74));
    g.add(Rb(0.96, 0.62, 0.06, 0.03, m.white, 0, 0.74, -1.02));
    g.add(Rb(0.96, 0.42, 0.06, 0.03, m.white, 0, 0.6, 1.02));
    for (const sx of [-1, 1]) g.add(Bx(0.025, 0.2, 0.9, m.chrome, sx * 0.47, 0.72, -0.35));
    return g;
  },
  desk() { return FURN.workstation({ w: 1.2, seats: 1 }); },
  screen() {
    const g = new THREE.Group(), m = R3.mat;
    for (let q = -1; q <= 1; q++) { const p = new THREE.Group(); p.add(Bx(0.46, 1.6, 0.02, m.fabricMint, 0, 0.95, 0)); p.add(Bx(0.48, 0.03, 0.04, m.chrome, 0, 1.76, 0)); p.add(Bx(0.03, 1.72, 0.04, m.chrome, 0.23, 0.9, 0)); p.position.x = q * 0.47; p.rotation.y = q * 0.25; g.add(p); }
    return g;
  }
};
function m2() { return R3.mat; }
function buildItem(it) {
  const f = FURN[it.kind];
  if (!f) return null;
  const g = f(it);
  g.position.set(wx(it.x), 0, wz(it.y));
  const d = it.kind === 'stool' && it.look ? it.look : it.dir;
  g.rotation.y = yawOf(d.x, d.y);
  return g;
}

/* ---------- Building ---------- */
function floorMatFor(type) {
  const m = R3.mat;
  if (type === 'waiting' || type === 'reception' || type === 'staff_lounge') return [m.floorWood, R3.tex.wood];
  if (type === 'corridor') return [m.floorCorridor, R3.tex.corridor];
  if (type === 'restroom') return [m.floorTile, R3.tex.tile];
  if (type === 'provider_office') return [m.floorCarpet, R3.tex.carpet];
  if (type === 'clean_utility' || type === 'soiled_utility' || type === 'storage') return [m.floorGrey, R3.tex.vinylGrey];
  return [m.floorVinyl, R3.tex.vinyl];
}
function clearRoot() {
  disposeMarkMaterials();
  R3.root.traverse(o => { if (o.geometry && !Object.values(R3.cache).includes(o.geometry)) o.geometry.dispose(); });
  R3.root.clear();
  for (const p of R3.people.values()) R3.root.remove(p.root);
  R3.people.clear();
  R3.hl = null; R3.marks = null; R3.hoverMark = null; R3.hoverKey = null;
}
function buildScene() {
  if (!R3) return;
  clearRoot();
  const P = state.P, m = P.m, g = P.g, T = themeColors();
  R3.groups = {};
  const grp = name => { const o = new THREE.Group(); o.name = name; R3.root.add(o); R3.groups[name] = o; return o; };
  // Sky, ground, base slab, walkway, trees
  R3.scene.background = texFrom(gradientTex([[0, T.sky], [1, T.horizon]], 4, 256, true), 1, 1, false);
  R3.scene.fog = new THREE.Fog(new THREE.Color(T.horizon), 55, 150);
  const site = grp('site');
  R3.mat.ground.color.set(T.ground);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), R3.mat.ground);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.14; ground.receiveShadow = true; site.add(ground);
  const slab = Bx(m.W + 0.5, 0.14, m.D + 0.5, R3.mat.base, 0, -0.07, 0); slab.receiveShadow = true; slab.castShadow = true; site.add(slab);
  const ent = m.doors.find(d => d.isEntrance);
  let walk = null;
  if (ent) {
    const n = inwardDir(ent, m), L = 7, Wd = 2.6;
    const cx = ent.cx - n.x * (L / 2 + 0.25), cy = ent.cy - n.y * (L / 2 + 0.25);
    walk = { x0: cx - (n.x ? L / 2 : Wd / 2), x1: cx + (n.x ? L / 2 : Wd / 2), y0: cy - (n.y ? L / 2 : Wd / 2), y1: cy + (n.y ? L / 2 : Wd / 2) };
    const pv = Bx(walk.x1 - walk.x0, 0.02, walk.y1 - walk.y0, R3.mat.paving, wx((walk.x0 + walk.x1) / 2), -0.13, wz((walk.y0 + walk.y1) / 2)); pv.receiveShadow = true; site.add(pv);
  }
  const trees = new THREE.Group(), rnd = mulberry32(21);
  const spots = [];
  for (let x = 2; x < m.W; x += 5.5) { spots.push([x + rnd(), m.D + 3.2 + rnd()]); spots.push([x + 1.5 + rnd(), -3.4 - rnd()]); }
  for (let y = 1.5; y < m.D; y += 4.5) { spots.push([-3.3 - rnd(), y + rnd()]); spots.push([m.W + 3.3 + rnd(), y + rnd()]); }
  for (const [x, y] of spots) {
    if (walk && x > walk.x0 - 2.2 && x < walk.x1 + 2.2 && y > walk.y0 - 2.2 && y < walk.y1 + 2.2) continue;
    const s = 0.8 + rnd() * 0.5, t = new THREE.Group();
    t.add(Cy(0.07 * s, 0.1 * s, 1.7 * s, R3.mat.trunk, 0, 0.85 * s - 0.14, 0, 8));
    t.add(Sp(0.95 * s, R3.mat.leaf, 0, 2.15 * s, 0, 1));
    t.add(Sp(0.7 * s, R3.mat.leaf2, 0.35 * s, 2.7 * s, 0.15 * s, 1));
    t.add(Sp(0.6 * s, R3.mat.leaf, -0.3 * s, 2.55 * s, -0.25 * s, 1));
    t.position.set(wx(x), 0, wz(y)); t.rotation.y = rnd() * 6;
    trees.add(t);
  }
  site.add(mergeByMaterial(trees));
  // Floors with world-space texture coordinates
  const floorsByMat = new Map();
  for (const r of m.rooms) {
    const [mat, tex] = floorMatFor(r.type);
    if (!floorsByMat.has(mat)) floorsByMat.set(mat, { tex, rects: [] });
    floorsByMat.get(mat).rects.push({ x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h });
  }
  const floors = grp('floors');
  for (const [mat, f] of floorsByMat) { const mesh = new THREE.Mesh(floorQuads(f.rects, 0.003, f.tex.userData.size), mat); mesh.receiveShadow = true; floors.add(mesh); }
  // Zone tint (planning view)
  const zones = grp('zones');
  for (const z of Object.keys(T.zones)) {
    const rects = m.rooms.filter(r => r.zone === z).map(r => ({ x0: r.x + 0.06, x1: r.x + r.w - 0.06, y0: r.y + 0.06, y1: r.y + r.h - 0.06 }));
    if (!rects.length) continue;
    const mesh = new THREE.Mesh(floorQuads(rects, 0.009, [1, 1]), new THREE.MeshBasicMaterial({ color: T.zones[z], transparent: true, opacity: 0.55, depthWrite: false }));
    mesh.renderOrder = 1; zones.add(mesh);
  }
  zones.visible = state.layers.zones;
  R3.walls = extractWalls(m, g);
  R3.gaps = doorGaps(m);
  R3.windows = planWindows(m);
  buildWalls();
  buildFurniture();
  buildRoutes();
  buildHeat();
  buildLabels();
  buildSelection();
  setSun(state.sim ? state.sim.now : 90);
  const big = Math.max(m.W, m.D) / 2 + 7;
  Object.assign(R3.sun.shadow.camera, { left: -big, right: big, top: big, bottom: -big, near: 1, far: 120 });
  R3.sun.shadow.camera.updateProjectionMatrix();
}
function inwardDir(d, m) {
  if (Math.abs(d.cy) < 0.05) return { x: 0, y: 1 };
  if (Math.abs(d.cy - m.D) < 0.05) return { x: 0, y: -1 };
  if (Math.abs(d.cx) < 0.05) return { x: 1, y: 0 };
  return { x: -1, y: 0 };
}
function effectiveWalls() { return state.view === 'orbit' ? state.walls : state.view === 'tour' ? 'cut' : 'full'; }
/* Every wall piece as a box: walls, cut tops, window glass, frames, sills, lintels over doors. Used by the 3D view and the export. */
function wallBoxes(H) {
  const boxes = { wall: [], wallExt: [], cap: [], glass: [], frame: [], sill: [] };
  const put = (key, orient, at, a, b, y0, y1, t, off) => {
    if (b - a < 0.005 || y1 - y0 < 0.005) return;
    const mid = (a + b) / 2, len = b - a, o = off || 0;
    boxes[key].push(orient === 'v' ? { x: at + o, y: mid, sx: t, sz: len, y0, y1 } : { x: mid, y: at + o, sx: len, sz: t, y0, y1 });
  };
  for (const w of R3.walls) {
    const t = w.ext ? 0.24 : 0.12, a = w.from - t / 2, b = w.to + t / 2, key = w.ext ? 'wallExt' : 'wall';
    const wins = w.ext ? R3.windows.filter(q => q.orient === w.orient && Math.abs(q.at - w.at) < 0.05 && q.to > w.from && q.from < w.to).sort((p, q) => p.from - q.from) : [];
    let cur = a;
    for (const q of wins) {
      put(key, w.orient, w.at, cur, q.from, 0, H, t); put('cap', w.orient, w.at, cur, q.from, H, H + 0.02, t + 0.004);
      put(key, w.orient, w.at, q.from, q.to, 0, 0.9, t);
      put('sill', w.orient, w.at, q.from - 0.03, q.to + 0.03, 0.9, 0.93, t + 0.06);
      const top = Math.min(2.1, H);
      if (H > 2.1) { put(key, w.orient, w.at, q.from, q.to, 2.1, H, t); put('cap', w.orient, w.at, q.from, q.to, H, H + 0.02, t + 0.004); }
      put('glass', w.orient, w.at, q.from, q.to, 0.93, top, 0.02);
      put('frame', w.orient, w.at, q.from, q.from + 0.05, 0.9, top, t * 0.6);
      put('frame', w.orient, w.at, q.to - 0.05, q.to, 0.9, top, t * 0.6);
      if (q.to - q.from > 1.2) put('frame', w.orient, w.at, (q.from + q.to) / 2 - 0.02, (q.from + q.to) / 2 + 0.02, 0.9, top, t * 0.5);
      if (H > 2.1) put('frame', w.orient, w.at, q.from, q.to, 2.06, 2.1, t * 0.6);
      cur = q.to;
    }
    put(key, w.orient, w.at, cur, b, 0, H, t);
    put('cap', w.orient, w.at, cur, b, H, H + 0.02, t + 0.004);
  }
  for (const gp of R3.gaps) {
    const ext = gp.isEntrance, t = ext ? 0.24 : 0.12, top = Math.min(2.1, H);
    put('frame', gp.orient, gp.at, gp.from, gp.from + 0.05, 0, top, t + 0.03);
    put('frame', gp.orient, gp.at, gp.to - 0.05, gp.to, 0, top, t + 0.03);
    if (H > 2.1) { put(ext ? 'wallExt' : 'wall', gp.orient, gp.at, gp.from, gp.to, 2.1, H, t); put('cap', gp.orient, gp.at, gp.from, gp.to, H, H + 0.02, t + 0.004); put('frame', gp.orient, gp.at, gp.from, gp.to, 2.06, 2.1, t + 0.03); }
    if (ext) {
      put('glass', gp.orient, gp.at, gp.from + 0.05, (gp.from + gp.to) / 2 - 0.35, 0.02, top - 0.02, 0.03, 0.04);
      put('glass', gp.orient, gp.at, (gp.from + gp.to) / 2 + 0.35, gp.to - 0.05, 0.02, top - 0.02, 0.03, -0.04);
    }
  }
  return boxes;
}
/* Open door leaves, swung into the room (not into the corridor). */
function doorLeaves(H) {
  const out = [], m = state.P.m;
  for (const gp of R3.gaps) {
    if (gp.kind !== 'door' || gp.isEntrance) continue;
    const ra = m.rooms.find(r => r.id === gp.a && r.type !== 'corridor') || m.rooms.find(r => r.id === gp.b && r.type !== 'corridor');
    if (!ra) continue;
    const len = Math.min(0.95, gp.to - gp.from - 0.08), hgt = Math.min(2.04, H - 0.03), th = 1.2;
    let hx, hy, dx, dy;
    if (gp.orient === 'v') { const side = ra.x + ra.w / 2 < gp.at ? -1 : 1; hx = gp.at; hy = gp.from + 0.06; dx = side * Math.sin(th); dy = Math.cos(th); }
    else { const side = ra.y + ra.h / 2 < gp.at ? -1 : 1; hx = gp.from + 0.06; hy = gp.at; dx = Math.cos(th); dy = side * Math.sin(th); }
    out.push({ hx, hy, dx, dy, len, hgt, room: ra.id });
  }
  return out;
}
function buildWalls() {
  if (!R3) return;
  if (R3.groups.walls) { R3.groups.walls.traverse(o => { if (o.geometry && o.geometry !== BOX()) o.geometry.dispose(); }); R3.root.remove(R3.groups.walls); }
  const grp = new THREE.Group(); R3.groups.walls = grp; R3.root.add(grp);
  const m = state.P.m, full = effectiveWalls() === 'full', H = full ? 2.7 : 1.2, mat = R3.mat;
  const boxes = wallBoxes(H);
  const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const key of Object.keys(boxes)) {
    const list = boxes[key];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(BOX(), mat[key], list.length);
    list.forEach((b, i) => { p.set(wx(b.x), (b.y0 + b.y1) / 2, wz(b.y)); s.set(b.sx, b.y1 - b.y0, b.sz); M4.compose(p, q, s); mesh.setMatrixAt(i, M4); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = key !== 'glass'; mesh.receiveShadow = key !== 'glass';
    if (key === 'glass') mesh.renderOrder = 5;
    grp.add(mesh);
  }
  const leaves = new THREE.Group();
  for (const L of doorLeaves(H)) {
    const leaf = new THREE.Mesh(BOX(), mat.door);
    leaf.scale.set(L.len, L.hgt, 0.04);
    leaf.position.set(wx(L.hx + L.dx * L.len / 2), L.hgt / 2 + 0.01, wz(L.hy + L.dy * L.len / 2));
    leaf.rotation.y = Math.atan2(L.dy, L.dx);
    leaves.add(leaf);
    const knob = Cy(0.02, 0.02, 0.12, mat.chrome, 0, 0, 0, 8);
    knob.rotation.x = Math.PI / 2; knob.position.set(wx(L.hx + L.dx * (L.len - 0.07)), 1.0, wz(L.hy + L.dy * (L.len - 0.07)));
    leaves.add(knob);
  }
  grp.add(mergeByMaterial(leaves));
  const strips = [], w0 = 0.34;
  for (const w of R3.walls) {
    const t = (w.ext ? 0.24 : 0.12) / 2;
    const sides = w.ext ? [insideSide(w, m)] : [-1, 1];
    for (const sd of sides) {
      if (w.orient === 'v') {
        const xa = w.at + sd * t, xb = w.at + sd * (t + w0);
        strips.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: w.from, y1: w.to, uv: (px) => [0, Math.abs(px - xa) / w0] });
      } else {
        const ya = w.at + sd * t, yb = w.at + sd * (t + w0);
        strips.push({ x0: w.from, x1: w.to, y0: Math.min(ya, yb), y1: Math.max(ya, yb), uv: (px, py) => [0, Math.abs(py - ya) / w0] });
      }
    }
  }
  const ao = new THREE.Mesh(floorQuads(strips, 0.006, [1, 1]), mat.ao);
  ao.renderOrder = 1;
  grp.add(ao);
}
function insideSide(w, m) {
  if (w.orient === 'v') return w.at < m.W / 2 ? 1 : -1;
  return w.at < m.D / 2 ? 1 : -1;
}
function buildFurniture() {
  if (R3.groups.furniture) { R3.root.remove(R3.groups.furniture); R3.groups.furniture.traverse(o => { if (o.geometry && !Object.values(R3.cache).includes(o.geometry)) o.geometry.dispose(); }); }
  const all = new THREE.Group();
  for (const it of state.P.furn.items) { if (it.placed) continue; const o = buildItem(it); if (o) all.add(o); }
  const merged = mergeByMaterial(all);
  merged.name = 'furniture'; merged.visible = state.layers.furniture;
  R3.root.add(merged); R3.groups.furniture = merged;
  if (R3.groups.placed) R3.root.remove(R3.groups.placed);
  const placed = new THREE.Group(); R3.groups.placed = placed; R3.root.add(placed);
  for (const it of state.placed) {
    const o = buildItem(it);
    if (!o) continue;
    o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    o.userData.item = it; it.obj = o; placed.add(o);
  }
}
function ribbonGeo(polys, hw, y, withJoints) {
  const pos = [], uv = [];
  const v = (x, yy, u, vv) => { pos.push(wx(x), y, wz(yy)); uv.push(u, vv); };
  for (const pts of polys) {
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6, nx = -(b.y - a.y) / L * hw, ny = (b.x - a.x) / L * hw;
      const u0 = acc / 0.75, u1 = (acc + L) / 0.75;
      v(a.x + nx, a.y + ny, u0, 1); v(a.x - nx, a.y - ny, u0, 0); v(b.x + nx, b.y + ny, u1, 1);
      v(b.x + nx, b.y + ny, u1, 1); v(a.x - nx, a.y - ny, u0, 0); v(b.x - nx, b.y - ny, u1, 0);
      acc += L;
    }
    if (withJoints) for (const p of pts) {
      const N = 10;
      for (let q = 0; q < N; q++) {
        const a0 = q / N * Math.PI * 2, a1 = (q + 1) / N * Math.PI * 2;
        v(p.x, p.y, 0.5, 0.5); v(p.x + Math.cos(a0) * hw, p.y + Math.sin(a0) * hw, 0.5, 0.5); v(p.x + Math.cos(a1) * hw, p.y + Math.sin(a1) * hw, 0.5, 0.5);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
function buildRoutes() {
  if (R3.groups.routes) { R3.groups.routes.traverse(o => o.geometry && o.geometry.dispose()); R3.root.remove(R3.groups.routes); }
  const grp = new THREE.Group(); R3.groups.routes = grp; R3.root.add(grp);
  const T = themeColors(), r = state.P.info.routes;
  const sets = { journey: [r.journey.legs, T.accent, 0.11], staff: [r.staff.map(s => s.pts), T.staff, 0.07], egress: [r.egress ? [r.egress.pts] : [], T.egress, 0.1] };
  R3.routeMeshes = {};
  let lift = 0;
  for (const [k, [polys, color, hw]] of Object.entries(sets)) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(ribbonGeo(polys, hw, 0.02 + lift, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    const chev = new THREE.Mesh(ribbonGeo(polys, hw * 0.92, 0.022 + lift, false), new THREE.MeshBasicMaterial({ color, map: R3.tex.chevron, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    base.renderOrder = 3; chev.renderOrder = 4;
    g.add(base); g.add(chev); g.visible = state.routes[k];
    grp.add(g); R3.routeMeshes[k] = g;
    lift += 0.002;
  }
}
function buildHeat() {
  const g = state.P.g;
  R3.heat = { small: makeCanvas(g.nx, g.ny), big: makeCanvas(g.nx * 6, g.ny * 6) };
  R3.heat.tex = texFrom(R3.heat.big, 1, 1, false);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(state.P.m.W, state.P.m.D), new THREE.MeshBasicMaterial({ map: R3.heat.tex, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.014; mesh.renderOrder = 2; mesh.visible = state.layers.traffic;
  R3.root.add(mesh); R3.heat.mesh = mesh;
}
function heatRamp(f) {
  const stops = [[0, [255, 226, 120, 0]], [0.25, [255, 200, 80, 120]], [0.6, [245, 120, 45, 175]], [1, [200, 30, 40, 215]]];
  let k = 1;
  while (k < stops.length - 1 && stops[k][0] < f) k++;
  const [f0, c0] = stops[k - 1], [f1, c1] = stops[k], u = clamp((f - f0) / ((f1 - f0) || 1), 0, 1);
  return c0.map((v, q) => Math.round(v + (c1[q] - v) * u));
}
function paintHeat() {
  if (!R3 || !R3.heat || !state.sim) return;
  const g = state.P.g, h = state.sim.heat, sc = R3.heat.small.getContext('2d'), img = sc.createImageData(g.nx, g.ny);
  let mx = 0;
  for (let c = 0; c < h.length; c++) if (h[c] > mx) mx = h[c];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const v = h[j * g.nx + i], o = ((g.ny - 1 - j) * g.nx + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = mx ? Math.round(Math.sqrt(v / mx) * 255) : 0;
  }
  sc.putImageData(img, 0, 0);
  const bc = R3.heat.big.getContext('2d'), BW = R3.heat.big.width, BH = R3.heat.big.height;
  bc.clearRect(0, 0, BW, BH);
  bc.filter = 'blur(5px)';
  bc.imageSmoothingEnabled = true;
  bc.drawImage(R3.heat.small, 0, 0, BW, BH);
  bc.filter = 'none';
  const big = bc.getImageData(0, 0, BW, BH), d = big.data;
  for (let o = 0; o < d.length; o += 4) { const c = heatRamp(d[o + 3] / 255); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3]; }
  bc.putImageData(big, 0, 0);
  R3.heat.tex.needsUpdate = true;
}
function buildLabels() {
  if (R3.groups.labels) { R3.groups.labels.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); if (o.geometry) o.geometry.dispose(); }); R3.root.remove(R3.groups.labels); }
  const grp = new THREE.Group(); R3.groups.labels = grp; R3.root.add(grp);
  const m = state.P.m;
  for (const r of m.rooms) {
    if (r.type === 'corridor') continue;
    const doors = roomDoors(m, r), main = doors.find(d => !d.isEntrance && d.kind !== 'opening') || doors[0], F = roomFrame(r, main);
    const w = clamp(Math.min(F.U, 3) * 0.86, 1.1, 2.3), h = w * 168 / 512;
    const p = r.type === 'waiting' ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : F.pt(F.doorU, Math.min(0.62, F.V / 2));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: labelTex(r.label, (r.w * r.h).toFixed(1) + ' m²'), transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(wx(p.x), 0.018, wz(p.y)); mesh.renderOrder = 6;
    grp.add(mesh);
  }
  grp.visible = state.layers.labels;
}
function buildSelection() {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 48), new THREE.MeshBasicMaterial({ color: themeColors().accent, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; ring.renderOrder = 7;
  R3.root.add(ring); R3.selRing = ring;
}

/* ---------- People ---------- */
const SKIN = ['#f1c9a8', '#e2ae87', '#c98b64', '#a06c4b', '#7b4f35', '#5b3b29'];
const HAIR = ['#2a1f17', '#4b3426', '#6b4b30', '#a7834f', '#cfcac3', '#161616'];
const SHIRTS = ['#4a6fa5', '#7a9e7e', '#b8692a', '#8d4b6c', '#c9a227', '#5a6670', '#a33c3c', '#3d7a8c', '#7d6aa8', '#d4d0c8'];
const PANTS = ['#2f3a4a', '#3b3b3b', '#5a4a3a', '#2a4a5a', '#4a4a58', '#6b6455'];
function pmat(color) { const k = 'pm' + color; if (!R3.cache[k]) R3.cache[k] = M(color, 0.75); return R3.cache[k]; }
function capsule(r, l, mat, y) { const m = new THREE.Mesh(geoCache('cap' + r + ',' + l, () => new THREE.CapsuleGeometry(r, l, 4, 12)), mat); m.position.y = y; m.castShadow = true; return m; }
function makePerson(a) {
  const rnd = mulberry32(a.id * 977 + 13), skin = pmat(SKIN[(rnd() * SKIN.length) | 0]), hair = pmat(HAIR[(rnd() * HAIR.length) | 0]);
  let top, legs;
  if (a.role === 'nurse') { top = legs = pmat('#2c8c89'); }
  else if (a.role === 'provider') { top = pmat('#f3f5f7'); legs = pmat('#2e3540'); }
  else if (a.role === 'reception') { top = pmat('#3b507d'); legs = pmat('#3a3d44'); }
  else { top = pmat(SHIRTS[(rnd() * SHIRTS.length) | 0]); legs = pmat(PANTS[(rnd() * PANTS.length) | 0]); }
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  body.add(capsule(0.155, 0.3, top, 0.3));
  if (a.role === 'provider') { const coat = new THREE.Mesh(geoCache('coat', () => new THREE.CylinderGeometry(0.17, 0.2, 0.3, 14)), top); coat.position.y = -0.06; coat.castShadow = true; body.add(coat); const st = new THREE.Mesh(geoCache('steth', () => new THREE.TorusGeometry(0.085, 0.008, 6, 20)), pmat('#22262b')); st.position.set(0, 0.55, 0.06); st.rotation.x = 1.25; body.add(st); }
  const neck = new THREE.Mesh(geoCache('neck', () => new THREE.CylinderGeometry(0.042, 0.045, 0.1, 10)), skin); neck.position.y = 0.64; body.add(neck);
  const head = new THREE.Mesh(geoCache('head', () => new THREE.SphereGeometry(0.105, 18, 14)), skin); head.position.y = 0.76; head.castShadow = true; body.add(head);
  const hk = rnd() < 0.5 ? 0 : 1;
  const hairM = new THREE.Mesh(geoCache('hair' + hk, () => new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * (hk ? 0.62 : 0.5))), hair);
  hairM.position.set(0, 0.775, -0.008); hairM.rotation.x = -0.25; body.add(hairM);
  const limb = (x, y, upperMat, lowerMat, isArm) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); body.add(pivot);
    if (isArm) { pivot.add(capsule(0.045, 0.5, upperMat, -0.3)); const hand = new THREE.Mesh(geoCache('hand', () => new THREE.SphereGeometry(0.045, 10, 8)), skin); hand.position.y = -0.6; pivot.add(hand); return { pivot }; }
    pivot.add(capsule(0.066, 0.32, upperMat, -0.22));
    const knee = new THREE.Group(); knee.position.y = -0.44; pivot.add(knee);
    knee.add(capsule(0.055, 0.34, lowerMat, -0.21));
    const shoe = Bx(0.1, 0.06, 0.22, pmat('#23262b'), 0, -0.42, 0.045); shoe.castShadow = true; knee.add(shoe);
    return { pivot, knee };
  };
  const armL = limb(0.205, 0.53, top, top, true), armR = limb(-0.205, 0.53, top, top, true);
  const legL = limb(0.085, 0, legs, legs, false), legR = limb(-0.085, 0, legs, legs, false);
  const badge = new THREE.Mesh(geoCache('badge', () => new THREE.SphereGeometry(0.07, 14, 10)), new THREE.MeshBasicMaterial({ color: '#3bb273' }));
  badge.position.y = 1.02; badge.visible = false; body.add(badge);
  R3.root.add(root);
  const fresh = a.role === 'patient' && state.sim && state.sim.now - a.tArrive < 0.6;
  const start = fresh ? outsidePoint() : a.rest ? { x: a.rest.x, y: a.rest.y } : { x: a.x, y: a.y }, ent = state.P.m.doors.find(d => d.isEntrance), n = ent ? inwardDir(ent, state.P.m) : { x: 0, y: 1 };
  const f0 = a.rest && a.rest.dir ? a.rest.dir : n;
  return { root, body, armL, armR, legL, legR, badge, dx: start.x, dy: start.y, px: start.x, py: start.y, yaw: yawOf(f0.x, f0.y), phase: rnd() * 6, swing: 0, sit: a.rest && a.rest.pose === 'sit' ? 1 : 0 };
}
function outsidePoint() {
  const m = state.P.m, d = m.doors.find(q => q.isEntrance);
  if (!d) return { x: m.W / 2, y: -1.5 };
  const n = inwardDir(d, m);
  return { x: d.cx - n.x * 2.2, y: d.cy - n.y * 2.2 };
}
const WAIT_COLORS = [[5, '#3bb273'], [15, '#e0a21b'], [Infinity, '#d64532']];
function updatePeople(dt) {
  if (!R3 || !state.sim) return;
  const sim = state.sim, t = sim.now, seen = new Set();
  for (const a of sim.agents) {
    if (!a.active && (a.leftAt == null || t - a.leftAt > 1.6 || !R3.people.has(a.id))) continue;
    let p = R3.people.get(a.id);
    if (!p) { p = makePerson(a); R3.people.set(a.id, p); }
    seen.add(a.id);
    const e = posAt(a, t);
    let tx = e.x, ty = e.y, face = null, pose = 'stand', seatH = 0;
    if (!a.active) { const o = outsidePoint(); tx = o.x; ty = o.y; pose = 'walk'; }
    else if (e.moving) { tx += -e.dy * a.lane; ty += e.dx * a.lane; face = { x: e.dx, y: e.dy }; pose = 'walk'; }
    else if (a.rest) { tx = a.rest.x; ty = a.rest.y; face = a.rest.dir; pose = a.rest.pose; seatH = a.rest.h || 0; }
    const k = e.moving && a.active ? 1 : 1 - Math.exp(-dt * 8);
    p.dx += (tx - p.dx) * k; p.dy += (ty - p.dy) * k;
    const vx = (p.dx - p.px) / Math.max(dt, 1e-3), vy = (p.dy - p.py) / Math.max(dt, 1e-3);
    p.px = p.dx; p.py = p.dy;
    const sp = Math.hypot(vx, vy);
    if (!face && sp > 0.08) face = { x: vx / sp, y: vy / sp };
    if (face && (Math.abs(face.x) + Math.abs(face.y)) > 0) p.yaw = lerpAngle(p.yaw, yawOf(face.x, face.y), 1 - Math.exp(-dt * 9));
    const walking = sp > 0.12 && pose !== 'sit';
    const sitTarget = pose === 'sit' && Math.hypot(tx - p.dx, ty - p.dy) < 0.25 ? 1 : 0;
    p.sit += (sitTarget - p.sit) * (1 - Math.exp(-dt * 7));
    p.swing += ((walking ? Math.min(1, sp / 1.1) : 0) - p.swing) * (1 - Math.exp(-dt * 8));
    if (p.swing > 0.01) p.phase += dt * Math.min(40, Math.max(4, sp * 5.2));
    p.root.position.set(wx(p.dx), 0, wz(p.dy));
    p.root.rotation.y = p.yaw;
    const st = 1 - p.sit, s = Math.sin(p.phase) * 0.55 * p.swing;
    p.body.position.y = (0.88 + Math.abs(Math.sin(p.phase)) * 0.025 * p.swing) * st + (seatH + 0.07) * p.sit;
    p.body.position.z = -0.1 * p.sit;
    p.legL.pivot.rotation.x = -s * st - Math.PI / 2 * p.sit;
    p.legR.pivot.rotation.x = s * st - Math.PI / 2 * p.sit;
    p.legL.knee.rotation.x = Math.max(0, Math.sin(p.phase + 1.3)) * 0.75 * p.swing * st + Math.PI / 2 * p.sit;
    p.legR.knee.rotation.x = Math.max(0, Math.sin(p.phase + 1.3 + Math.PI)) * 0.75 * p.swing * st + Math.PI / 2 * p.sit;
    p.armL.pivot.rotation.x = s * 0.85 * st - 0.5 * p.sit;
    p.armR.pivot.rotation.x = -s * 0.85 * st - 0.5 * p.sit;
    p.armL.pivot.rotation.z = 0.06; p.armR.pivot.rotation.z = -0.06;
    const waiting = a.role === 'patient' && a.waitingSince != null && a.active;
    p.badge.visible = state.layers.waits && waiting;
    if (p.badge.visible) { const w = t - a.waitingSince; p.badge.material.color.set(WAIT_COLORS.find(c => w < c[0])[1]); }
  }
  for (const [id, p] of R3.people) if (!seen.has(id)) { R3.root.remove(p.root); R3.people.delete(id); }
}

/* ---------- Cameras: overview (damped orbit), walk, follow a patient ---------- */
const orbit = { cur: { tx: 0, tz: 0, r: 30, theta: -0.5, phi: 0.86 }, goal: { tx: 0, tz: 0, r: 30, theta: -0.5, phi: 0.86 } };
function fitCamera(instant) {
  if (!R3) return;
  const m = state.P.m, t = Math.tan(R3.camera.fov / 2 * Math.PI / 180), asp = Math.max(0.5, R3.camera.aspect || 1.6);
  const r = 1.05 * Math.max((m.W / 2 + 1.5) / (t * asp), (m.D / 2 + 2) / t) + 3;
  Object.assign(orbit.goal, { tx: 0, tz: 0.8, r: clamp(r, 8, 80), theta: -0.5, phi: 0.86 });
  if (instant) Object.assign(orbit.cur, orbit.goal);
}
function applyOrbit(dt) {
  const c = orbit.cur, g = orbit.goal, k = dt === undefined ? 1 : 1 - Math.exp(-dt * (reduceMotion ? 20 : 8));
  for (const key of ['tx', 'tz', 'r', 'theta', 'phi']) c[key] += (g[key] - c[key]) * k;
  const sp = Math.sin(c.phi);
  R3.camera.position.set(c.tx + c.r * sp * Math.sin(c.theta), c.r * Math.cos(c.phi), c.tz + c.r * sp * Math.cos(c.theta));
  R3.camera.lookAt(c.tx, 0.3, c.tz);
}
const walker = { x: 0, y: 0, yaw: 0, pitch: -0.08, keys: new Set(), pad: new Set() };
function startWalk() {
  const g = state.P.g, p = cellXY(g, state.P.info.entranceCell), r = state.P.m.rooms[state.P.info.entK];
  walker.x = p.x; walker.y = p.y; walker.pitch = -0.08;
  walker.yaw = Math.atan2(r.x + r.w / 2 - p.x, r.y + r.h / 2 - p.y);
}
function lineOK(g, x0, y0, x1, y1) {
  let c = cellAt(g, x0, y0);
  const t = cellAt(g, x1, y1);
  if (c < 0 || t < 0) return false;
  for (let guard = 0; c !== t && guard < 8; guard++) {
    const ci = c % g.nx, cj = (c / g.nx) | 0, ti = t % g.nx, tj = (t / g.nx) | 0;
    const n = ti > ci ? c + 1 : ti < ci ? c - 1 : tj > cj ? c + g.nx : c - g.nx;
    if (!stepOK(g, c, n)) return false;
    c = n;
  }
  return c === t;
}
function tryMove(dx, dy) {
  if (!dx && !dy) return;
  const nx = walker.x + dx, ny = walker.y + dy;
  if (lineOK(state.P.g, walker.x, walker.y, nx + Math.sign(dx) * 0.2, ny + Math.sign(dy) * 0.2)) { walker.x = nx; walker.y = ny; }
}
function updateWalk(dt) {
  const k = walker.keys, pd = walker.pad;
  let f = 0, s = 0;
  if (k.has('w') || k.has('arrowup') || pd.has('f')) f += 1;
  if (k.has('s') || k.has('arrowdown') || pd.has('b')) f -= 1;
  if (k.has('d') || pd.has('r')) s += 1;
  if (k.has('a') || pd.has('l')) s -= 1;
  if (k.has('arrowleft') || k.has('q') || pd.has('tl')) walker.yaw -= 1.8 * dt;
  if (k.has('arrowright') || k.has('e') || pd.has('tr')) walker.yaw += 1.8 * dt;
  const sp = 1.7 * dt, fx = Math.sin(walker.yaw), fy = Math.cos(walker.yaw), rx = Math.cos(walker.yaw), ry = -Math.sin(walker.yaw);
  let dx = (fx * f + rx * s) * sp, dy = (fy * f + ry * s) * sp;
  const L = Math.hypot(dx, dy);
  if (L > sp) { dx *= sp / L; dy *= sp / L; }
  tryMove(dx, 0); tryMove(0, dy);
  const cp = Math.cos(walker.pitch);
  R3.camera.position.set(wx(walker.x), 1.62, wz(walker.y));
  R3.camera.lookAt(wx(walker.x + fx * cp), 1.62 + Math.sin(walker.pitch), wz(walker.y + fy * cp));
}
const follow = { cam: null, look: null };
function pickFollow() {
  const sim = state.sim;
  if (!sim) return null;
  const list = sim.agents.filter(a => a.role === 'patient' && a.active);
  if (!list.length) return null;
  list.sort((a, b) => b.tArrive - a.tArrive);
  return list.find(a => a.phase === 'in') || list[0];
}
function patientStatus(a) {
  if (!a) return 'Waiting for the next patient to arrive';
  const room = a.room ? state.P.m.rooms.find(r => r.id === a.room) : null;
  if (a.move) return a.leaving ? 'Heading out' : a.phase === 'out' ? 'Walking to checkout' : room ? 'Walking to ' + room.label : a.seat ? 'Finding a seat' : 'Walking to reception';
  if (a.waitingSince != null) return (room ? 'Waiting in ' + room.label + ' for the provider' : 'Waiting in the lobby') + ', ' + Math.round(state.sim.now - a.waitingSince) + ' min so far';
  if (room) return 'With staff in ' + room.label;
  return a.phase === 'out' ? 'Checking out' : 'Checking in at reception';
}
function updateFollow(dt) {
  const sim = state.sim;
  let a = sim && sim.agents.find(x => x.id === state.followId && x.active);
  if (!a) { a = pickFollow(); state.followId = a ? a.id : null; }
  const p = a && R3.people.get(a.id);
  $('#followChip').textContent = 'Following a patient: ' + patientStatus(a);
  if (!p) { applyOrbit(dt); return; }
  const back = { x: -Math.sin(p.yaw), y: Math.cos(p.yaw) };
  const want = { x: p.dx + back.x * 3.6, y: p.dy + back.y * 3.6 };
  const k = 1 - Math.exp(-dt * 3);
  follow.cam = follow.cam ? { x: follow.cam.x + (want.x - follow.cam.x) * k, y: follow.cam.y + (want.y - follow.cam.y) * k } : want;
  follow.look = follow.look ? { x: follow.look.x + (p.dx - follow.look.x) * k * 2, y: follow.look.y + (p.dy - follow.look.y) * k * 2 } : { x: p.dx, y: p.dy };
  R3.camera.position.set(wx(follow.cam.x), 3.4, wz(follow.cam.y));
  R3.camera.lookAt(wx(follow.look.x), 1.0, wz(follow.look.y));
}
function setView(v) {
  if (v !== 'orbit' && !R3) return;
  const before = effectiveWalls();
  state.view = v;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  $('#walkPad').hidden = !(v === 'walk' && isTouch);
  $('#followChip').hidden = v !== 'follow';
  if (v !== 'tour' && R3) highlightRoom(null);
  if (typeof onViewChange === 'function') onViewChange(v);
  const hintEl = $('#viewHint');
  if (hintEl) hintEl.textContent = v === 'tour' ? 'The camera visits every room. Use the controls below to pause or skip.' : v === 'walk' ? (isTouch ? 'Use the buttons to walk; drag to look around.' : 'W A S D to walk, arrow keys or drag to turn, Esc to go back.') : v === 'follow' ? 'The camera follows one patient through their visit.' : (isTouch ? 'Drag to turn, pinch to zoom, double-tap a room to zoom in.' : 'Drag to turn, scroll to zoom, right-drag to pan, double-click a room to zoom in.');
  if (v === 'walk') startWalk();
  if (v === 'follow') { follow.cam = null; follow.look = null; state.followId = null; if (!state.playing) { state.playing = true; updateTransport(); } }
  if (before !== effectiveWalls()) buildWalls();
}

/* ---------- Pointer: orbit, hover, double-click focus, placing and moving furniture ---------- */
const ray = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
const ndc = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;
function floorPoint(e) {
  const rect = R3.renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, R3.camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  if (Math.abs(d.y) < 1e-6) return null;
  const t = -o.y / d.y;
  if (t < 0) return null;
  return { x: o.x + d.x * t + W2() / 2, y: -(o.z + d.z * t) + D2() / 2, raw: ray };
}
function roomAt(x, y) { return state.P.m.rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); }
function pickPlaced(e) {
  if (!R3.groups.placed || !R3.groups.placed.children.length) return null;
  floorPoint(e);
  const hit = ray.intersectObjects(R3.groups.placed.children, true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o && !o.userData.item) o = o.parent;
  return o ? o.userData.item : null;
}
function bindPointer(el) {
  const pts = new Map();
  let pinch = 0, dragItem = null, moved = 0, lastTap = 0;
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
    moved = 0;
    if (state.view !== 'orbit') return;
    if (state.placing) return;
    const it = e.button === 0 ? pickPlaced(e) : null;
    if (it) { dragItem = it; selectItem(it); }
  });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (state.placing) { moveGhost(e); hideTip(); }
    if (!p) { hover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && state.view === 'orbit') orbit.goal.r = clamp(orbit.goal.r * pinch / d, 5, 90);
      pinch = d; return;
    }
    hideTip();
    if (dragItem) { const fp = floorPoint(e); if (fp) { dragItem.x = Math.round(fp.x * 10) / 10; dragItem.y = Math.round(fp.y * 10) / 10; positionPlaced(dragItem); } return; }
    if (state.view === 'orbit') {
      if (p.b === 2 || p.shift) {
        const s = orbit.goal.r * 0.0016, c = Math.cos(orbit.goal.theta), sn = Math.sin(orbit.goal.theta);
        orbit.goal.tx = clamp(orbit.goal.tx - c * dx * s - sn * dy * s, -W2(), W2());
        orbit.goal.tz = clamp(orbit.goal.tz + sn * dx * s - c * dy * s, -D2(), D2());
      } else { orbit.goal.theta -= dx * 0.006; orbit.goal.phi = clamp(orbit.goal.phi - dy * 0.005, 0.18, 1.42); }
    } else if (state.view === 'walk') { walker.yaw += dx * 0.005; walker.pitch = clamp(walker.pitch - dy * 0.004, -0.9, 0.9); }
  });
  const up = e => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = 0;
    if (dragItem) { const it = dragItem; dragItem = null; commitPlaced(it, 'moved'); return; }
    if (!p || moved > 6) return;
    if (state.placing) { placeAt(e); return; }
    const now = performance.now();
    if (now - lastTap < 320) focusRoomAt(e);
    else if (state.view === 'orbit' && !pickPlaced(e)) { selectItem(null); const fp = floorPoint(e), rr = fp && roomAt(fp.x, fp.y); if (typeof onRoomTap === 'function') onRoomTap(rr || null); }
    lastTap = now;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', e => { pts.delete(e.pointerId); dragItem = null; });
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('wheel', e => { if (state.view !== 'orbit') return; e.preventDefault(); orbit.goal.r = clamp(orbit.goal.r * Math.exp(e.deltaY * 0.0012), 5, 90); }, { passive: false });
}
function focusRoomAt(e) {
  if (state.view !== 'orbit') return;
  const fp = floorPoint(e), r = fp && roomAt(fp.x, fp.y);
  if (!r) return;
  Object.assign(orbit.goal, { tx: wx(r.x + r.w / 2), tz: wz(r.y + r.h / 2), r: clamp(Math.max(r.w, r.h) * 2.4, 6, 18), phi: 0.78 });
}
function hover(e) {
  if (!R3 || state.view !== 'orbit' || state.placing) { hideTip(); return; }
  const fp = floorPoint(e), r = fp && roomAt(fp.x, fp.y), tip = $('#tooltip');
  const hint = typeof onRoomHover === 'function' ? onRoomHover(r || null) : null;
  if (!r) { hideTip(); return; }
  const people = { patient: 0, nurse: 0, provider: 0, reception: 0 };
  for (const [id, p] of R3.people) { const a = state.sim.agents[id]; if (a && a.active && p.dx >= r.x && p.dx <= r.x + r.w && p.dy >= r.y && p.dy <= r.y + r.h) people[a.role]++; }
  const parts = [];
  if (people.patient) parts.push(people.patient + (people.patient === 1 ? ' patient' : ' patients'));
  if (people.nurse) parts.push(people.nurse + (people.nurse === 1 ? ' nurse' : ' nurses'));
  if (people.provider) parts.push(people.provider + (people.provider === 1 ? ' provider' : ' providers'));
  if (people.reception) parts.push('receptionist');
  tip.innerHTML = '<b>' + esc(r.label) + '</b><span>' + (r.w * r.h).toFixed(1) + ' m², ' + r.w.toFixed(1) + ' × ' + r.h.toFixed(1) + ' m</span><span>' + (parts.length ? 'Now: ' + parts.join(', ') : 'Empty right now') + '</span>' + (hint ? '<em class="tip-hint">' + esc(hint) + '</em>' : '');
  const rect = $('#view3dBody').getBoundingClientRect();
  tip.style.transform = 'translate(' + Math.round(e.clientX - rect.left + 14) + 'px,' + Math.round(e.clientY - rect.top + 14) + 'px)';
  tip.hidden = false;
}
function hideTip() { const t = $('#tooltip'); if (t) t.hidden = true; if (R3 && R3.hoverMark) setHoverMark(null); }

/* Placing furniture: preview follows the cursor, click to place, drag to move, R to rotate, Delete to remove. */
const DIRS = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];
function startPlacing(kind) {
  if (!R3) return;
  if (state.view !== 'orbit') setView('orbit');
  state.placing = kind; state.ghostRot = 0;
  document.querySelectorAll('[data-place]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === kind)));
  if (R3.ghost) R3.root.remove(R3.ghost);
  const it = Object.assign({ kind, x: 0, y: 0, dir: DIRS[0], w: ITEM_SIZE[kind][0], d: ITEM_SIZE[kind][1] }, kind === 'cabinet' ? { w: 1.0 } : {});
  const g = buildItem(it);
  g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; } });
  g.visible = false;
  R3.ghost = g; R3.ghostItem = it; R3.root.add(g);
  $('#placeHint').hidden = false;
}
function stopPlacing() {
  state.placing = null;
  document.querySelectorAll('[data-place]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  if (R3 && R3.ghost) { R3.root.remove(R3.ghost); R3.ghost = null; }
  $('#placeHint').hidden = true;
}
function moveGhost(e) {
  const fp = floorPoint(e);
  if (!fp || !R3.ghost) return;
  const it = R3.ghostItem;
  it.x = Math.round(fp.x * 10) / 10; it.y = Math.round(fp.y * 10) / 10; it.dir = DIRS[state.ghostRot];
  R3.ghost.position.set(wx(it.x), 0, wz(it.y)); R3.ghost.rotation.y = yawOf(it.dir.x, it.dir.y);
  R3.ghost.visible = !!roomAt(it.x, it.y);
}
function placeAt(e) {
  moveGhost(e);
  const g = R3.ghostItem;
  const r = roomAt(g.x, g.y);
  if (!r) { toast('Place furniture inside a room.'); return; }
  const it = { kind: g.kind, x: g.x, y: g.y, dir: g.dir, w: g.w, d: g.d, block: true, placed: true, room: state.P.m.rooms.indexOf(r) };
  const R = itemRect(it);
  if (R.x0 < r.x - 0.02 || R.x1 > r.x + r.w + 0.02 || R.y0 < r.y - 0.02 || R.y1 > r.y + r.h + 0.02) { toast('That doesn’t fit inside ' + r.label + '. Try rotating it with R.'); return; }
  state.placed.push(it);
  stopPlacing();
  commitPlaced(it, 'added');
}
function positionPlaced(it) {
  if (!it.obj) return;
  it.obj.position.set(wx(it.x), 0, wz(it.y)); it.obj.rotation.y = yawOf(it.dir.x, it.dir.y);
  if (state.selected === it && R3.selRing) R3.selRing.position.set(wx(it.x), 0.03, wz(it.y));
}
function selectItem(it) {
  state.selected = it;
  if (!R3) return;
  if (R3.selRing) {
    R3.selRing.visible = !!it;
    if (it) { const s = Math.max(it.w, it.d) / 1.1; R3.selRing.scale.set(s, s, s); R3.selRing.position.set(wx(it.x), 0.03, wz(it.y)); }
  }
  $('#selectionTools').hidden = !it;
  if (it) $('#selectionName').textContent = PLACE_NAMES[it.kind] || it.kind;
}
const PLACE_NAMES = { bed: 'Hospital bed', chair: 'Chair', desk: 'Desk', plant: 'Plant', cabinet: 'Cabinet', screen: 'Privacy screen' };
/* Re-run the walkable grid with the placed furniture; refuse changes that would block a doorway or an exam room. */
function blocksDoor(it) {
  if (it.kind === 'plant' || it.kind === 'chair') return false;
  const R = itemRect(it), m = state.P.m;
  return m.rooms.some(r => R.x0 < r.x + r.w && R.x1 > r.x && R.y0 < r.y + r.h && R.y1 > r.y && roomDoors(m, r).some(d => rectsOverlap(doorZone(d, r), R, -0.05)));
}
function commitPlaced(it, how) {
  const prevInfo = state.P.info;
  if (how !== 'removed' && blocksDoor(it)) {
    if (how === 'added') { state.placed = state.placed.filter(x => x !== it); buildFurniture(); selectItem(null); }
    else { if (it._prev) Object.assign(it, it._prev); buildFurniture(); selectItem(it); }
    toast('Keep doorways clear: that spot is right in front of a door.');
    return;
  }
  let P2;
  try { P2 = preparePlan(state.json, state.placed); } catch (err) { P2 = null; }
  const ok = P2 && P2.info.exams.length >= prevInfo.exams.length && P2.info.unreachableRooms.length <= prevInfo.unreachableRooms.length && P2.info.seats.length > 0;
  if (!ok) {
    if (how === 'added') state.placed = state.placed.filter(x => x !== it);
    else if (how === 'removed') state.placed.push(it);
    else if (it._prev) Object.assign(it, it._prev);
    buildFurniture(); selectItem(how === 'added' ? null : it);
    toast('That spot would block the way through a door or into a room, so it was put back.');
    return;
  }
  it._prev = { x: it.x, y: it.y, dir: it.dir };
  state.P = P2;
  buildFurniture(); buildRoutes(); updateRouteText();
  if (how !== 'removed') { const fresh = state.placed.find(x => x === it); if (fresh) selectItem(fresh); } else selectItem(null);
  resetSim(state.sim ? Math.min(state.sim.now, 90) : 0);
  toast(PLACE_NAMES[it.kind] + ' ' + how + '. Walking routes now go around it, and the day restarted.');
  if (typeof afterFurnitureChange === 'function') afterFurnitureChange(it, how);
}
function rotateSelected() {
  const it = state.selected;
  if (state.placing) { state.ghostRot = (state.ghostRot + 1) % 4; if (R3.ghostItem) { R3.ghostItem.dir = DIRS[state.ghostRot]; R3.ghost.rotation.y = yawOf(R3.ghostItem.dir.x, R3.ghostItem.dir.y); } return; }
  if (!it) return;
  it._prev = { x: it.x, y: it.y, dir: it.dir };
  const i = DIRS.findIndex(d => d.x === it.dir.x && d.y === it.dir.y);
  it.dir = DIRS[(i + 1) % 4];
  positionPlaced(it); commitPlaced(it, 'rotated');
}
function removeSelected() {
  const it = state.selected;
  if (!it) return;
  state.placed = state.placed.filter(x => x !== it);
  selectItem(null);
  commitPlaced(it, 'removed');
}

/* ---------- Guided tour: the camera visits every room in visit order ---------- */
const tour = { stops: [], i: 0, phase: 'idle', t: 0, from: null, to: null, playing: false, dwell: 6.5, moveTime: 2.4, look: null };
function stopPose(stop) {
  const m = state.P.m, d = m.doors.find(q => q.isEntrance), n = d ? inwardDir(d, m) : { x: 0, y: 1 };
  if (stop.kind === 'entrance') return { pos: { x: d.cx - n.x * 9.5, h: 4.4, y: d.cy - n.y * 9.5 }, tgt: { x: d.cx + n.x * 1.2, h: 0.9, y: d.cy + n.y * 1.2 } };
  if (stop.kind === 'exit') {
    const t = Math.tan(R3.camera.fov / 2 * Math.PI / 180), asp = Math.max(0.5, R3.camera.aspect || 1.6);
    const r = 1.05 * Math.max((m.W / 2 + 1.5) / (t * asp), (m.D / 2 + 2) / t) + 3, th = -0.5, ph = 0.86;
    return { pos: { x: m.W / 2 - (r * Math.sin(ph) * Math.sin(th)), h: r * Math.cos(ph), y: m.D / 2 - 0.8 - r * Math.sin(ph) * Math.cos(th), raw: true, rx: r * Math.sin(ph) * Math.sin(th), rz: 0.8 + r * Math.sin(ph) * Math.cos(th) }, tgt: { x: m.W / 2, h: 0.3, y: m.D / 2 - 0.8 } };
  }
  const r = stop.room, doors = roomDoors(m, r), main = doors.find(q => !q.isEntrance && q.kind !== 'opening') || doors[0];
  const F = roomFrame(r, main), out = F.dir(0, -1), c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const dist = clamp(Math.max(r.w, r.h) * 1.3 + 3.2, 5.8, 15);
  return { pos: { x: c.x + out.x * dist * 0.62, h: dist * 0.82, y: c.y + out.y * dist * 0.62 }, tgt: { x: c.x, h: 0.4, y: c.y } };
}
function poseVec(p) {
  if (p.raw) return new THREE.Vector3(p.rx, p.h, p.rz);
  return new THREE.Vector3(wx(p.x), p.h, wz(p.y));
}
function startTour(index) {
  if (!R3 || !state.P) return;
  tour.stops = tourStops(state.P);
  tour.i = clamp(index || 0, 0, tour.stops.length - 1);
  tour.look = new THREE.Vector3(orbit.cur.tx, 0.3, orbit.cur.tz);
  tour.playing = true;
  setView('tour');
  beginTourMove();
}
function beginTourMove() {
  const st = tour.stops[tour.i], p = stopPose(st);
  tour.from = { pos: R3.camera.position.clone(), tgt: (tour.look || new THREE.Vector3()).clone() };
  tour.to = { pos: poseVec(p.pos), tgt: new THREE.Vector3(wx(p.tgt.x), p.tgt.h, wz(p.tgt.y)) };
  tour.phase = 'move'; tour.t = 0;
  highlightRoom(st.room || null);
  if (typeof onTourStop === 'function') onTourStop(tour.i, tour.stops.length, st);
}
function updateTour(dt) {
  if (!tour.from) return;
  const cam = R3.camera;
  if (tour.phase === 'move') {
    tour.t += dt / (reduceMotion ? 0.05 : tour.moveTime);
    const u = clamp(tour.t, 0, 1), k = u * u * (3 - 2 * u);
    cam.position.lerpVectors(tour.from.pos, tour.to.pos, k);
    tour.look = tour.look || new THREE.Vector3();
    tour.look.lerpVectors(tour.from.tgt, tour.to.tgt, k);
    cam.lookAt(tour.look);
    if (u >= 1) { tour.phase = 'dwell'; tour.t = 0; }
  } else {
    tour.t += dt;
    const a = reduceMotion ? 0 : Math.sin(tour.t * 0.4) * 0.06, base = tour.to.pos.clone().sub(tour.to.tgt);
    base.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    cam.position.copy(tour.to.tgt).add(base);
    cam.lookAt(tour.to.tgt);
    tour.look = tour.to.tgt.clone();
    if (tour.playing && tour.t >= tour.dwell) nextTourStop();
  }
}
function nextTourStop() { if (tour.i < tour.stops.length - 1) { tour.i++; beginTourMove(); } else { tour.playing = false; if (typeof onTourStop === 'function') onTourStop(tour.i, tour.stops.length, tour.stops[tour.i], true); } }
function prevTourStop() { if (tour.i > 0) { tour.i--; beginTourMove(); } }
function syncOrbitFromCamera() {
  const t = tour.look || new THREE.Vector3(orbit.cur.tx, 0.3, orbit.cur.tz), c = R3.camera.position;
  const dx = c.x - t.x, dy = c.y, dz = c.z - t.z, r = Math.max(5, Math.hypot(dx, dy, dz));
  Object.assign(orbit.cur, { tx: t.x, tz: t.z, r, phi: Math.acos(clamp(dy / r, -1, 1)), theta: Math.atan2(dx, dz) });
  Object.assign(orbit.goal, orbit.cur);
}
function endTour() { tour.playing = false; tour.phase = 'idle'; if (R3) syncOrbitFromCamera(); setView('orbit'); }
function highlightRoom(r) {
  if (!R3) return;
  if (!R3.hl) {
    const g = new THREE.Group(), accent = themeColors().accent;
    const mat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.95, depthWrite: false });
    const edges = [];
    for (let i = 0; i < 4; i++) { const e = new THREE.Mesh(BOX(), mat); e.renderOrder = 8; g.add(e); edges.push(e); }
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.14, depthWrite: false }));
    tint.rotation.x = -Math.PI / 2; tint.renderOrder = 7; g.add(tint);
    R3.root.add(g); R3.hl = g; R3.hlParts = { edges, tint };
  }
  if (!r) { R3.hl.visible = false; return; }
  const [n, s, w, e] = R3.hlParts.edges, tint = R3.hlParts.tint, cx = wx(r.x + r.w / 2), cz = wz(r.y + r.h / 2), th = 0.07, y = 0.035;
  n.scale.set(r.w, 0.02, th); n.position.set(cx, y, wz(r.y + r.h) + th / 2);
  s.scale.set(r.w, 0.02, th); s.position.set(cx, y, wz(r.y) - th / 2);
  w.scale.set(th, 0.02, r.h); w.position.set(wx(r.x) + th / 2, y, cz);
  e.scale.set(th, 0.02, r.h); e.position.set(wx(r.x + r.w) - th / 2, y, cz);
  tint.scale.set(r.w - 0.1, r.h - 0.1, 1); tint.position.set(cx, 0.016, cz);
  R3.hl.visible = true;
}
function focusRoom(r) {
  if (!R3 || !r) return;
  if (state.view !== 'orbit') { if (state.view === 'tour') endTour(); else setView('orbit'); }
  Object.assign(orbit.goal, { tx: wx(r.x + r.w / 2), tz: wz(r.y + r.h / 2), r: clamp(Math.max(r.w, r.h) * 2.4, 6, 18), phi: 0.8 });
  highlightRoom(r);
}

/* ---------- Room marks: rooms picked while editing, and the room under the pointer ---------- */
function markLabel(num, text, color) {
  const fs = 30, h = 54, pad = 16, c = document.createElement('canvas'), m = c.getContext('2d');
  const font = '700 ' + fs + 'px "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif';
  m.font = font;
  const tw = Math.ceil(m.measureText(text).width), circle = num ? h - 12 : 0, w = pad + (num ? circle + 10 : 0) + tw + pad, dpr = 2;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const rr = h / 2;
  g.beginPath(); g.moveTo(rr, 0); g.lineTo(w - rr, 0); g.arc(w - rr, rr, rr, -Math.PI / 2, Math.PI / 2); g.lineTo(rr, h); g.arc(rr, rr, rr, Math.PI / 2, Math.PI * 1.5); g.closePath();
  g.fillStyle = color; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
  let x = pad;
  if (num) {
    g.beginPath(); g.arc(x + circle / 2 - 4, h / 2, circle / 2, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, x + circle / 2 - 4, h / 2 + 1);
    x += circle + 6;
  }
  g.fillStyle = '#fff'; g.font = font; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}
function buildMark(r, color, num, text, hover) {
  const g = new THREE.Group(), cx = wx(r.x + r.w / 2), cz = wz(r.y + r.h / 2), col = new THREE.Color(color);
  const basic = op => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false });
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.2, r.w - 0.14), Math.max(0.2, r.h - 0.14)), basic(hover ? 0.18 : 0.32));
  tint.rotation.x = -Math.PI / 2; tint.position.set(cx, 0.022, cz); tint.renderOrder = 7; g.add(tint);
  const H = effectiveWalls() === 'full' ? 2.62 : 1.14;
  if (!hover) {
    const vol = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, r.w - 0.18), H, Math.max(0.2, r.h - 0.18)), basic(0.1));
    vol.position.set(cx, H / 2 + 0.02, cz); vol.renderOrder = 6; g.add(vol);
  }
  const edgeMat = basic(hover ? 0.7 : 1);
  for (const [y, th, hh] of hover ? [[0.045, 0.08, 0.05]] : [[0.05, 0.14, 0.07], [H + 0.03, 0.06, 0.04]]) {
    const bars = [
      [r.w, th, cx, wz(r.y + r.h) + th / 2], [r.w, th, cx, wz(r.y) - th / 2],
      [th, r.h, wx(r.x) + th / 2, cz], [th, r.h, wx(r.x + r.w) - th / 2, cz]
    ];
    for (const [sx, sz, x, z] of bars) { const b = new THREE.Mesh(BOX(), edgeMat); b.scale.set(sx, hh, sz); b.position.set(x, y, z); b.renderOrder = 8; g.add(b); }
  }
  if (text) {
    const L = markLabel(num, text, color);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: L.tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    sp.scale.set(0.05 * L.aspect, 0.05, 1); sp.center.set(0.5, 0); sp.position.set(cx, H + 0.35, cz); sp.renderOrder = 30;
    g.add(sp);
  }
  g.userData = { tint, hover };
  return g;
}
function disposeMark(g) {
  if (!g) return;
  if (g.parent) g.parent.remove(g);
  g.traverse(o => {
    if (o.geometry && o.geometry !== BOX()) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
}
function disposeMarkMaterials() {
  if (!R3) return;
  if (R3.marks) for (const g of R3.marks.values()) disposeMark(g);
  if (R3.hoverMark) disposeMark(R3.hoverMark);
}
/* marks: [{ id, color, num, text }] */
function setRoomMarks(list) {
  if (!R3 || !state.P) return;
  if (!R3.marks) R3.marks = new Map();
  const want = new Map(list.map(m => [m.id + '|' + m.color + '|' + (m.num || '') + '|' + m.text + '|' + effectiveWalls(), m]));
  for (const [k, g] of R3.marks) if (!want.has(k)) { disposeMark(g); R3.marks.delete(k); }
  for (const [k, m] of want) {
    if (R3.marks.has(k)) continue;
    const r = state.P.m.rooms.find(q => q.id === m.id);
    if (!r) continue;
    const g = buildMark(r, m.color, m.num, m.text, false);
    R3.root.add(g); R3.marks.set(k, g);
  }
}
function setHoverMark(r, color) {
  if (!R3) return;
  const key = r ? r.id + '|' + color + '|' + effectiveWalls() : null;
  if (R3.hoverKey === key) return;
  if (R3.hoverMark) { disposeMark(R3.hoverMark); R3.hoverMark = null; }
  R3.hoverKey = key;
  if (r && state.P) { R3.hoverMark = buildMark(r, color, null, null, true); R3.root.add(R3.hoverMark); }
}
function pulseMarks(ts) {
  if (!R3 || !R3.marks || !R3.marks.size) return;
  const k = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(ts / 280);
  for (const g of R3.marks.values()) g.userData.tint.material.opacity = 0.24 + 0.18 * k;
}
