/* Discrete-event simulation of one clinic day (minutes from 8:00 am). Walking times come from real path lengths.
   A scenario is either the simple form (providers, nurses, patients, walkInShare) or one compiled by the scenario
   builder (staff shifts, arrival streams, visit types, breaks, staff out, closed rooms and When/Then rules). */
import { Heap } from './heap';
import { mulberry32 } from './rng';
import { clamp } from './util';
import { cellXY } from './grid';
import { fmtMin } from './format';
import type {
  ArrivalStream,
  CellSpot,
  ExamInfo,
  Fire,
  Grid,
  Metrics,
  MinRange,
  Model,
  OutPlan,
  Pathfinder,
  PlanInfo,
  Role,
  RulePlan,
  SeriesPoint,
  Shift,
  SimScenario,
  Vec,
  VisitType
} from './types';

export const BASE_SCENARIO = {
  checkInMin: [2, 4],
  checkoutMin: [1, 3],
  intakeMin: [5, 9],
  visitMin: [12, 26],
  turnoverMin: 2,
  patientSpeed: 66,
  staffSpeed: 78,
  firstArrival: 0,
  lastArrival: 480,
  walkInShare: 0.15
};
export const SCENARIOS: Record<string, SimScenario> = {
  normal: Object.assign({}, BASE_SCENARIO, {
    key: 'normal',
    label: 'Normal Tuesday',
    providers: 3,
    nurses: 2,
    patients: 60
  }),
  flu: Object.assign({}, BASE_SCENARIO, {
    key: 'flu',
    label: 'Flu-season Monday',
    providers: 3,
    nurses: 2,
    patients: 90,
    walkInShare: 0.45,
    visitMin: [10, 20],
    intakeMin: [4, 8]
  }),
  short: Object.assign({}, BASE_SCENARIO, {
    key: 'short',
    label: 'Short-staffed day',
    providers: 2,
    nurses: 1,
    patients: 48
  })
};

export const WALKIN_PATTERNS: Record<string, (t: number) => number> = {
  steady: () => 1,
  morning: t => (t < 150 ? 1 : 0.3),
  lunch: t => (t >= 240 && t <= 330 ? 1 : 0.3),
  afternoon: t => (t >= 420 ? 1 : 0.3)
};

export interface Move {
  pts: Vec[];
  cum: number[];
  len: number;
  t0: number;
  t1: number;
}
export interface Away {
  kind: 'break' | 'out';
  minutes?: number;
  until?: number;
}
/* A person in the day: staff (with a shift) or a patient (with a visit). */
export interface Agent {
  id: number;
  role: Role | 'patient';
  active: boolean;
  cell: number;
  x: number;
  y: number;
  move: Move | null;
  walked: number;
  rest: CellSpot | null;
  lane: number;
  look: number;
  gone?: boolean;
  /* Staff */
  home: CellSpot;
  shift: Shift;
  busyTime: number;
  awayTime: number;
  busySince: number | null;
  away: Away | null;
  pendingAway: Away | null;
  offAt: number | null;
  callIn?: boolean;
  /* Patients */
  kind?: string;
  visit?: VisitType | null;
  tArrive?: number;
  phase?: 'in' | 'out';
  justArrived?: boolean;
  tQueue?: number;
  deskWait?: number;
  seat?: CellSpot;
  tWait?: number;
  waitingSince?: number | null;
  waitLobby?: number;
  room?: string | null;
  tReady?: number;
  waitRoom?: number;
  leaving?: boolean;
  leftAt?: number;
}
export interface SimRoom extends ExamInfo {
  closed?: boolean;
  since?: number;
}
interface SimRule extends RulePlan {
  since: number | null;
  fired: boolean;
}
interface Job {
  p: Agent;
  room: SimRoom;
}
interface SimEvent {
  t: number;
  s: number;
  fn: () => void;
}

