/* ---------- The live Module 1 pipeline (AegisPlan) ----------
   Shown only when the AegisPlan API answers on /api (served by it, or proxied by `npm run dev`). Without it, the
   pipeline card keeps the design's stand-in, so the static app and its tests are unchanged. */
import type { PlanJson } from '../engine';
import { state } from '../state';
import { setConflict } from './conflicts';
import { syncEditMarks } from './edit';
import { commitVersion } from './versions';
import { $, esc } from './dom';
import { importPlan } from './versions';

interface Health {
  model?: { available: boolean; gguf: string | null; where?: 'local' | 'remote' };
}
/* AegisPlan's own plan document for each generated plan.json, so edits can go back to it. */
type AegisPlan = Record<string, unknown>;
const aegisPlans = new WeakMap<PlanJson, AegisPlan>();
function currentAegisPlan(): AegisPlan | null {
  const v = state.versions[state.vIndex];
  return (v && v.baseJson && aegisPlans.get(v.baseJson)) || null;
}

export interface Candidate {
  plan: AegisPlan;
  rank: number;
  source: 'nemotron' | 'fallback';
  solver_status: string;
  solve_time_ms: number;
  checks_passed: number;
  total_checks: number;
  viz_plan: PlanJson;
}

export const pipeline = { online: false, model: false, remote: false, busy: false, candidates: [] as Candidate[] };

const DEFAULT_BRIEF =
  'Primary care clinic with 6 exam rooms, a nurse station, reception and waiting, an ADA restroom, ' +
  'and separate clean and soiled utility rooms.';

export async function initPipeline(): Promise<void> {
  let health: Health;
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return;
    health = (await res.json()) as Health;
  } catch {
    return;
  }
  pipeline.online = true;
  pipeline.model = !!health.model?.available;
  pipeline.remote = health.model?.where === 'remote';
  renderPipelineCard();
}

function engineNote(): string {
  return pipeline.model
    ? `Our fine-tuned Nemotron Nano 9B runs ${pipeline.remote ? 'on a cloud GPU' : 'on this machine'}; CP-SAT repairs and the rule checker validates each plan.`
    : 'No local model found, so plans start from templates; CP-SAT repairs and the rule checker validates each plan.';
}

function renderPipelineCard(): void {
  const card = $('#openPipeline').closest<HTMLElement>('.card.source');
  if (!card) return;
  card.querySelectorAll<HTMLElement>(':scope > .inbox, :scope > p').forEach(el => (el.hidden = true));
  card.insertAdjacentHTML(
    'beforeend',
    '<p>Describe the building and generate three candidate plans.</p>' +
      '<form class="pipeform" id="pipeForm">' +
      '<label class="field">Brief<textarea id="pipeBrief" rows="3">' +
      esc(DEFAULT_BRIEF) +
      '</textarea></label>' +
      '<div class="pipedims">' +
      '<label class="field">Width (m)<input type="number" id="pipeW" min="10" max="80" step="0.5" value="24"></label>' +
      '<label class="field">Depth (m)<input type="number" id="pipeD" min="8" max="60" step="0.5" value="14"></label>' +
      '</div>' +
      '<button type="submit" class="btn primary" id="pipeGo">Generate 3 plans</button>' +
      '</form>' +
      '<p class="small muted" id="pipeStatus" role="status">' +
      esc(engineNote()) +
      '</p>' +
      '<ul class="pipelist" id="pipeList"></ul>'
  );
  $<HTMLFormElement>('#pipeForm').addEventListener('submit', e => {
    e.preventDefault();
    void generate();
  });
}

async function generate(): Promise<void> {
  if (pipeline.busy) return;
  const mm = (id: string): number => Math.round(parseFloat($<HTMLInputElement>(id).value) * 10) * 100;
  const brief = $<HTMLTextAreaElement>('#pipeBrief').value.trim(),
    w = mm('#pipeW'),
    d = mm('#pipeD');
  const status = $('#pipeStatus'),
    go = $<HTMLButtonElement>('#pipeGo');
  if (!brief || !(w > 0 && d > 0)) {
    status.textContent = 'Add a brief and the building’s width and depth.';
    return;
  }
  pipeline.busy = true;
  go.disabled = true;
  status.textContent = pipeline.model
    ? `Generating… ${pipeline.remote ? 'the first request wakes the GPU, so it' : 'the local model'} can take a minute.`
    : 'Generating…';
  const t0 = performance.now();
  try {
    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief, boundary_w: w, boundary_h: d, num_candidates: 3 })
    });
    if (!res.ok) throw new Error('the server answered ' + res.status);
    pipeline.candidates = ((await res.json()) as { candidates: Candidate[] }).candidates;
    status.textContent =
      pipeline.candidates.length +
      ' plans in ' +
      ((performance.now() - t0) / 1000).toFixed(1) +
      ' s, ranked by the checks they pass. ' +
      engineNote();
    renderCandidates();
  } catch (err) {
    status.textContent = 'The pipeline didn’t answer: ' + (err as Error).message + '.';
  } finally {
    pipeline.busy = false;
    go.disabled = false;
  }
}

