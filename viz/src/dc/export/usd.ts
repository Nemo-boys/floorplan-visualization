/* OpenUSD (.usda) export for NVIDIA Omniverse and any USD tool. One prim per room floor, the same walls the
   3D view draws, and one PointInstancer per kind of equipment (thousands of racks stay light), with every
   number the app knows kept as custom attributes: ids, labels, kW, capacity, power path, row, room.
   Metres, Y up, the site centred on the origin, the same frame as the 3D view. */
import { fmtPower } from '../engine/brief';
import type { CostReport } from '../engine/cost';
import { WALL_H_MM, wallBoxes } from '../engine/walls';
import type { Design, Equip, EquipKind, RoomType } from '../engine/types';

const COLOR: Record<EquipKind, [number, number, number]> = {
  rack: [0.1, 0.1, 0.11],
  cdu: [0.08, 0.66, 0.66],
  crah: [0.85, 0.87, 0.9],
  pdu: [0.23, 0.24, 0.25],
  ups: [0.91, 0.59, 0.05],
  battery: [0.17, 0.18, 0.2],
  switchgear: [0.72, 0.75, 0.77],
  generator: [0.37, 0.36, 0.9],
  transformer: [0.56, 0.58, 0.61],
  drycooler: [0.25, 0.7, 0.9]
};
const FLOOR: Partial<Record<RoomType, [number, number, number]>> = {
  data_hall: [0.95, 0.96, 0.98],
  ups_room: [0.96, 0.94, 0.9],
  battery_room: [0.96, 0.94, 0.9],
  electrical_room: [0.96, 0.94, 0.9],
  mechanical_room: [0.93, 0.95, 0.95],
  generator_yard: [0.85, 0.85, 0.84],
  cooling_yard: [0.85, 0.85, 0.84]
};
const FACING: Record<string, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const v3 = (a: number, b: number, c: number) => `(${f(a)}, ${f(b)}, ${f(c)})`;
const str = (s: string) => JSON.stringify(s);
const ident = (s: string) => {
  const t = s.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[0-9]/.test(t) ? `_${t}` : t;
};

