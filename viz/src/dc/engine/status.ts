/* What still works when things fail. Plain capacity arithmetic over the power and cooling paths, so every
   status can be explained in one sentence ("the 3 remaining coolers carry 2,400 kW; the hall needs 2,112 kW").

   Statuses, per rack:
     ok        running, and it would survive one more failure
     risk      running, but with no backup left (or above the comfortable temperature)
     down      off, or overheating */
import type { Design, Equip } from './types';

export type Health = 'ok' | 'risk' | 'down';

export interface Conditions {
  failed: ReadonlySet<string>; // equipment ids, plus 'utility_A' / 'utility_B'
  load: number; // IT load as a share of design (1 = every rack at its rated kW)
  outdoorC: number; // outdoor temperature; outdoor coolers lose capacity above DESIGN_AMBIENT_C
}

/* Outdoor coolers are rated at this air temperature (a typical design day); hotter air costs 3% per degree. */
export const DESIGN_AMBIENT_C = 38;
export const coolerDerate = (outdoorC: number): number =>
  outdoorC > DESIGN_AMBIENT_C ? Math.max(0.5, 1 - (outdoorC - DESIGN_AMBIENT_C) * 0.03) : 1;

export const NORMAL: Conditions = { failed: new Set(), load: 1, outdoorC: 25 };

export interface PoolReport {
  id: string; // e.g. 'h1_liquid', 'power_A', 'generators'
  label: string;
  loadKw: number;
  capacityKw: number; // live capacity
  spareKw: number; // capacity left if the largest live unit also failed
  health: Health;
  sentence: string;
}

export interface Report {
  racks: Map<string, Health>;
  equipment: Map<string, Health>; // the units themselves: failed units are 'down'
  pools: PoolReport[];
  headline: Health;
  sentence: string; // one plain-language line for the whole site
  rowsAtRisk: number;
  rowsDown: number;
}

const worst = (a: Health, b: Health): Health => (a === 'down' || b === 'down' ? 'down' : a === 'risk' || b === 'risk' ? 'risk' : 'ok');
const kw = (n: number) => `${Math.round(n).toLocaleString('en-US')} kW`;

function pool(
  id: string,
  label: string,
  loadKw: number,
  units: Equip[],
  failed: ReadonlySet<string>,
  derate = 1
): PoolReport {
  const live = units.filter((u) => !failed.has(u.id));
  const caps = live.map((u) => (u.capacityKw ?? 0) * derate);
  const capacityKw = caps.reduce((a, b) => a + b, 0);
  const spareKw = capacityKw - Math.max(0, ...caps);
  let health: Health = 'ok';
  let sentence: string;
  if (loadKw <= 0) sentence = `${label}: no load.`;
  else if (capacityKw + 1e-6 < loadKw) {
    health = 'down';
    sentence = `${label}: ${live.length} of ${units.length} working carry ${kw(capacityKw)}, but ${kw(loadKw)} is needed.`;
  } else if (spareKw + 1e-6 < loadKw) {
    health = 'risk';
    sentence = `${label}: enough for now (${kw(capacityKw)} for ${kw(loadKw)}), but no backup left.`;
  } else sentence = `${label}: ${kw(capacityKw)} for ${kw(loadKw)}, with a spare.`;
  return { id, label, loadKw, capacityKw, spareKw, health, sentence };
}

