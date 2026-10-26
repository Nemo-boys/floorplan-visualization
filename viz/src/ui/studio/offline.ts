/* The clinic's built-in assistant: common questions and actions mapped to the same tools a model would call. */
import { intentProvider, type IntentPlan } from '../../assistant/intent';
import type { Provider } from '../../assistant/types';
import { state } from '../../state';

type Results = {
  scenario: string;
  days: number;
  verdict: string;
  level: string;
  busiest: string;
  patients_seen: number;
  average_wait: string;
  average_wait_range: string;
  one_in_ten_wait_over: string;
  time_in_clinic: string;
  nurse_walk_km: number;
  last_patient_leaves: string;
  lobby_peak: string;
};
type Overview = {
  plan: {
    name: string;
    version: number;
    size_m: string;
    floor_area_m2: number;
    rooms: number;
    exam_rooms: number;
    patient_path_m: number;
    patient_path_exam: string | null;
    nurse_walk_avg_m: number;
  } | null;
  checks?: { passed: number; total: number };
};
type Room = { id: string; name: string; type: string; area_m2: number; purpose?: string };

const ref = (id: string, label: string) => `[${label}](#${id})`;
const pl = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

export function resultsText(r: Results): string {
  return `**${r.verdict}** (${r.scenario}, ${r.days} days)\n- Average wait **${r.average_wait}** (${r.average_wait_range})\n- 1 in 10 patients waits over ${r.one_in_ten_wait_over}\n- Busiest: ${r.busiest}\n- ${r.patients_seen} patients seen, ${r.time_in_clinic} in the clinic, last one leaves ${r.last_patient_leaves}`;
}

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 } as Record<string, number>;
const n = (s: string) => NUM[s] ?? parseInt(s, 10);

