/* ---------- Export: GLB model for Blender, plan.json, 2D SVG, Blender script and a Claude skill, bundled as a .zip ---------- */
export interface ExportMaterial {
  name: string;
  color: number[];
  alpha: number;
  metallic: number;
  roughness: number;
}
export interface ExportPrimitive {
  positions: Float32Array;
  normals: Float32Array;
  material: number;
}
export interface ExportNode {
  name: string;
  mesh?: number;
  children?: number[];
}
export interface ExportModel {
  materials: ExportMaterial[];
  meshes: { name: string; primitives: ExportPrimitive[] }[];
  nodes: ExportNode[];
  roots: number[];
}
/* glTF 2.0 binary writer. model = { materials:[{name,color:[r,g,b],alpha,metallic,roughness}], meshes:[{name,primitives:[{positions,normals,material}]}], nodes:[{name,mesh?,children?}], roots:[i] } */
export function writeGLB(model: ExportModel): Uint8Array {
  const chunks: Uint8Array[] = [],
    bufferViews: { buffer: number; byteOffset: number; byteLength: number; target: number }[] = [],
    accessors: Record<string, unknown>[] = [];
  let offset = 0;
  const addView = (arr: Float32Array): number => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      offset += pad;
    }
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target: 34962 });
    chunks.push(bytes);
    offset += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const meshes = model.meshes.map(me => ({
    name: me.name,
    primitives: me.primitives
      .filter(p => p.positions.length >= 9)
      .map(p => {
        const n = p.positions.length / 3,
          min = [Infinity, Infinity, Infinity],
          max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < p.positions.length; i += 3)
          for (let k = 0; k < 3; k++) {
            const v = p.positions[i + k];
            if (v < min[k]) min[k] = v;
            if (v > max[k]) max[k] = v;
          }
        accessors.push({ bufferView: addView(p.positions), componentType: 5126, count: n, type: 'VEC3', min, max });
        const pa = accessors.length - 1;
        accessors.push({ bufferView: addView(p.normals), componentType: 5126, count: n, type: 'VEC3' });
        return { attributes: { POSITION: pa, NORMAL: accessors.length - 1 }, material: p.material, mode: 4 };
      })
  }));
  const materials = model.materials.map(mt =>
    Object.assign(
      {
        name: mt.name,
        pbrMetallicRoughness: {
          baseColorFactor: [mt.color[0], mt.color[1], mt.color[2], mt.alpha],
          metallicFactor: mt.metallic,
          roughnessFactor: mt.roughness
        }
      },
      mt.alpha < 1 ? { alphaMode: 'BLEND', doubleSided: true } : {}
    )
  );
  const nodes = model.nodes.map(nd => {
    const o: ExportNode = { name: nd.name };
    if (nd.mesh != null) o.mesh = nd.mesh;
    if (nd.children && nd.children.length) o.children = nd.children;
    return o;
  });
  const json = {
    asset: { version: '2.0', generator: 'Floorplan Intelligence' },
    scene: 0,
    scenes: [{ name: 'Clinic', nodes: model.roots }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }]
  };
  const binLen = offset + ((4 - (offset % 4)) % 4),
    bin = new Uint8Array(binLen);
  let o = 0;
  for (const c of chunks) {
    bin.set(c, o);
    o += c.byteLength;
  }
  const jraw = new TextEncoder().encode(JSON.stringify(json)),
    jlen = jraw.length + ((4 - (jraw.length % 4)) % 4),
    jb = new Uint8Array(jlen).fill(0x20);
  jb.set(jraw);
  const total = 12 + 8 + jlen + 8 + binLen,
    out = new Uint8Array(total),
    dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jlen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20);
  dv.setUint32(20 + jlen, binLen, true);
  dv.setUint32(24 + jlen, 0x004e4942, true);
  out.set(bin, 28 + jlen);
  return out;
}
