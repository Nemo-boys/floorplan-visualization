/* Types for plan.json v0.1, the internal plan model, scenarios (fi.scenario.v1), compiled scenarios and metrics.
   The engine is ported from reference-src/engine.js, which adds fields to objects as it goes, so several fields
   here are optional: they appear once a later step (the grid, the analysis, the simulator) has run. */

export interface Vec {
  x: number;
  y: number;
}

/* ---------- plan.json v0.1 (contracts/plan.v0.1.schema.json) ---------- */
export interface PlanJsonRect {
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
}
export interface PlanJsonRoom {
  id?: string;
  type?: string;
  label?: string;
  zone?: string;
  rect?: PlanJsonRect;
  polygon_mm?: number[][];
}
export interface PlanJsonDoor {
  id?: string;
  kind?: string;
  connects?: string[];
  center_mm?: number[];
  width_mm?: number;
  is_entrance?: boolean;
}
export interface PlanJsonFurniture {
  kind: string;
  center_mm: number[];
  facing: Vec;
}
export interface PlanJsonCheck {
  rule: string;
  pass: boolean;
  detail: string;
  source: string;
}
export interface PlanJson {
  schema_version?: string;
  units?: string;
  origin?: string;
  building_type?: string;
  name?: string;
  blurb?: string;
  footprint?: { width_mm?: number; depth_mm?: number };
  rooms: PlanJsonRoom[];
  doors?: PlanJsonDoor[];
  metrics?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  version?: number;
  exported_at?: string;
  furniture_added?: PlanJsonFurniture[];
  checks?: PlanJsonCheck[];
}

/* A sample layout: two rows of rooms either side of the corridor, as [id, type, width in metres]. */
export type SpecRoom = [string, string, number];
export interface LayoutSpec {
  name: string;
  blurb: string;
  facade: 'south' | 'west';
  south: SpecRoom[];
  north: SpecRoom[];
}

