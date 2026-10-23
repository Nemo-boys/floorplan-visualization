/* ---------- Export: GLB model for Blender, plan.json, 2D SVG, Blender script and a Claude skill, bundled as a .zip ---------- */
/* glTF 2.0 binary writer. model = { materials:[{name,color:[r,g,b],alpha,metallic,roughness}], meshes:[{name,primitives:[{positions,normals,material}]}], nodes:[{name,mesh?,children?}], roots:[i] } */
function writeGLB(model) {
  const chunks = [], bufferViews = [], accessors = [];
  let offset = 0;
  const addView = arr => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target: 34962 });
    chunks.push(bytes); offset += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const meshes = model.meshes.map(me => ({
    name: me.name,
    primitives: me.primitives.filter(p => p.positions.length >= 9).map(p => {
      const n = p.positions.length / 3, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = p.positions[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
      accessors.push({ bufferView: addView(p.positions), componentType: 5126, count: n, type: 'VEC3', min, max });
      const pa = accessors.length - 1;
      accessors.push({ bufferView: addView(p.normals), componentType: 5126, count: n, type: 'VEC3' });
      return { attributes: { POSITION: pa, NORMAL: accessors.length - 1 }, material: p.material, mode: 4 };
    })
  }));
  const materials = model.materials.map(mt => Object.assign({
    name: mt.name,
    pbrMetallicRoughness: { baseColorFactor: [mt.color[0], mt.color[1], mt.color[2], mt.alpha], metallicFactor: mt.metallic, roughnessFactor: mt.roughness }
  }, mt.alpha < 1 ? { alphaMode: 'BLEND', doubleSided: true } : {}));
  const nodes = model.nodes.map(nd => { const o = { name: nd.name }; if (nd.mesh != null) o.mesh = nd.mesh; if (nd.children && nd.children.length) o.children = nd.children; return o; });
  const json = {
    asset: { version: '2.0', generator: 'Floorplan Intelligence' },
    scene: 0, scenes: [{ name: 'Clinic', nodes: model.roots }], nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength: offset }]
  };
  const binLen = offset + ((4 - (offset % 4)) % 4), bin = new Uint8Array(binLen);
  let o = 0;
  for (const c of chunks) { bin.set(c, o); o += c.byteLength; }
  const jraw = new TextEncoder().encode(JSON.stringify(json)), jlen = jraw.length + ((4 - (jraw.length % 4)) % 4), jb = new Uint8Array(jlen).fill(0x20);
  jb.set(jraw);
  const total = 12 + 8 + jlen + 8 + binLen, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jlen, true); dv.setUint32(16, 0x4E4F534A, true); out.set(jb, 20);
  dv.setUint32(20 + jlen, binLen, true); dv.setUint32(24 + jlen, 0x004E4942, true); out.set(bin, 28 + jlen);
  return out;
}
/* Uncompressed ZIP with UTF-8 names. */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files, when) {
  const enc = new TextEncoder(), d = when || new Date(), parts = [], central = [];
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const f of files) {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, name = enc.encode(f.name), crc = crc32(data);
    const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    lh.set(name, 30); parts.push(lh, data);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); ch.set(name, 46);
    central.push(ch); offset += lh.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