/* The candidates from the same request as the current plan, other than itself; null for any other plan. */
export function otherCandidates(): PlanJson[] | null {
  const rank = state.json?.provenance?.rank;
  if (state.source !== 'pipeline' || typeof rank !== 'number' || pipeline.candidates.length < 2) return null;
  if (!pipeline.candidates.some(c => c.viz_plan.provenance?.rank === rank)) return null;
  return pipeline.candidates
    .filter(c => c.rank !== rank)
    .map(c => JSON.parse(JSON.stringify(c.viz_plan)) as PlanJson);
}

function renderCandidates(): void {
  const list = $('#pipeList');
  list.innerHTML = pipeline.candidates
    .map((c, i) => {
      const rooms = c.viz_plan.rooms.length,
        how = c.source === 'nemotron' ? 'Nemotron' : 'Template',
        solver = c.solver_status === 'INFEASIBLE' ? 'could not be repaired' : c.solver_status.toLowerCase();
      return (
        '<li class="inbox"><div class="file"><b>' +
        esc(c.viz_plan.name || 'Candidate ' + c.rank) +
        '</b><small>' +
        c.checks_passed +
        ' of ' +
        c.total_checks +
        ' checks pass · ' +
        rooms +
        ' rooms · ' +
        esc(solver) +
        ' · ' +
        how +
        '</small></div><button type="button" class="btn primary" data-candidate="' +
        i +
        '">Open this plan</button></li>'
      );
    })
    .join('');
  list.querySelectorAll<HTMLButtonElement>('[data-candidate]').forEach(b =>
    b.addEventListener('click', () => {
      const c = pipeline.candidates[Number(b.dataset.candidate)],
        json = JSON.parse(JSON.stringify(c.viz_plan)) as PlanJson;
      aegisPlans.set(json, c.plan);
      importPlan({ kind: 'generated', json });
    })
  );
}

/* ---------- Bigger changes: plain-language edits solved again by AegisPlan ---------- */
const DEFAULT_EDIT = 'Make the waiting room 20% bigger, keep the restrooms fixed';

/* The “Bigger changes” button shows only for a generated plan while the pipeline answers. */
export function syncAskBigger(): void {
  const btn = document.querySelector<HTMLButtonElement>('#askBigger');
  if (!btn) return;
  const on = pipeline.online && !!currentAegisPlan();
  btn.hidden = !on;
  const form = document.querySelector<HTMLElement>('#editForm');
  if (form && !on) form.hidden = true;
  if (!on || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.textContent = 'Ask the plan generator';
  btn.closest('.row')?.insertAdjacentHTML(
    'afterend',
    '<form class="pipeform" id="editForm" hidden>' +
      '<label class="field">Change<textarea id="editText" rows="2">' +
      esc(DEFAULT_EDIT) +
      '</textarea></label>' +
      '<button type="submit" class="btn primary" id="editGo">Send to the generator</button>' +
      '<p class="small muted" id="editStatus" role="status"></p>' +
      '</form>'
  );
  btn.addEventListener('click', () => {
    const f = $('#editForm');
    f.hidden = !f.hidden;
    if (!f.hidden) $<HTMLTextAreaElement>('#editText').focus();
  });
  $<HTMLFormElement>('#editForm').addEventListener('submit', e => {
    e.preventDefault();
    void sendEdit();
  });
}

interface EditAnswer {
  status: string;
  summary: string;
  explanation: string;
  conflict_rooms: string[];
  solve_time_ms: number;
  plan: AegisPlan;
  viz_plan: PlanJson | null;
}

async function sendEdit(): Promise<void> {
  const plan = currentAegisPlan(),
    text = $<HTMLTextAreaElement>('#editText').value.trim(),
    status = $('#editStatus'),
    go = $<HTMLButtonElement>('#editGo');
  if (!plan || !text || pipeline.busy) return;
  pipeline.busy = true;
  go.disabled = true;
  status.textContent = 'Solving…';
  try {
    const res = await fetch('/api/edit_text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, text, name: state.json?.name || '' })
    });
    if (!res.ok) throw new Error('the server answered ' + res.status);
    const a = (await res.json()) as EditAnswer;
    if (a.viz_plan) {
      const json = a.viz_plan,
        before = state.json?.provenance || {};
      json.provenance = Object.assign({}, json.provenance, {
        brief: before.brief,
        source: before.source,
        rank: before.rank,
        edit: text
      });
      aegisPlans.set(json, a.plan);
      setConflict([]);
      commitVersion(a.summary, nv => {
        nv.baseJson = json;
        nv.spec = null;
        nv.placed = [];
      });
      const pass = state.checks.filter(c => c.pass).length;
      status.textContent =
        a.summary + '. Solved in ' + a.solve_time_ms + ' ms; ' + pass + ' of ' + state.checks.length + ' checks pass.';
    } else {
      setConflict(a.conflict_rooms);
      syncEditMarks();
      status.textContent = a.explanation;
    }
  } catch (err) {
    status.textContent = 'The generator didn’t answer: ' + (err as Error).message + '.';
  } finally {
    pipeline.busy = false;
    go.disabled = false;
  }
}