export class ClinicSim {
  declare m: Model;
  declare g: Grid;
  declare pf: Pathfinder;
  declare info: PlanInfo;
  declare sc: SimScenario;
  declare rng: () => number;
  declare q: Heap<SimEvent>;
  declare seq: number;
  declare opens: number;
  declare closes: number;
  declare now: number;
  declare agents: Agent[];
  declare heat: Float32Array;
  declare deskQueue: Agent[];
  declare waiting: Agent[];
  declare ready: Job[];
  declare freeRooms: SimRoom[];
  declare roomById: Map<string, SimRoom>;
  declare freeNurses: Agent[];
  declare freeProviders: Agent[];
  declare deskFree: Agent[];
  declare seatsTaken: Set<CellSpot>;
  declare waits: number[];
  declare lobbyWaits: number[];
  declare times: number[];
  declare walks: number[];
  declare roomBusy: number;
  declare maxWaiting: number;
  declare inClinic: number;
  declare seen: number;
  declare lastExit: number;
  declare unreachable: number;
  declare busyRooms: Set<SimRoom>;
  declare turnedAway: number;
  declare noShows: number;
  declare fires: Fire[];
  declare walkinsPausedUntil: number;
  declare breaksTaken: number;
  declare loungeIdx: number;
  declare series: SeriesPoint[];
  declare nurses: Agent[];
  declare providers: Agent[];
  declare receptionists: Agent[];
  declare rules?: SimRule[];
  declare tickEnd?: number;
  constructor(m: Model, g: Grid, pf: Pathfinder, info: PlanInfo, sc: SimScenario, seed: number) {
    this.m = m;
    this.g = g;
    this.pf = pf;
    this.info = info;
    this.sc = sc;
    this.rng = mulberry32(seed);
    this.q = new Heap<SimEvent>((a, b) => a.t < b.t || (a.t === b.t && a.s < b.s));
    this.seq = 0;
    this.opens = sc.opens != null ? sc.opens : 0;
    this.closes = sc.closes != null ? sc.closes : 600;
    this.now = this.opens;
    this.agents = [];
    this.heat = new Float32Array(g.nx * g.ny);
    this.deskQueue = [];
    this.waiting = [];
    this.ready = [];
    this.freeRooms = info.exams.map(e => Object.assign({}, e));
    this.roomById = new Map(this.freeRooms.map(r => [r.id, r]));
    this.freeNurses = [];
    this.freeProviders = [];
    this.deskFree = [];
    this.seatsTaken = new Set();
    this.waits = [];
    this.lobbyWaits = [];
    this.times = [];
    this.walks = [];
    this.roomBusy = 0;
    this.maxWaiting = 0;
    this.inClinic = 0;
    this.seen = 0;
    this.lastExit = this.opens;
    this.unreachable = 0;
    this.busyRooms = new Set();
    this.turnedAway = 0;
    this.noShows = 0;
    this.fires = [];
    this.walkinsPausedUntil = -Infinity;
    this.breaksTaken = 0;
    this.loungeIdx = 0;
    this.series = [{ t: this.now, lobby: 0, inClinic: 0 }];
    this.nurses = [];
    this.providers = [];
    this.receptionists = [];
    const allDay = (n: number): Shift[] => Array.from({ length: n }, () => ({ from: this.opens, to: Infinity }));
    const plan = sc.staffPlan || {
      provider: allDay(sc.providers),
      nurse: allDay(sc.nurses),
      reception: allDay(sc.receptionists || 1)
    };
    for (const role of ['reception', 'nurse', 'provider'] as Role[])
      (plan[role] || []).forEach((s, k) => this.addStaff(role, s, k));
    for (const b of sc.breaks || []) {
      const staff = this.listFor(b.role).filter(a => a.shift.from < b.to && a.shift.to > b.from);
      staff.forEach((a, k) => {
        const t = Math.max(b.from, a.shift.from) + (b.stagger ? k * b.minutes : 0);
        if (t < a.shift.to) this.at(t, () => this.requestAway(a, { kind: 'break', minutes: b.minutes }));
      });
    }
    for (const o of sc.outs || []) this.at(o.from, () => this.sendOut(o));
    for (const c of sc.closures || []) {
      const room = this.roomById.get(c.room);
      if (!room) continue;
      this.at(c.from, () => {
        room.closed = true;
        const i = this.freeRooms.indexOf(room);
        if (i >= 0) this.freeRooms.splice(i, 1);
      });
      this.at(c.to, () => {
        room.closed = false;
        if (!this.busyRooms.has(room) && !this.freeRooms.includes(room)) this.freeRooms.push(room);
        this.callNext();
      });
    }
    if (sc.rules && sc.rules.length) {
      this.rules = sc.rules.map(r => Object.assign({ since: null, fired: false }, r));
      this.tickEnd = Math.min(this.closes, Math.max(...this.rules.map(r => r.to)));
      this.at(Math.max(this.opens, Math.min(...this.rules.map(r => r.from))), () => this.tick());
    }
    if (sc.arrivalsPlan) this.genArrivals(sc.arrivalsPlan);
    else {
      const span = sc.lastArrival - sc.firstArrival;
      for (let k = 0; k < sc.patients; k++) {
        const walkIn = this.rng() < sc.walkInShare;
        const t = walkIn
          ? sc.firstArrival + this.rng() * span
          : sc.firstArrival + ((k + 0.5) * span) / sc.patients + (this.rng() * 2 - 1) * 6;
        this.at(clamp(t, sc.firstArrival, sc.lastArrival), () => this.arrive(walkIn ? 'walkin' : 'appt'));
      }
    }
  }
  at(t: number, fn: () => void): void {
    this.q.push({ t, s: this.seq++, fn });
  }
  u(r: MinRange): number {
    return r[0] + this.rng() * (r[1] - r[0]);
  }
  mark(): void {
    const s = this.series,
      last = s[s.length - 1];
    if (last.lobby !== this.waiting.length || last.inClinic !== this.inClinic)
      s.push({ t: this.now, lobby: this.waiting.length, inClinic: this.inClinic });
  }
  spawn(role: Agent['role'], cell: number): Agent {
    const p = cellXY(this.g, cell);
    const a = {
      id: this.agents.length,
      role,
      active: true,
      cell,
      x: p.x,
      y: p.y,
      move: null,
      walked: 0,
      rest: null,
      lane: (this.rng() - 0.5) * 0.34,
      look: this.rng()
    } as unknown as Agent;
    this.agents.push(a);
    return a;
  }
  listFor(role: string): Agent[] {
    return role === 'nurse' ? this.nurses : role === 'provider' ? this.providers : this.receptionists;
  }
  poolFor(role: string): Agent[] {
    return role === 'nurse' ? this.freeNurses : role === 'provider' ? this.freeProviders : this.deskFree;
  }
  homesFor(role: string): CellSpot[] {
    const i = this.info;
    return role === 'nurse'
      ? i.nurseHomes
      : role === 'provider'
        ? i.officeHomes
        : i.receptionSpots && i.receptionSpots.length
          ? i.receptionSpots
          : [i.receptionist];
  }
  addStaff(role: Role, shift: Shift, k: number, walkIn?: boolean): Agent {
    const homes = this.homesFor(role),
      h = homes[k % homes.length];
    const a = this.spawn(role, walkIn ? this.info.entranceCell : h.cell);
    a.home = h;
    a.shift = { from: shift.from, to: shift.to };
    a.busyTime = 0;
    a.awayTime = 0;
    a.busySince = null;
    a.away = null;
    a.pendingAway = null;
    a.offAt = isFinite(shift.to) ? shift.to : null;
    this.listFor(role).push(a);
    if (walkIn) this.walk(a, h, () => this.addFree(a), h);
    else if (shift.from <= this.now) {
      a.rest = h.x != null ? h : null;
      this.addFree(a);
    } else {
      a.active = false;
      this.at(shift.from, () => {
        const p = cellXY(this.g, this.info.entranceCell);
        a.active = true;
        a.cell = this.info.entranceCell;
        a.x = p.x;
        a.y = p.y;
        this.walk(a, h, () => this.addFree(a), h);
      });
    }
    if (a.offAt != null)
      this.at(a.offAt, () => {
        const pool = this.poolFor(role),
          i = pool.indexOf(a);
        if (i >= 0) {
          pool.splice(i, 1);
          this.goHome(a);
        }
      });
    return a;
  }
  addFree(a: Agent): void {
    if (a.offAt != null && this.now >= a.offAt) {
      this.goHome(a);
      return;
    }
    if (a.pendingAway) {
      const pa = a.pendingAway;
      a.pendingAway = null;
      this.startAway(a, pa);
      return;
    }
    this.poolFor(a.role).push(a);
    if (a.role === 'nurse') this.callNext();
    else if (a.role === 'provider') this.sendProvider();
    else this.serveDesk();
  }
  take(a: Agent): void {
    a.busySince = this.now;
  }
  release(a: Agent): void {
    if (a.busySince != null) {
      a.busyTime += this.now - a.busySince;
      a.busySince = null;
    }
    this.addFree(a);
  }
  wantsToStop(a: Agent): boolean {
    return !!a.pendingAway || (a.offAt != null && this.now >= a.offAt);
  }
  goHome(a: Agent): void {
    a.gone = true;
    this.walk(a, this.info.entranceCell, () => {
      a.active = false;
      a.rest = null;
    });
  }
  requestAway(a: Agent, pa: Away): void {
    if (a.gone || a.away || !a.active) return;
    const pool = this.poolFor(a.role),
      i = pool.indexOf(a);
    if (i >= 0) {
      pool.splice(i, 1);
      this.startAway(a, pa);
    } else a.pendingAway = pa;
  }
  startAway(a: Agent, pa: Away): void {
    const t0 = this.now,
      end = pa.until != null ? pa.until : t0 + (pa.minutes as number);
    if (end <= t0 + 0.5) {
      this.addFree(a);
      return;
    }
    a.away = pa;
    if (pa.kind === 'break') this.breaksTaken++;
    const back = (): void => {
      a.awayTime += this.now - t0;
      a.away = null;
      this.walk(a, a.home, () => this.addFree(a), a.home);
    };
    if (pa.kind === 'break') {
      const spots = this.info.loungeSpots && this.info.loungeSpots.length ? this.info.loungeSpots : [a.home],
        spot = spots[this.loungeIdx++ % spots.length];
      this.walk(a, spot, () => this.at(Math.max(this.now, end), back), spot);
    } else {
      this.walk(a, this.info.entranceCell, () => {
        a.active = false;
        this.at(Math.max(this.now, end), () => {
          const p = cellXY(this.g, this.info.entranceCell);
          a.active = true;
          a.cell = this.info.entranceCell;
          a.x = p.x;
          a.y = p.y;
          back();
        });
      });
    }
  }
  sendOut(o: OutPlan): void {
    const list = this.listFor(o.role).filter(a => a.active && !a.gone && !a.away && !a.pendingAway),
      pool = this.poolFor(o.role);
    list.sort((x, y) => (pool.includes(y) ? 1 : 0) - (pool.includes(x) ? 1 : 0));
    list.slice(0, o.count).forEach(a => this.requestAway(a, { kind: 'out', until: o.to }));
  }
  callIn(role: Role, minutes: number): void {
    const a = this.addStaff(role, { from: this.now, to: this.now + minutes }, this.listFor(role).length, true);
    a.callIn = true;
  }
  tick(): void {
    for (const r of this.rules as SimRule[]) {
      if (r.fired) continue;
      if (this.now < r.from || this.now > r.to) {
        r.since = null;
        continue;
      }
      const v = this.metricValue(r.metric),
        ok = r.op === 'lt' ? v < r.value : v > r.value;
      if (!ok) {
        r.since = null;
        continue;
      }
      if (r.since == null) r.since = this.now;
      if (this.now - r.since >= r.hold) this.fire(r);
    }
    if (this.now + 1 <= (this.tickEnd as number) && (this.rules as SimRule[]).some(r => !r.fired))
      this.at(this.now + 1, () => this.tick());
  }
  metricValue(k: string): number {
    if (k === 'waiting') return this.waiting.length;
    if (k === 'longest') return this.waiting.reduce((mx, p) => Math.max(mx, this.now - (p.tWait as number)), 0);
    if (k === 'desk') return this.deskQueue.length;
    if (k === 'free_rooms') return this.freeRooms.length;
    return 0;
  }
  fire(r: SimRule): void {
    r.fired = true;
    this.fires.push({ t: this.now, id: r.id, label: r.label });
    if (r.action === 'call_in')
      this.at(this.now + (r.delay || 0), () => {
        for (let k = 0; k < r.count; k++) this.callIn(r.role, r.duration);
      });
    else if (r.action === 'pause_walkins') this.walkinsPausedUntil = this.now + r.duration;
  }
  genArrivals(list: ArrivalStream[]): void {
    for (const s of list) {
      if (s.kind === 'appt') {
        const from = s.from as number,
          to = s.to as number;
        const span = Math.max(1, to - from);
        for (let k = 0; k < s.count; k++) {
          if (this.rng() < (s.noShow as number)) {
            this.noShows++;
            continue;
          }
          const t = from + ((k + 0.5) * span) / s.count + (this.rng() * 2 - 1) * 6;
          this.at(clamp(t, this.opens, this.closes), () => this.arrive('appt'));
        }
      } else if (s.kind === 'walkin') {
        const from = s.from as number,
          to = s.to as number;
        const w = WALKIN_PATTERNS[s.pattern as string] || WALKIN_PATTERNS.steady;
        let n = 0,
          guard = 0;
        while (n < s.count && guard++ < s.count * 80) {
          const t = from + this.rng() * Math.max(1, to - from);
          if (this.rng() <= w(t)) {
            n++;
            this.at(t, () => this.arrive('walkin'));
          }
        }
      } else if (s.kind === 'group') {
        for (let k = 0; k < s.count; k++) this.at((s.at as number) + this.rng() * 4, () => this.arrive('group'));
      }
    }
  }
  pickVisit(): VisitType | null {
    const vt = this.sc.visitTypes;
    if (!vt || !vt.length) return null;
    let x = this.rng();
    for (const v of vt) {
      x -= v.p as number;
      if (x <= 0) return v;
    }
    return vt[vt.length - 1];
  }
  walk(a: Agent, to: number | CellSpot, cb: () => void, rest?: CellSpot): void {
    const target = typeof to === 'number' ? to : to.cell;
    const p = this.pf(a.cell, target);
    a.rest = null;
    const arrive = (): void => {
      a.move = null;
      a.cell = target;
      const q = cellXY(this.g, target);
      a.x = q.x;
      a.y = q.y;
      a.rest = rest && rest.x != null ? rest : null;
      cb();
    };
    if (!p) {
      this.unreachable++;
      this.at(this.now, arrive);
      return;
    }
    if (p.len < 1e-6) {
      this.at(this.now, arrive);
      return;
    }
    a.walked += p.len;
    for (const c of p.cells) this.heat[c] += 1;
    const t1 = this.now + p.len / (a.role === 'patient' ? this.sc.patientSpeed : this.sc.staffSpeed);
    a.move = { pts: p.pts, cum: p.cum, len: p.len, t0: this.now, t1 };
    this.at(t1, arrive);
  }
  arrive(kind: string): void {
    if (kind === 'walkin' && this.now < this.walkinsPausedUntil) {
      this.turnedAway++;
      return;
    }
    const p = this.spawn('patient', this.info.entranceCell);
    p.kind = kind || 'appt';
    p.visit = this.pickVisit();
    p.tArrive = this.now;
    p.phase = 'in';
    p.justArrived = true;
    this.inClinic++;
    this.mark();
    this.walk(p, this.info.counter, () => this.joinDesk(p), this.info.counter);
  }
  joinDesk(p: Agent): void {
    p.tQueue = this.now;
    this.deskQueue.push(p);
    this.serveDesk();
  }
  serveDesk(): void {
    while (this.deskQueue.length && this.deskFree.length) {
      const r = this.deskFree.shift() as Agent,
        p = this.deskQueue.shift() as Agent;
      p.deskWait = (p.deskWait || 0) + (this.now - (p.tQueue as number));
      this.take(r);
      this.at(this.now + this.u(p.phase === 'in' ? this.sc.checkInMin : this.sc.checkoutMin), () => {
        if (p.phase === 'in') {
          const seat = (p.seat = this.takeSeat());
          this.walk(p, seat, () => this.joinWaiting(p), seat);
        } else {
          p.leaving = true;
          this.walk(p, this.info.entranceCell, () => this.leave(p));
        }
        this.release(r);
      });
    }
  }
  takeSeat(): CellSpot {
    const s = this.info.seats;
    const free = s.filter(x => !this.seatsTaken.has(x));
    const pick = free.length ? free[(this.rng() * free.length) | 0] : s[(this.rng() * s.length) | 0];
    this.seatsTaken.add(pick);
    return pick;
  }
  joinWaiting(p: Agent): void {
    p.tWait = this.now;
    p.waitingSince = this.now;
    this.waiting.push(p);
    this.maxWaiting = Math.max(this.maxWaiting, this.waiting.length);
    this.mark();
    this.callNext();
  }
  callNext(): void {
    while (this.waiting.length && this.freeRooms.length && this.freeNurses.length) {
      const p = this.waiting.shift() as Agent;
      let bi = 0;
      for (let q = 1; q < this.freeRooms.length; q++)
        if (this.freeRooms[q].distWait < this.freeRooms[bi].distWait) bi = q;
      const room = this.freeRooms.splice(bi, 1)[0],
        nurse = this.freeNurses.shift() as Agent;
      this.take(nurse);
      p.waitLobby = this.now - (p.tWait as number);
      p.waitingSince = null;
      this.seatsTaken.delete(p.seat as CellSpot);
      room.since = this.now;
      this.busyRooms.add(room);
      p.room = room.id;
      this.mark();
      let n = 0;
      const both = (): void => {
        if (++n === 2) this.intake(p, room, nurse);
      };
      this.walk(p, room.patient, both, room.patient);
      this.walk(nurse, room.nurse, both, room.nurse);
    }
  }
  intake(p: Agent, room: SimRoom, nurse: Agent): void {
    this.at(this.now + this.u(this.sc.intakeMin), () => {
      this.walk(nurse, nurse.home, () => this.release(nurse), nurse.home);
      p.tReady = this.now;
      p.waitingSince = this.now;
      this.ready.push({ p, room });
      this.sendProvider();
    });
  }
  sendProvider(): void {
    while (this.ready.length && this.freeProviders.length) {
      const job = this.ready.shift() as Job,
        dr = this.freeProviders.shift() as Agent;
      this.take(dr);
      this.walk(dr, job.room.provider, () => this.visit(job, dr), job.room.provider);
    }
  }
  visit(job: Job, dr: Agent): void {
    job.p.waitRoom = this.now - (job.p.tReady as number);
    job.p.waitingSince = null;
    const span = job.p.visit ? job.p.visit.prov : this.sc.visitMin;
    this.at(this.now + this.u(span), () => {
      const { p, room } = job;
      p.phase = 'out';
      p.room = null;
      this.walk(p, this.info.counter, () => this.joinDesk(p), this.info.counter);
      this.at(this.now + this.sc.turnoverMin, () => {
        this.roomBusy += this.now - (room.since as number);
        this.busyRooms.delete(room);
        if (!room.closed) this.freeRooms.push(room);
        this.callNext();
      });
      if (this.ready.length && !this.wantsToStop(dr)) {
        const next = this.ready.shift() as Job;
        this.walk(dr, next.room.provider, () => this.visit(next, dr), next.room.provider);
      } else this.walk(dr, dr.home, () => this.release(dr), dr.home);
    });
  }
  leave(p: Agent): void {
    p.active = false;
    p.leftAt = this.now;
    this.inClinic--;
    this.seen++;
    this.waits.push((p.deskWait || 0) + (p.waitLobby || 0) + (p.waitRoom || 0));
    this.lobbyWaits.push(p.waitLobby || 0);
    this.times.push(this.now - (p.tArrive as number));
    this.walks.push(p.walked);
    this.lastExit = this.now;
    this.mark();
  }
  advanceTo(t: number): void {
    while (this.q.size && this.q.peek().t <= t) {
      const e = this.q.pop();
      this.now = e.t;
      e.fn();
    }
    if (t > this.now) this.now = t;
  }
  runAll(): void {
    while (this.q.size) {
      const e = this.q.pop();
      this.now = e.t;
      e.fn();
    }
  }
  get done(): boolean {
    return this.q.size === 0;
  }
  metrics(): Metrics {
    const avg = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const p90 = (a: number[]): number => {
      if (!a.length) return 0;
      const s = a.slice().sort((x, y) => x - y);
      return s[Math.floor(0.9 * (s.length - 1))];
    };
    const perHead = (list: Agent[]): number => list.reduce((s, a) => s + a.walked, 0) / Math.max(1, list.length) / 1000;
    const end = this.done ? Math.max(this.lastExit, this.opens + 60) : Math.max(this.now, this.opens + 1);
    const util = (list: Agent[]): number => {
      let busy = 0,
        duty = 0;
      for (const a of list) {
        const from = Math.max(a.shift.from, this.opens),
          to = Math.min(a.shift.to, end);
        duty += Math.max(0, to - from - a.awayTime);
        busy += a.busyTime + (a.busySince != null ? this.now - a.busySince : 0);
      }
      return duty > 0 ? Math.min(1, busy / duty) : 0;
    };
    const span = Math.max(30, end - this.opens);
    return {
      seen: this.seen,
      avgWait: avg(this.waits),
      p90Wait: p90(this.waits),
      lobbyWait: avg(this.lobbyWaits),
      avgTime: avg(this.times),
      avgWalk: avg(this.walks),
      nurseKm: perHead(this.nurses),
      providerKm: perHead(this.providers),
      examUse: this.info.exams.length
        ? Math.min(
            1,
            (this.roomBusy + [...this.busyRooms].reduce((s, r) => s + this.now - (r.since as number), 0)) /
              (this.info.exams.length * span)
          )
        : 0,
      maxWaiting: this.maxWaiting,
      lastExit: this.lastExit,
      unreachable: this.unreachable,
      turnedAway: this.turnedAway,
      noShows: this.noShows,
      breaks: this.breaksTaken,
      fires: this.fires.length,
      notSeen: this.inClinic,
      utilNurse: util(this.nurses),
      utilProvider: util(this.providers),
      utilReception: util(this.receptionists)
    };
  }
}
export interface Pos {
  x: number;
  y: number;
  dx: number;
  dy: number;
  moving: boolean;
}
export function posAt(a: Pick<Agent, 'move' | 'x' | 'y'>, t: number): Pos {
  const mv = a.move;
  if (!mv) return { x: a.x, y: a.y, dx: 0, dy: 0, moving: false };
  const d = clamp((t - mv.t0) / (mv.t1 - mv.t0 || 1), 0, 1) * mv.len,
    cum = mv.cum,
    pts = mv.pts;
  let k = 1;
  while (k < cum.length - 1 && cum[k] < d) k++;
  const seg = cum[k] - cum[k - 1] || 1,
    u = clamp((d - cum[k - 1]) / seg, 0, 1);
  const dx = pts[k].x - pts[k - 1].x,
    dy = pts[k].y - pts[k - 1].y,
    L = Math.hypot(dx, dy) || 1;
  return { x: pts[k - 1].x + dx * u, y: pts[k - 1].y + dy * u, dx: dx / L, dy: dy / L, moving: true };
}