function concatF32(list) { let n = 0; for (const a of list) n += a.length; const out = new Float32Array(n); let o = 0; for (const a of list) { out.set(a, o); o += a.length; } return out; }
const FLOOR_EXPORT = { wood: '#c9a57a', vinyl: '#e6ece8', grey: '#dcdfe0', corridor: '#e4e1da', tile: '#e3eaee', carpet: '#b7ab99' };
const ITEM_NAMES = { chair: 'Chair', examTable: 'Exam table', stool: 'Stool', casework: 'Cabinets and sink', workstation: 'Workstation', counter: 'Reception counter', sinkCounter: 'Counter', shelf: 'Shelving', toilet: 'Toilet', basin: 'Basin', table: 'Table', kitchenette: 'Kitchenette', fridge: 'Fridge', plant: 'Plant', rug: 'Rug', cabinet: 'Cabinet', drawChair: 'Blood-draw chair', bin: 'Bin', bed: 'Hospital bed', screen: 'Privacy screen', fileCabinet: 'File cabinet', hamper: 'Linen hamper', procTable: 'Procedure table', cart: 'Cart', desk: 'Desk' };
/* Builds the export model from the same plan, walls and furniture the 3D view uses. Each room becomes a group named after it. */
function buildExportModel() {
  const P = state.P, m = P.m, mats = [], matIdx = new Map(), meshes = [], nodes = [];
  const matOf = (mat, override) => {
    const c = override ? new THREE.Color(override) : mat.color, alpha = mat.transparent ? (mat.opacity == null ? 1 : mat.opacity) : 1;
    const metal = mat.metalness || 0, rough = mat.roughness == null ? 0.8 : mat.roughness;
    const key = [c.r, c.g, c.b, alpha, metal, rough].map(v => v.toFixed(3)).join('|');
    if (!matIdx.has(key)) { matIdx.set(key, mats.length); mats.push({ name: 'Material ' + (mats.length + 1), color: [c.r, c.g, c.b], alpha, metallic: metal, roughness: rough }); }
    return matIdx.get(key);
  };
  const prims = (obj, override) => {
    obj.updateMatrixWorld(true);
    const by = new Map();
    obj.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const mi = matOf(o.material, override);
      if (!by.has(mi)) by.set(mi, []);
      by.get(mi).push(g);
    });
    const out = [...by.entries()].map(([mi, gs]) => ({ positions: concatF32(gs.map(g => g.attributes.position.array)), normals: concatF32(gs.map(g => g.attributes.normal.array)), material: mi }));
    by.forEach(gs => gs.forEach(g => g.dispose()));
    return out;
  };
  const node = (name, extra) => { nodes.push(Object.assign({ name, children: [] }, extra || {})); return nodes.length - 1; };
  const meshNode = (name, obj, override) => { const pr = prims(obj, override); if (!pr.length) return null; meshes.push({ name, primitives: pr }); return node(name, { mesh: meshes.length - 1 }); };
  const root = node('Clinic');
  const roomNodes = m.rooms.map(r => { const n = node(r.label); nodes[root].children.push(n); return n; });
  m.rooms.forEach((r, k) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.02, r.h), R3.mat.white);
    g.position.set(wx(r.x + r.w / 2), 0.01, wz(r.y + r.h / 2));
    const kind = floorMatFor(r.type)[1], key = Object.keys(R3.tex).find(t => R3.tex[t] === kind) || 'vinyl';
    const fc = { wood: FLOOR_EXPORT.wood, vinyl: FLOOR_EXPORT.vinyl, vinylGrey: FLOOR_EXPORT.grey, corridor: FLOOR_EXPORT.corridor, tile: FLOOR_EXPORT.tile, carpet: FLOOR_EXPORT.carpet }[key] || FLOOR_EXPORT.vinyl;
    const n = meshNode(r.label + ' floor', g, fc);
    if (n != null) nodes[roomNodes[k]].children.push(n);
    g.geometry.dispose();
  });
  const counts = {};
  for (const it of P.furn.items) {
    const o = buildItem(it);
    if (!o) continue;
    const base = ITEM_NAMES[it.kind] || it.kind, key = it.room + ':' + base;
    counts[key] = (counts[key] || 0) + 1;
    const n = meshNode(base + ' ' + counts[key], o);
    if (n != null) nodes[roomNodes[it.room] != null ? roomNodes[it.room] : root].children.push(n);
  }
  const H = 2.7, boxes = wallBoxes(H), wallGroup = new THREE.Group();
  for (const key of Object.keys(boxes)) for (const b of boxes[key]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.sx, b.y1 - b.y0, b.sz), R3.mat[key]);
    mesh.position.set(wx(b.x), (b.y0 + b.y1) / 2, wz(b.y));
    wallGroup.add(mesh);
  }
  const wn = meshNode('Walls, windows and frames', wallGroup);
  if (wn != null) nodes[root].children.push(wn);
  wallGroup.traverse(o => o.geometry && o.geometry.dispose());
  const doorGroup = new THREE.Group();
  for (const L of doorLeaves(H)) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(L.len, L.hgt, 0.04), R3.mat.door);
    leaf.position.set(wx(L.hx + L.dx * L.len / 2), L.hgt / 2 + 0.01, wz(L.hy + L.dy * L.len / 2));
    leaf.rotation.y = Math.atan2(L.dy, L.dx);
    doorGroup.add(leaf);
  }
  const dn = meshNode('Doors', doorGroup);
  if (dn != null) nodes[root].children.push(dn);
  doorGroup.traverse(o => o.geometry && o.geometry.dispose());
  for (const nd of nodes) if (!nd.children.length) delete nd.children;
  return { materials: mats, meshes, nodes, roots: [root] };
}
function blenderScript(name) {
  return [
    '"""Build ' + name + ' in Blender from clinic.glb (exported by Floorplan Intelligence).',
    '',
    'Inside Blender: Scripting tab, open this file, then Run Script.',
    'From a terminal:  blender --background --python build_in_blender.py -- clinic.glb clinic.blend',
    '"""',
    'import os',
    'import sys',
    'import bpy',
    '',
    'args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []',
    'folder = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()',
    'glb_path = os.path.abspath(args[0]) if args else os.path.join(folder, "clinic.glb")',
    'blend_path = os.path.abspath(args[1]) if len(args) > 1 else os.path.join(folder, "clinic.blend")',
    '',
    'if bpy.app.background:',
    '    bpy.ops.wm.read_factory_settings(use_empty=True)',
    '',
    'before = set(bpy.data.objects)',
    'bpy.ops.import_scene.gltf(filepath=glb_path)',
    'imported = [o for o in bpy.data.objects if o not in before]',
    '',
    '# One collection per room, named after the room, so each room can be hidden or edited on its own.',
    'clinic = next((o for o in imported if o.parent is None and o.name.startswith("Clinic")), None)',
    'if clinic is not None:',
    '    for group in list(clinic.children):',
    '        col = bpy.data.collections.new(group.name)',
    '        bpy.context.scene.collection.children.link(col)',
    '        for obj in [group] + list(group.children_recursive):',
    '            for c in list(obj.users_collection):',
    '                c.objects.unlink(obj)',
    '            col.objects.link(obj)',
    '',
    '# A sun and a camera so the file renders straight away.',
    'sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", type="SUN"))',
    'sun.data.energy = 3.0',
    'sun.rotation_euler = (0.8, 0.2, 0.6)',
    'bpy.context.scene.collection.objects.link(sun)',
    'cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))',
    'cam.location = (16.0, -24.0, 22.0)',
    'cam.rotation_euler = (0.92, 0.0, 0.59)',
    'bpy.context.scene.collection.objects.link(cam)',
    'bpy.context.scene.camera = cam',
    '',
    'if bpy.app.background:',
    '    bpy.ops.wm.save_as_mainfile(filepath=blend_path)',
    '    print("Saved " + blend_path)',
    'else:',
    '    print("Imported the clinic. Save it with File > Save As.")',
    ''
  ].join('\n');
}
function skillMd() {
  return [
    '---',
    'name: floorplan-to-blender',
    'description: Turns a Floorplan Intelligence export (clinic.glb plus build_in_blender.py) into a Blender file, and can add the export to the user\'s repository. Use when the user wants a .blend file or render of an exported floor plan, or wants to commit an export.',
    '---',
    '',
    '# Floor plan export to Blender',
    '',
    'The export folder contains `clinic.glb` (the 3D model), `plan.json` (the plan data), `plan.svg` (the 2D plan) and `build_in_blender.py`.',
    '',
    '## Build the Blender file',
    '1. Check that Blender is installed: `blender --version`. If it is missing, tell the user and stop.',
    '2. From the export folder, run: `blender --background --python build_in_blender.py -- clinic.glb clinic.blend`',
    '3. Confirm `clinic.blend` exists and tell the user that each room is its own collection.',
    '',
    '## Add the export to the repository',
    '1. Copy the export folder to `design/exports/<plan name>-v<version>/`. If that folder exists, ask before overwriting.',
    '2. Commit with the message `Add <plan name> export, version <version>`.',
    ''
  ].join('\n');
}
function readmeMd(name, version, when) {
  return [
    '# ' + name + ', version ' + version,
    '',
    'Exported from Floorplan Intelligence on ' + when + '.',
    '',
    '| File | What it is |',
    '|---|---|',
    '| `clinic.glb` | 3D model: floors, walls, windows, doors and furniture. Each room is a group named after the room. |',
    '| `plan.json` | The plan data (plan.json v0.1), with room names as edited and any furniture you added. |',
    '| `plan.svg` | The 2D floor plan. |',
    '| `build_in_blender.py` | Builds a Blender file with one collection per room. |',
    '| `claude-skill/floorplan-to-blender/SKILL.md` | A Claude skill that runs the Blender build or adds this export to your repository. |',
    '',
    '## Open it in Blender',
    '- Quickest: File > Import > glTF 2.0, then pick `clinic.glb`.',
    '- With one collection per room: `blender --background --python build_in_blender.py -- clinic.glb clinic.blend`',
    ''
  ].join('\n');
}