export function evaluate(d: Design, c: Conditions = NORMAL): Report {
  const failed = c.failed;
  const byId = new Map(d.equipment.map((e) => [e.id, e]));
  const of = (kind: Equip['kind'], room?: string) =>
    d.equipment.filter((e) => e.kind === kind && (room === undefined || e.room === room));
  const racks = new Map<string, Health>();
  const equipment = new Map<string, Health>();
  const pools: PoolReport[] = [];
  d.equipment.forEach((e) => equipment.set(e.id, failed.has(e.id) ? 'down' : 'ok'));

  const live = (id: string) => !failed.has(id);
  const rackKw = (r: Equip) => (r.kw ?? 0) * c.load;
  const itLoad = of('rack').reduce((a, r) => a + rackKw(r), 0);
  const overhead = d.profile.liquidShare > 0.5 ? 1.12 : d.profile.liquidShare > 0 ? 1.2 : 1.35;

  // ---- Power: utility (or generators) -> switchgear -> UPS -> PDU -> rack, per side.
  const sides = d.basis.powerRedundancy === '2N' ? (['A', 'B'] as const) : (['A'] as const);
  const gens = of('generator');
  const utilityUp = (s: 'A' | 'B') => live(`utility_${s}`) && live(`tx_${s}`);
  const anyUtilityLost = sides.some((s) => !utilityUp(s));
  let genPool: PoolReport | null = null;
  if (anyUtilityLost) {
    const lostLoad = sides.filter((s) => !utilityUp(s)).length / sides.length;
    const need = sides.length === 2 && lostLoad < 1 ? 0 : itLoad * overhead;
    genPool = pool('generators', 'Generators', need, gens, failed);
    if (need > 0) pools.push(genPool);
  }
  const sideUp = new Map<string, boolean>();
  const sidePools = new Map<string, PoolReport>();
  const sideCap = new Map<string, number>();
  sides.forEach((s) => {
    const source = utilityUp(s) || (genPool !== null && genPool.health !== 'down' && genPool.loadKw > 0);
    const swgs = of('switchgear').filter((u) => u.side === s);
    const swg = swgs.length > 0 && swgs.every((u) => live(u.id));
    const ups = of('ups').filter((u) => u.side === s);
    const p = pool(`power_${s}`, sides.length > 1 ? `Power train ${s}` : 'Power train', itLoad, ups, failed);
    if (!source || !swg) {
      p.capacityKw = 0;
      p.health = 'down';
      p.sentence = `${p.label}: off (${!swg ? 'its switchgear failed' : 'no utility power and the generators can’t carry it'}).`;
    }
    sideCap.set(s, p.capacityKw);
    sidePools.set(s, p);
    sideUp.set(s, p.capacityKw > 0);
    pools.push(p);
  });
  if (sides.length === 2) {
    // 2N: the trains share the load; each one alone must be able to carry all of it.
    const total = sideCap.get('A')! + sideCap.get('B')!;
    sides.forEach((s) => {
      const p = sidePools.get(s)!;
      const other = s === 'A' ? 'B' : 'A';
      const alone = p.capacityKw + 1e-6 >= itLoad;
      p.loadKw = sideUp.get(other) ? itLoad / 2 : itLoad;
      if (total + 1e-6 < itLoad) {
        p.health = 'down';
        p.sentence = `${p.label}: both trains together carry ${kw(total)}, but ${kw(itLoad)} is needed.`;
      } else if (p.capacityKw === 0) {
        p.health = 'risk';
        p.sentence = `${p.label}: off. Train ${other} is carrying everything alone, with no backup left.`;
      } else if (!alone) {
        p.health = 'risk';
        p.sentence = `${p.label}: ${kw(p.capacityKw)} left, not enough to carry the site alone if train ${other} fails.`;
      } else if (!sideUp.get(other)) {
        p.health = 'risk';
        p.sentence = `${p.label}: carrying everything alone (${kw(p.capacityKw)} for ${kw(itLoad)}), no backup left.`;
      } else {
        p.health = 'ok';
        p.sentence = `${p.label}: ${kw(p.capacityKw)}, enough to carry the whole site alone; train ${other} is its backup.`;
      }
    });
  }

  // ---- Cooling per hall: liquid loop (CDUs) and air (CRAHs). Outdoor coolers reject both.
  const halls = d.rooms.filter((r) => r.type === 'data_hall' && d.rows.some((row) => row.hall === r.id));
  const dry = of('drycooler');
  const heatTotal = itLoad * 1.1;
  const yard = pool('outdoor', 'Outdoor coolers', heatTotal, dry, failed, coolerDerate(c.outdoorC));
  pools.push(yard);
  const hallCool = new Map<string, { liquid: PoolReport | null; air: PoolReport | null }>();
  halls.forEach((h, i) => {
    const hallRacks = of('rack', h.id);
    const heat = hallRacks.reduce((a, r) => a + rackKw(r), 0);
    const cdus = of('cdu', h.id);
    const crahs = of('crah', h.id);
    const tag = halls.length > 1 ? ` (hall ${i + 1})` : '';
    const liquid = cdus.length ? pool(`${h.id}_liquid`, `Liquid coolers${tag}`, heat * d.profile.liquidShare, cdus, failed) : null;
    const air = crahs.length ? pool(`${h.id}_air`, `Air handlers${tag}`, heat * (1 - d.profile.liquidShare), crahs, failed) : null;
    if (liquid) pools.push(liquid);
    if (air) pools.push(air);
    hallCool.set(h.id, { liquid, air });
  });

  // ---- Rack by rack.
  let rowsAtRisk = 0;
  let rowsDown = 0;
  d.rows.forEach((row) => {
    // power: a rack needs at least one live side whose PDU is live
    const feeds = row.pdus.map((id) => byId.get(id)!).map((p) => ({ side: p.side!, up: live(p.id) && !!sideUp.get(p.side!) }));
    const upFeeds = feeds.filter((f) => f.up).length;
    let power: Health = upFeeds === 0 ? 'down' : upFeeds < feeds.length ? 'risk' : 'ok';
    if (sides.length === 2 && sidePools.get('A')!.health === 'down') power = 'down';
    if (power === 'ok') feeds.forEach((f) => (power = worst(power, sidePools.get(f.side)!.health === 'risk' ? 'risk' : 'ok')));
    const cool = hallCool.get(row.hall);
    let cooling: Health = yard.health;
    if (cool?.liquid) cooling = worst(cooling, cool.liquid.health);
    if (cool?.air) cooling = worst(cooling, cool.air.health);
    const h = worst(power, cooling);
    row.racks.forEach((id) => racks.set(id, h));
    if (h === 'risk') rowsAtRisk++;
    if (h === 'down') rowsDown++;
  });

  // Units that run but carry the site past its backup are 'risk'.
  pools.forEach((p) => {
    if (p.health === 'ok') return;
    const ids =
      p.id === 'outdoor'
        ? dry.map((u) => u.id)
        : p.id === 'generators'
          ? gens.map((u) => u.id)
          : p.id.startsWith('power_')
            ? of('ups').filter((u) => u.side === p.id.slice(-1)).map((u) => u.id)
            : d.equipment.filter((e) => e.room === p.id.replace(/_(liquid|air)$/, '') && e.kind === (p.id.endsWith('_liquid') ? 'cdu' : 'crah')).map((e) => e.id);
    ids.forEach((id) => {
      if (!failed.has(id)) equipment.set(id, p.health === 'down' ? 'down' : 'risk');
    });
  });

  const headline: Health = pools.reduce<Health>((a, p) => worst(a, p.health), 'ok');
  const failedCount = [...failed].filter((id) => byId.has(id) || id.startsWith('utility_')).length;
  let sentence: string;
  if (headline === 'ok')
    sentence = failedCount
      ? 'Everything keeps running, and there is still a spare for the next failure.'
      : 'Everything is running normally, with backup to spare.';
  else if (headline === 'risk')
    sentence = `Still running, but ${rowsAtRisk === d.rows.length ? 'every row has' : `${rowsAtRisk} of ${d.rows.length} rows have`} no backup left.`;
  else sentence = `${rowsDown} of ${d.rows.length} rows would shut down or overheat.`;
  return { racks, equipment, pools, headline, sentence, rowsAtRisk, rowsDown };
}

/* N+1 test: fail each unit of a kind in turn and keep the worst result. */
export function survivesEach(d: Design, kind: Equip['kind']): { ok: boolean; worstUnit: string | null } {
  for (const e of d.equipment.filter((x) => x.kind === kind)) {
    const r = evaluate(d, { ...NORMAL, failed: new Set([e.id]) });
    if (r.rowsDown > 0) return { ok: false, worstUnit: e.id };
  }
  return { ok: true, worstUnit: null };
}

