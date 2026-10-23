/* The single app state object, with the same fields and defaults as the reference `state`. The reference builds it
   in three places (view.js, then simui.js and ui3.js add their fields); here it is one object, in that order. */
import { SCENARIOS } from './engine';
import type {
  Check,
  ClinicSim,
  CompiledScenario,
  DaysSummary,
  Fire,
  FurnItem,
  LayoutSpec,
  PlanJson,
  PreparedPlan,
  Problem,
  Scenario,
  SimScenario,
  Spread,
  Verdict
} from './engine';

export type StepName = 'import' | 'review' | 'simulate' | 'export';
export type ViewMode = 'orbit' | 'tour' | 'walk' | 'follow';
export type SimTab = 'scenario' | 'results' | 'history';
export type EditTool = 'swap' | 'rename' | 'furniture';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type PlanSource = 'pipeline' | 'sample' | 'file';

/* One saved version of the plan: either a sample spec or the uploaded file, plus renames and added furniture. */
export interface Version {
  n: number;
  change: string;
  spec: LayoutSpec | null;
  baseJson: PlanJson | null;
  renames: Record<string, string>;
  placed: FurnItem[];
  name: string;
  blurb: string;
  source: PlanSource;
  key?: string;
  at: Date;
}
export interface Dock {
  open: boolean;
  corner: Corner;
  w: number;
  h: number;
}
export interface Routes {
  journey: boolean;
  staff: boolean;
  egress: boolean;
}
export interface PlanTag {
  name: string;
  v: number;
  [k: string]: unknown;
}
export interface SweepRow {
  value: number;
  agg: Record<string, Spread>;
  v: Verdict;
}
/* A finished run, and what History keeps of it. */
export interface Run {
  id: string;
  at: number;
  kind: 'run' | 'range';
  name: string;
  scn: Scenario;
  sc: CompiledScenario;
  sum: DaysSummary;
  v: Verdict;
  fires: Fire[];
  plan: PlanTag;
  sweep?: { field: string; n: number; rows: SweepRow[] };
}
export interface CompareResult {
  [k: string]: unknown;
}

export interface AppState {
  /* view.js */
  key: string;
  json: PlanJson | null;
  P: PreparedPlan | null;
  sim: ClinicSim | null;
  playing: boolean;
  speed: number;
  scenario: SimScenario;
  seed: number;
  view: ViewMode;
  walls: 'cut' | 'full';
  layers: { labels: boolean; zones: boolean; furniture: boolean; traffic: boolean; waits: boolean };
  routes: Routes;
  compare: CompareResult | null;
  uploaded: PlanJson | null;
  placed: FurnItem[];
  placing: string | null;
  ghostRot: number;
  selected: FurnItem | null;
  followId: number | null;
  toastTimer: ReturnType<typeof setTimeout> | 0;
  /* simui.js */
  simTab: SimTab;
  scn: Scenario | null;
  run: Run | null;
  running: boolean;
  history: Run[];
  sweep: unknown;
  histSel: Set<string>;
  folded: Set<string>;
  probs: Problem[];
  tl: { t0: number; t1: number };
  /* ui3.js */
  step: StepName;
  spec: LayoutSpec | null;
  versions: Version[];
  vIndex: number;
  source: PlanSource | null;
  swapSel: string[];
  renameSel: string | null;
  editTool: EditTool;
  editing: boolean;
  layout: unknown;
  selectedRoom: string | null;
  planRoutes: Routes;
  /* The reference's chat state. The assistant is a placeholder in this build, so nothing reads or writes it. */
  chat: { turns: unknown[]; busy: boolean; ctl: AbortController | null };
  checks: Check[];
  exportMetrics: unknown;
  /* Set by init() */
  dock: Dock | null;
}

export const state: AppState = {
  key: 'A',
  json: null,
  P: null,
  sim: null,
  playing: false,
  speed: 1 / 6,
  scenario: SCENARIOS.normal,
  seed: 7,
  view: 'orbit',
  walls: 'cut',
  layers: { labels: true, zones: false, furniture: true, traffic: false, waits: true },
  routes: { journey: true, staff: false, egress: false },
  compare: null,
  uploaded: null,
  placed: [],
  placing: null,
  ghostRot: 0,
  selected: null,
  followId: null,
  toastTimer: 0,
  simTab: 'scenario',
  scn: null,
  run: null,
  running: false,
  history: [],
  sweep: null,
  histSel: new Set(),
  folded: new Set(),
  probs: [],
  tl: { t0: 0, t1: 600 },
  step: 'import',
  spec: null,
  versions: [],
  vIndex: -1,
  source: null,
  swapSel: [],
  renameSel: null,
  editTool: 'swap',
  editing: false,
  layout: null,
  selectedRoom: null,
  planRoutes: { journey: true, staff: false, egress: false },
  chat: { turns: [], busy: false, ctl: null },
  checks: [],
  exportMetrics: null,
  dock: null
};