function plan(text: string): IntentPlan {
  const t = text.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  if (!state.P)
    return {
      calls: [],
      say: () => 'Open a plan first: pick **Layout A, B or C** on the Import step (or upload a plan.json). Then I can show rooms, run clinic days and compare layouts.'
    };

  // staffing and volume changes: "3 nurses", "add a nurse", "90 patients"
  const changes: Record<string, number> = {};
  const roles: [RegExp, string][] = [
    [/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:providers?|doctors?|physicians?)/, 'providers'],
    [/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+nurses?/, 'nurses'],
    [/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:receptionists?|front ?desk)/, 'receptionists'],
    [/(\d+)\s+(?:patients?|visits?|people)/, 'patients']
  ];
  roles.forEach(([re, k]) => {
    const m = re.exec(t);
    if (m) changes[k] = n(m[1]);
  });
  const bump = /\b(add|another|one more|extra|hire)\b.*?\b(nurse|provider|doctor|receptionist|front desk)/.exec(t);
  const cut = /\b(remove|one less|one fewer|lose|without a|drop)\b.*?\b(nurse|provider|doctor|receptionist|front desk)/.exec(t);
  const rel = bump || cut;
  if (rel && !Object.keys(changes).length) {
    const k = /nurse/.test(rel[2]) ? 'nurses' : /recep|desk/.test(rel[2]) ? 'receptionists' : 'providers';
    return relative(k, bump ? 1 : -1, has(/\b(run|simulate|what happens|how does)\b/));
  }
  if (Object.keys(changes).length) {
    const run = has(/\b(run|simulate|what happens|what if|how does|would)\b/);
    return {
      calls: [{ name: 'set_day', args: changes }, ...(run ? [{ name: 'run_simulation' }] : [])],
      say: r => {
        const now = (r[0] as { now: Record<string, number> }).now;
        const line = `Set the day to **${pl(now.providers, 'provider', 'providers')}, ${pl(now.nurses, 'nurse', 'nurses')}, ${now.receptionists} at the front desk, ${now.patients} patients**.`;
        return run ? `${line}\n\n${resultsText(r[1] as Results)}` : `${line} Press **Run** (or ask me to run it) to see how the clinic copes.`;
      }
    };
  }

  // preset days
  const preset = has(/flu/) ? 'flu' : has(/short.?staff|sick|understaff/) ? 'short' : has(/normal|typical|regular/) && has(/day|tuesday/) ? 'normal' : null;
  if (preset) {
    const run = has(/\b(run|simulate|what happens|how does|try)\b/);
    return {
      calls: [{ name: 'load_day', args: { preset } }, ...(run ? [{ name: 'run_simulation' }] : [])],
      say: r => {
        const l = r[0] as { loaded: string; providers: number; nurses: number; patients: number };
        const line = `Loaded **${l.loaded}**: ${l.providers} providers, ${l.nurses} nurses, about ${l.patients} patients.`;
        return run ? `${line}\n\n${resultsText(r[1] as Results)}` : `${line} Want me to run it?`;
      }
    };
  }

  // run
  if (has(/\b(run|simulate|start the day)\b/) && !has(/how did|did it|results?\b/) && !has(/\bway out|egress\b/))
    return { calls: [{ name: 'run_simulation' }], say: r => resultsText(r[0] as Results) };

  // results
  if (has(/result|wait|how did|bottleneck|busiest|cope|verdict|how long/))
    return {
      calls: [{ name: 'get_results' }],
      say: r => {
        const x = r[0] as Results & { none?: string };
        return x.none ? 'Nothing has run yet. Say **“run it”** and I’ll simulate 20 days.' : resultsText(x);
      }
    };

  // compare
  if (has(/compare|other layout|which layout|better layout|best layout/))
    return {
      calls: [{ name: 'compare_layouts' }],
      say: r => {
        const rows = r[0] as { layout: string; current: boolean; average_wait: string; nurse_walk_km: number }[];
        const best = [...rows].sort((a, b) => parseFloat(a.average_wait) - parseFloat(b.average_wait))[0];
        return `Same day on every layout (table is open):\n${rows.map(x => `- ${x.current ? '**' + x.layout + '** (yours)' : x.layout}: wait ${x.average_wait}, nurses walk ${x.nurse_walk_km} km`).join('\n')}\n\nShortest wait: **${best.layout}**.`;
      }
    };

  // checks
  if (has(/check|pass|fail|accessib|ada|egress|exit|code|rule/))
    return {
      calls: [{ name: 'get_checks' }],
      say: r => {
        const c = r[0] as { check: string; pass: boolean; detail: string }[];
        const bad = c.filter(x => !x.pass);
        return `**${c.length - bad.length} of ${c.length}** plan checks pass.\n${(bad.length ? bad : c.slice(0, 4)).map(x => `- ${x.pass ? '✓' : '✗'} ${x.check}: ${x.detail}`).join('\n')}`;
      }
    };

  // camera
  const cam = has(/tour/) ? 'tour' : has(/follow/) ? 'follow' : has(/\bwalk (around|through|in)|first.?person/) ? 'walk' : has(/overview|whole building|zoom out/) ? 'overview' : null;
  if (cam) return { calls: [{ name: 'set_camera', args: { mode: cam } }], say: () => (cam === 'tour' ? 'Starting the guided tour. Use the arrows at the bottom to move between stops.' : cam === 'follow' ? 'Following a patient through their visit.' : cam === 'walk' ? 'Walking mode: use the arrow keys or the pad.' : 'Back to the overview.') };

  // rooms
  const show = /\b(show|where is|where's|take me to|fly to|find|zoom (?:in )?(?:on|to))\s+(?:me\s+)?(?:the\s+|an?\s+)?(.+?)[?.!]*$/.exec(t);
  if (show)
    return {
      calls: [{ name: 'list_rooms', args: { query: show[2] } }],
      say: r => {
        const rooms = r[0] as Room[];
        if (!rooms.length) return `I couldn’t find “${show[2]}”. Try “show the lobby” or “show exam room 2”.`;
        return rooms.length === 1
          ? `Here’s ${ref(rooms[0].id, rooms[0].name)}: ${rooms[0].area_m2} m². ${rooms[0].purpose ?? ''}`
          : `${rooms.length} rooms match. Click one to fly there:\n${rooms.slice(0, 8).map(x => `- ${ref(x.id, x.name)} (${x.area_m2} m²)`).join('\n')}`;
      }
    };
  if (has(/how many rooms|exam rooms|list.*rooms|which rooms/))
    return {
      calls: [{ name: 'list_rooms', args: has(/exam/) ? { query: 'exam' } : {} }],
      say: r => {
        const rooms = r[0] as Room[];
        return `**${rooms.length}** ${has(/exam/) ? 'exam rooms' : 'rooms'}:\n${rooms.slice(0, 12).map(x => `- ${ref(x.id, x.name)} (${x.area_m2} m²)`).join('\n')}`;
      }
    };

  // the plan
  if (has(/overview|tell me about|about (this|the|it)|summar|describe|\bplan\b|layout|how big|size|area/))
    return {
      calls: [{ name: 'get_overview' }],
      say: r => {
        const o = r[0] as Overview;
        const p = o.plan!;
        return `**${p.name}**, version ${p.version}: ${p.size_m} m (${p.floor_area_m2} m²), ${p.rooms} rooms, ${p.exam_rooms} exam rooms.\n- A patient’s path, door to ${p.patient_path_exam ?? 'an exam room'} and back, is **${p.patient_path_m} m**\n- Nurses walk ${p.nurse_walk_avg_m} m per trip on average${o.checks ? `\n- ${o.checks.passed} of ${o.checks.total} plan checks pass` : ''}`;
      }
    };

  return {
    calls: [],
    say: () =>
      'I can read this plan and run clinic days on it. Try:\n- “Run a flu-season day”\n- “What if we had 3 nurses?”\n- “Show me the lobby”\n- “Compare the layouts”\n\nFor open questions, start the server with a model (Nemotron).'
  };
}

/* "add a nurse": read the day first, then set it one higher (a second planner turn). */
function relative(key: string, delta: number, run: boolean): IntentPlan {
  const c = state.scn
    ? state.scn.blocks
        .filter(b => b.enabled !== false && b.type === 'shift' && b.fields.role === (key === 'nurses' ? 'nurse' : key === 'receptionists' ? 'reception' : 'provider'))
        .reduce((s, b) => s + (Number(b.fields.count) || 0), 0)
    : 1;
  const v = Math.max(1, Math.min(10, c + delta));
  return plan(`${v} ${key}${run ? ' run' : ''}`);
}

export function offlineProvider(): Provider {
  return intentProvider(plan, 'Instant answers from the app’s own numbers. Start the server with a model for open questions.');
}