export function toUsda(d: Design, cost?: CostReport): string {
  const cx = d.site.w / 2;
  const cy = d.site.h / 2;
  const X = (x: number) => (x - cx) / 1000;
  const Z = (y: number) => -(y - cy) / 1000;
  const out: string[] = [];
  const p = (s: string) => out.push(s);

  p('#usda 1.0');
  p('(');
  p('    defaultPrim = "Site"');
  p('    metersPerUnit = 1');
  p('    upAxis = "Y"');
  p(`    doc = ${str(`${d.title} data center, ${fmtPower(d.itKw)} IT. Exported from Data Center Studio (Floorplan Intelligence).`)}`);
  p(')');
  p('');
  p('def Xform "Site" (');
  p('    kind = "assembly"');
  p(')');
  p('{');
  p(`    custom string dc:title = ${str(d.title)}`);
  p(`    custom string dc:hardware = ${str(d.profile.hardware)}`);
  p(`    custom string dc:cooling = ${str(d.profile.key)}`);
  p(`    custom double dc:itKw = ${d.itKw}`);
  p(`    custom int dc:racks = ${d.racks}`);
  p(`    custom double dc:rackKw = ${d.profile.kw}`);
  p(`    custom string dc:coolingRedundancy = ${str(d.basis.coolingRedundancy)}`);
  p(`    custom string dc:powerRedundancy = ${str(d.basis.powerRedundancy)}`);
  if (cost) {
    p(`    custom double dc:pue = ${f(cost.pue)}`);
    p(`    custom double dc:buildCostUsd = ${Math.round(cost.facility)}`);
    p(`    custom double dc:itCostUsd = ${Math.round(cost.it)}`);
    p(`    custom double dc:opexPerYearUsd = ${Math.round(cost.opexYear)}`);
  }
  p('');

  // materials
  p('    def Scope "Looks"');
  p('    {');
  const material = (name: string, c: [number, number, number], rough = 0.6, metal = 0.1) => {
    p(`        def Material "${name}"`);
    p('        {');
    p(`            token outputs:surface.connect = </Site/Looks/${name}/Surface.outputs:surface>`);
    p('            def Shader "Surface"');
    p('            {');
    p('                uniform token info:id = "UsdPreviewSurface"');
    p(`                color3f inputs:diffuseColor = ${v3(...c)}`);
    p(`                float inputs:roughness = ${rough}`);
    p(`                float inputs:metallic = ${metal}`);
    p('                token outputs:surface');
    p('            }');
    p('        }');
  };
  (Object.keys(COLOR) as EquipKind[]).forEach((k) => material(k, COLOR[k], 0.5, k === 'rack' ? 0.4 : 0.2));
  material('wall', [0.98, 0.98, 0.98], 0.85, 0);
  material('floor', [0.93, 0.93, 0.94], 0.8, 0);
  p('    }');
  p('');

  // rooms: a thin floor slab each, with what the room is
  p('    def Xform "Rooms"');
  p('    {');
  d.rooms.forEach((r) => {
    const c = FLOOR[r.type] ?? [0.94, 0.94, 0.95];
    p(`        def Cube ${str(ident(r.id))} (`);
    p('            prepend apiSchemas = ["MaterialBindingAPI"]');
    p('        )');
    p('        {');
    p('            double size = 1');
    p(`            double3 xformOp:translate = ${v3(X(r.x + r.w / 2), r.outdoor ? -0.04 : 0.04, Z(r.y + r.h / 2))}`);
    p(`            float3 xformOp:scale = ${v3(r.w / 1000, 0.08, r.h / 1000)}`);
    p('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]');
    p(`            color3f[] primvars:displayColor = [${v3(...c)}]`);
    p('            rel material:binding = </Site/Looks/floor>');
    p(`            custom string dc:id = ${str(r.id)}`);
    p(`            custom string dc:type = ${str(r.type)}`);
    p(`            custom string dc:name = ${str(r.name)}`);
    p(`            custom bool dc:outdoor = ${r.outdoor ? 1 : 0}`);
    p(`            custom double dc:areaM2 = ${f((r.w * r.h) / 1e6)}`);
    p('        }');
  });
  p('    }');
  p('');

  // walls, the same runs the 3D view builds, plus lintels over the doors
  const walls = wallBoxes(d);
  p('    def Xform "Walls"');
  p('    {');
  walls.forEach((b, i) => {
    const horizontal = b.h === 0;
    const len = (horizontal ? b.w : b.h) + b.t;
    const x = horizontal ? b.x + b.w / 2 : b.x;
    const y = horizontal ? b.y : b.y + b.h / 2;
    p(`        def Cube "wall_${i}" (`);
    p('            prepend apiSchemas = ["MaterialBindingAPI"]');
    p('        )');
    p('        {');
    p('            double size = 1');
    p(`            double3 xformOp:translate = ${v3(X(x), WALL_H_MM / 2000, Z(y))}`);
    p(`            float3 xformOp:scale = ${v3((horizontal ? len : b.t) / 1000, WALL_H_MM / 1000, (horizontal ? b.t : len) / 1000)}`);
    p('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]');
    p('            rel material:binding = </Site/Looks/wall>');
    p('        }');
  });
  p('    }');
  p('');

  // doors as data: where they are and what they join
  p('    def Scope "Doors"');
  p('    {');
  d.doors.forEach((dr) => {
    p(`        def Xform ${str(ident(dr.id))}`);
    p('        {');
    p(`            double3 xformOp:translate = ${v3(X(dr.x), 0, Z(dr.y))}`);
    p('            uniform token[] xformOpOrder = ["xformOp:translate"]');
    p(`            custom string[] dc:joins = [${dr.rooms.map(str).join(', ')}]`);
    p(`            custom double dc:widthM = ${f(dr.width / 1000)}`);
    p('        }');
  });
  p('    }');
  p('');

  // equipment: a PointInstancer per kind
  p('    def Xform "Equipment"');
  p('    {');
  const groups = new Map<EquipKind, Equip[]>();
  d.equipment.forEach((e) => {
    if (!groups.has(e.kind)) groups.set(e.kind, []);
    groups.get(e.kind)!.push(e);
  });
  groups.forEach((list, kind) => {
    const pos: string[] = [];
    const rot: string[] = [];
    const scl: string[] = [];
    list.forEach((e) => {
      const along = e.facing === 'E' || e.facing === 'W';
      const lift = kind === 'drycooler' ? 0.6 : 0.08;
      pos.push(v3(X(e.x + e.w / 2), lift + e.height / 2000, Z(e.y + e.h / 2)));
      const a = FACING[e.facing] / 2;
      rot.push(`(${f(Math.cos(a))}, 0, ${f(Math.sin(a))}, 0)`);
      scl.push(v3((along ? e.h : e.w) / 1000, e.height / 1000, (along ? e.w : e.h) / 1000));
    });
    p(`        def PointInstancer "${kind}"`);
    p('        {');
    p(`            point3f[] positions = [${pos.join(', ')}]`);
    p(`            quath[] orientations = [${rot.join(', ')}]`);
    p(`            float3[] scales = [${scl.join(', ')}]`);
    p(`            int[] protoIndices = [${list.map(() => 0).join(', ')}]`);
    p(`            rel prototypes = </Site/Equipment/${kind}/Prototypes/unit>`);
    p(`            custom string[] dc:ids = [${list.map((e) => str(e.id)).join(', ')}]`);
    p(`            custom string[] dc:labels = [${list.map((e) => str(e.label)).join(', ')}]`);
    p(`            custom string[] dc:rooms = [${list.map((e) => str(e.room)).join(', ')}]`);
    p(`            custom string[] dc:facing = [${list.map((e) => str(e.facing)).join(', ')}]`);
    if (list.some((e) => e.kw)) p(`            custom double[] dc:kw = [${list.map((e) => e.kw ?? 0).join(', ')}]`);
    if (list.some((e) => e.capacityKw)) p(`            custom double[] dc:capacityKw = [${list.map((e) => e.capacityKw ?? 0).join(', ')}]`);
    if (list.some((e) => e.side)) p(`            custom string[] dc:powerPath = [${list.map((e) => str(e.side ?? '')).join(', ')}]`);
    if (list.some((e) => e.row)) p(`            custom string[] dc:row = [${list.map((e) => str(e.row ?? '')).join(', ')}]`);
    p('            def Scope "Prototypes"');
    p('            {');
    p('                def Cube "unit" (');
    p('                    prepend apiSchemas = ["MaterialBindingAPI"]');
    p('                )');
    p('                {');
    p('                    double size = 1');
    p(`                    color3f[] primvars:displayColor = [${v3(...COLOR[kind])}]`);
    p(`                    rel material:binding = </Site/Looks/${kind}>`);
    p('                }');
    p('            }');
    p('        }');
  });
  p('    }');
  p('}');
  return out.join('\n') + '\n';
}

/* Everything the app knows about one option, as JSON: the full design (rooms, doors, every part, rows,
   aisles), the checks, the cost report and the basis. Nothing is dropped, so it can round-trip. */
export function toJson(o: { design: Design; cost: CostReport; checks: unknown[] }, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'datacenter-studio/v1', exported: new Date().toISOString(), ...extra, design: o.design, cost: o.cost, checks: o.checks }, null, 1);
}

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