/* ---------- Internal model, in metres (m) ---------- */
export interface Room {
  id: string;
  type: string;
  label: string;
  zone: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Orient = 'h' | 'v';
export interface Door {
  id: string;
  a: string;
  b: string;
  kind: string;
  cx: number;
  cy: number;
  width: number;
  isEntrance: boolean;
  orient?: Orient;
  /* Added by buildGrid: the grid line the door sits on and the cells it covers along it. */
  line?: number;
  cov?: number[];
}
export interface Model {
  name: string;
  blurb: string;
  W: number;
  D: number;
  rooms: Room[];
  doors: Door[];
  inferredDoors: boolean;
}

/* ---------- Furniture plan ---------- */
export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface FurnItem {
  kind: string;
  room: number;
  x: number;
  y: number;
  dir: Vec;
  look: Vec;
  w: number;
  d: number;
  block: boolean;
  allowDoorZone?: boolean;
  sink?: boolean;
  monitor?: boolean;
  noSink?: boolean;
  lab?: boolean;
  tall?: boolean;
  seats?: number;
  tone?: string;
  /* Placed by hand in the editor. The view keeps its 3D object and the last accepted position on it. */
  placed?: boolean;
  obj?: unknown;
  _prev?: { x: number; y: number; dir: Vec };
}
export type FurnOpts = Partial<Omit<FurnItem, 'kind' | 'x' | 'y' | 'dir'>>;
export type Pose = 'sit' | 'stand';
export interface Spot {
  x: number;
  y: number;
  dir: Vec;
  pose: Pose;
  h: number;
  ax: number;
  ay: number;
  room?: number;
}
export interface ExamSpots {
  patient: Spot;
  nurse: Spot;
  provider: Spot;
}
export interface FurnSpots {
  seats: Spot[];
  exams: Record<string, ExamSpots>;
  nurseHomes: Spot[];
  officeHomes: Spot[];
  receptionist?: Spot;
  counter?: Spot;
}
export interface Furniture {
  items: FurnItem[];
  spots: FurnSpots;
  blocks: Rect[];
}

/* ---------- Walkable grid, walls and paths ---------- */
export interface Grid {
  nx: number;
  ny: number;
  room: Int16Array;
  blocked: Uint8Array;
  passE: Uint8Array;
  passN: Uint8Array;
  vDoor: Set<number>;
  hDoor: Set<number>;
}
export interface Wall {
  orient: Orient;
  at: number;
  from: number;
  to: number;
  ext: boolean;
}
export interface DoorGap {
  id: string;
  a: string;
  b: string;
  orient: Orient | undefined;
  at: number;
  from: number;
  to: number;
  kind: string;
  isEntrance: boolean;
}
export interface PlanWindow {
  orient: Orient;
  at: number;
  from: number;
  to: number;
  room: string;
}
export interface Path {
  cells: number[];
  pts: Vec[];
  cum: number[];
  len: number;
}
export type Pathfinder = (s: number, t: number) => Path | null;

/* ---------- Plan analysis ---------- */
/* A spot people go to: a grid cell, and where it came from in the furniture plan when there is one. */
export interface CellSpot extends Partial<Spot> {
  cell: number;
  pose: Pose;
}
export interface ExamInfo {
  k: number;
  id: string;
  label: string;
  patient: CellSpot;
  nurse: CellSpot;
  provider: CellSpot;
  reachable: boolean;
  distWait: number;
  distNurse: number;
  distOffice: number;
}
export interface Journey {
  legs: Vec[][];
  len: number;
  examLabel: string | null;
}
export interface StaffRoute {
  pts: Vec[];
  len: number;
  label: string;
}
export interface Egress {
  pts: Vec[];
  len: number;
  fromLabel: string;
}
export interface PlanInfo {
  entranceCell: number;
  counter: CellSpot;
  receptionist: CellSpot;
  seats: CellSpot[];
  waitCell: number;
  nurseHomes: CellSpot[];
  officeHomes: CellSpot[];
  exams: ExamInfo[];
  allExams: ExamInfo[];
  routes: { journey: Journey; staff: StaffRoute[]; egress: Egress | null };
  avgNurse: number;
  unreachableRooms: string[];
  nurseLabel: string;
  entK: number;
  waitingK: number;
  loungeSpots: CellSpot[];
  receptionSpots: CellSpot[];
}
export interface PreparedPlan {
  m: Model;
  furn: Furniture;
  g: Grid;
  pf: Pathfinder;
  info: PlanInfo;
}

/* ---------- Scenarios (fi.scenario.v1) ---------- */
export type Role = 'provider' | 'nurse' | 'reception';
export type FieldValue = string | number | boolean | number[];
export type BlockFields = Record<string, FieldValue>;
export interface Block {
  id: string;
  type: string;
  enabled?: boolean;
  fields: BlockFields;
}
export interface Scenario {
  schema: 'fi.scenario.v1';
  name: string;
  preset?: string;
  blocks: Block[];
  edited?: boolean;
}
export interface Problem {
  level: 'error' | 'warning';
  block: string | null;
  field: string | null;
  msg: string;
}

/* ---------- Simulator input: the simple legacy form, or one compiled from blocks ---------- */
export type MinRange = [number, number] | number[];
export interface Shift {
  from: number;
  to: number;
}
export interface ArrivalStream {
  kind: 'appt' | 'walkin' | 'group';
  count: number;
  from?: number;
  to?: number;
  at?: number;
  noShow?: number;
  pattern?: string;
}
export interface VisitType {
  name: string;
  share: number;
  prov: number[];
  p?: number;
}
export interface BreakPlan {
  role: Role;
  minutes: number;
  from: number;
  to: number;
  stagger: boolean;
}
export interface OutPlan {
  role: Role;
  count: number;
  from: number;
  to: number;
}
export interface Closure {
  room: string;
  from: number;
  to: number;
}
export interface RulePlan {
  id: string;
  label: string;
  metric: string;
  op: string;
  value: number;
  hold: number;
  from: number;
  to: number;
  action: string;
  role: Role;
  count: number;
  delay: number;
  duration: number;
}
export interface SimScenario {
  checkInMin: MinRange;
  checkoutMin: MinRange;
  intakeMin: MinRange;
  visitMin: MinRange;
  turnoverMin: number;
  patientSpeed: number;
  staffSpeed: number;
  firstArrival: number;
  lastArrival: number;
  walkInShare: number;
  key?: string;
  label?: string;
  providers: number;
  nurses: number;
  patients: number;
  receptionists?: number;
  opens?: number;
  closes?: number;
  staffPlan?: Partial<Record<Role, Shift[]>>;
  arrivalsPlan?: ArrivalStream[];
  visitTypes?: VisitType[];
  breaks?: BreakPlan[];
  outs?: OutPlan[];
  closures?: Closure[];
  rules?: RulePlan[];
  days?: number;
  seed?: number;
}
export interface CompiledScenario extends SimScenario {
  key: string;
  label: string;
  opens: number;
  closes: number;
  staffPlan: Record<Role, Shift[]>;
  arrivalsPlan: ArrivalStream[];
  visitTypes: VisitType[];
  breaks: BreakPlan[];
  outs: OutPlan[];
  closures: Closure[];
  rules: RulePlan[];
  receptionists: number;
  days: number;
  seed: number;
}

/* ---------- Simulator output ---------- */
export interface Metrics {
  seen: number;
  avgWait: number;
  p90Wait: number;
  lobbyWait: number;
  avgTime: number;
  avgWalk: number;
  nurseKm: number;
  providerKm: number;
  examUse: number;
  maxWaiting: number;
  lastExit: number;
  unreachable: number;
  turnedAway: number;
  noShows: number;
  breaks: number;
  fires: number;
  notSeen: number;
  utilNurse: number;
  utilProvider: number;
  utilReception: number;
}
export interface Fire {
  t: number;
  id: string;
  label: string;
}
export interface SeriesPoint {
  t: number;
  lobby: number;
  inClinic: number;
}
export interface DayResult extends Metrics {
  seed: number;
  fireList: Fire[];
  series: SeriesPoint[];
  opens: number;
  closes: number;
}
export type DayKey =
  | 'seen'
  | 'avgWait'
  | 'p90Wait'
  | 'avgTime'
  | 'nurseKm'
  | 'examUse'
  | 'turnedAway'
  | 'noShows'
  | 'notSeen'
  | 'utilNurse'
  | 'utilProvider'
  | 'utilReception'
  | 'lastExit'
  | 'maxWaiting'
  | 'fires';
export interface Spread {
  mean: number;
  lo: number;
  hi: number;
}
export interface DaysSummary {
  n: number;
  agg: Record<DayKey, Spread>;
  typical: DayResult;
  fireDays: Record<string, number>;
}
export type VerdictLevel = 'good' | 'busy' | 'bad';
export interface Verdict {
  level: VerdictLevel;
  title: string;
  bottleneck: { name: string; util: number };
  util: Record<string, number>;
  peak: SeriesPoint;
}

/* ---------- Plan checks and the tour ---------- */
export interface Check {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  source: string;
}
export interface TourStop {
  kind?: 'entrance' | 'exit';
  room?: Room;
}
