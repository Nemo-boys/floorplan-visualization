/* ---------- The live Module 1 pipeline (AegisPlan) ----------
   Shown only when the AegisPlan API answers on /api (served by it, or proxied by `npm run dev`). Without it, the
   pipeline card keeps the design's stand-in, so the static app and its tests are unchanged. */
import type { PlanJson } from '../engine';
import { $, esc } from './dom';
import { importPlan } from './versions';

interface Health {
  model?: { available: boolean; gguf: string | null };
}
export interface Candidate {
  rank: number;
  source: 'nemotron' | 'fallback';
  solver_status: string;
  solve_time_ms: number;
  checks_passed: number;
  total_checks: number;
  viz_plan: PlanJson;
}

export const pipeline = { online: false, model: false, busy: false, candidates: [] as Candidate[] };

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
  renderPipelineCard();
}

function engineNote(): string {
  return pipeline.model
    ? 'Nemotron Nano 9B runs on this machine; CP-SAT repairs and the rule checker validates each plan.'
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
    ? 'Generating… the local model can take a minute.'
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
      const c = pipeline.candidates[Number(b.dataset.candidate)];
      importPlan({ kind: 'generated', json: JSON.parse(JSON.stringify(c.viz_plan)) as PlanJson });
    })
  );
}