/* Stand-in for the two Nemotron calls: text to settings, numbers to advice. */
export function parseScenario(text: unknown): SimScenario {
  const t = String(text || '').toLowerCase();
  const grab = (re: RegExp): number | null => {
    const m = t.match(re);
    return m ? parseInt(m[1], 10) : null;
  };
  const busy = /(busy|flu|surge|rush|crowd|packed|monday|walk-in|walk in)/.test(t);
  const base = busy ? SCENARIOS.flu : SCENARIOS.normal;
  const providers = grab(/(\d+)\s*(?:providers?|doctors?|physicians?|clinicians?)/);
  const nurses = grab(/(\d+)\s*(?:nurses?|medical assistants?)/);
  const patients = grab(/(\d+)\s*(?:patients?|visits?|appointments?)/);
  return Object.assign({}, base, {
    key: 'custom',
    label: 'Your scenario',
    providers: clamp(providers == null ? base.providers : providers, 1, 8),
    nurses: clamp(nurses == null ? base.nurses : nurses, 1, 8),
    patients: clamp(patients == null ? base.patients : patients, 1, 160)
  });
}
export function explainResults(
  model: Model,
  info: PlanInfo,
  mt: Metrics,
  cmp?: { name: string; m: Metrics }[] | null
): string[] {
  if (!mt.seen) return ['No visits have finished yet. Play the day or run the whole day first.'];
  const out: string[] = [];
  out.push(
    'Patients waited ' +
      fmtMin(mt.avgWait) +
      ' on average, ' +
      fmtMin(mt.lobbyWait) +
      ' of it in the lobby and the rest in the exam room before the provider arrived. 1 in 10 waited more than ' +
      fmtMin(mt.p90Wait) +
      '.'
  );
  if (info.exams.length) {
    const far = info.exams.slice().sort((a, b) => b.distNurse - a.distNurse)[0];
    out.push(
      'Each nurse walked ' +
        mt.nurseKm.toFixed(1) +
        ' km. The ' +
        info.nurseLabel.toLowerCase() +
        ' is ' +
        Math.round(info.avgNurse) +
        ' m from the average exam room, and ' +
        far.label +
        ' is farthest at ' +
        Math.round(far.distNurse) +
        ' m.'
    );
    if (info.avgNurse > 9)
      out.push(
        'Suggested change: move the ' +
          info.nurseLabel.toLowerCase() +
          ' closer to ' +
          far.label +
          ', for example by swapping it with a room next to it. Nurses repeat that walk for every patient.'
      );
    else
      out.push(
        'The ' +
          info.nurseLabel.toLowerCase() +
          ' already sits close to the exam rooms, so the next gain is more likely to come from staffing than from layout.'
      );
  }
  if (mt.p90Wait > 15) {
    const use = Math.round(mt.examUse * 100);
    out.push(
      use >= 80
        ? 'Exam rooms were in use ' +
            use +
            '% of the day, so rooms are the limit at peak times. One more exam room would help more than more staff.'
        : 'Exam rooms sat empty ' +
            (100 - use) +
            '% of the day while patients waited, so staff are the limit. Try the same day with one more nurse.'
    );
  }
  if (cmp && cmp.length > 1) {
    const best = cmp.slice().sort((a, b) => a.m.nurseKm - b.m.nurseKm)[0];
    const cur = cmp.find(r => r.name === model.name);
    if (best && cur && best.name !== model.name && cur.m.nurseKm > 0) {
      const pct = Math.round((1 - best.m.nurseKm / cur.m.nurseKm) * 100);
      if (pct > 0) out.push(best.name + ' cuts nurse walking by about ' + pct + '% on the same day.');
    }
  }
  return out;
}
