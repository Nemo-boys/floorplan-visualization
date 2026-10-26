/* The built-in assistant: answers instantly with no model, by matching what people usually ask to the same
   tools a model would call, then writing the answer from the results. It covers the common questions and
   actions; a connected model (Nemotron) handles everything else. */
import type { ChatMessage, Provider, ToolCall } from '../../assistant/types';
import { state } from '../state';
import { findParts } from './tools';

type Results = unknown[];
interface Plan {
  calls: { name: string; args?: Record<string, unknown> }[];
  say: (r: Results) => string;
}

const ref = (id: string, label: string) => `[${label}](#${id})`;
type Status = {
  headline: 'ok' | 'risk' | 'down';
  sentence: string;
  rows: { total: number; no_backup: number; down: number };
  systems: { name: string; health: string; explain: string }[];
};
type Costs = {
  option: string;
  build_site: string;
  build_per_mw: string;
  computers: string;
  run_per_year: string;
  of_which: { electricity: string };
  total: string;
  years: number;
  per_gpu_hour: string;
  pue: number;
  energy_split: Record<string, string>;
  co2_t_per_year: number;
};
type Opt = { option: string; title: string; selected: boolean; recommended: boolean; build: string; run_per_year: string; total: string; pue: number; per_kw_month: string; racks: number; rack_kw: number };

function statusLine(s: Status): string {
  const icon = s.headline === 'ok' ? 'Safe.' : s.headline === 'risk' ? 'No backup left.' : 'Trouble.';
  const troubled = s.systems.filter((x) => x.health !== 'ok').slice(0, 3);
  return [`**${icon}** ${s.sentence}`, ...troubled.map((x) => `- ${x.explain}`)].join('\n');
}

const COOLINGS: [RegExp, string][] = [
  [/liquid|gb200|nvl/, 'liquid'],
  [/hybrid|rear.?door|h200/, 'hybrid'],
  [/\bair\b|air.?cool|l40/, 'air']
];

function plan(text: string): Plan {
  const t = text.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  const any = state.options.length > 0;

  // a new site
  if (has(/\d+(\.\d+)?\s*(mw|megawatt|kw)\b/) && (has(/\b(design|build|make|plan|create|new|want|need)\b/) || !any))
    return {
      calls: [{ name: 'new_design', args: { brief: text } }],
      say: (r) => {
        const o = r[0] as { understood?: string[]; showing?: { title: string; racks: number; build_cost: string } };
        return `Done. I read: ${(o.understood ?? []).join(', ') || 'your brief'}.\n\nThree options are ready; showing **${o.showing?.title}** with ${o.showing?.racks} racks, ${o.showing?.build_cost} to build.`;
      }
    };
  if (!any)
    return { calls: [], say: () => 'Describe the site first, for example: **“20 MW AI factory, liquid cooled, N+1 cooling, 2N power”**. I’ll design three options from it.' };

  // prove / export
  if (has(/cp-?sat|prove|solver|verify/))
    return {
      calls: [{ name: 'prove_layout' }],
      say: (r) => {
        const c = r[0] as { valid: boolean; rooms: number; doors: number; ms: number; saving_pct: number | null; status: string };
        return c.valid
          ? `**Proven.** CP-SAT checked ${c.rooms} rooms and ${c.doors} doors in ${c.ms} ms: no overlaps, every door joins rooms that touch.${c.status === 'OPTIMAL' && !c.saving_pct ? ' No shorter building fits them.' : ''}`
          : 'CP-SAT found a problem with the room layout. Open the CP-SAT card on the Design step for details.';
      }
    };
  if (has(/export|download|omniverse|usd|json/))
    return {
      calls: [{ name: 'export_design', args: { format: has(/json|data/) && !has(/usd|omniverse/) ? 'json' : 'usd' } }],
      say: (r) => `Downloaded **${(r[0] as { downloaded: string }).downloaded}**. ${has(/json|data/) && !has(/usd|omniverse/) ? 'It holds every number in the app.' : 'Open it in NVIDIA Omniverse or any USD viewer.'}`
    };

  // fix
  if (has(/\b(fix|repair|reset|undo|restore|back to normal)\b/))
    return { calls: [{ name: 'fix_everything' }], say: () => 'All repaired, back to a normal day. Everything is running with backup to spare.' };

  // scenarios
  const scen: [RegExp, string][] = [
    [/worst|everything at once|storm/, 'storm'],
    [/heat ?wave|hot day|very hot|summer/, 'heat'],
    [/grid|blackout|outage|power cut|lose power/, 'grid'],
    [/power path|path a|train a|switchgear trips/, 'path'],
    [/busier|more load|overload|run harder/, 'busy']
  ];
  const sc = scen.find(([re]) => has(re));
  if (sc && !has(/\bwhat is\b|explain/))
    return {
      calls: [{ name: 'run_scenario', args: { scenario: sc[1] } }],
      say: (r) => {
        const res = r[0] as { scenario?: { label: string; hint: string }; now: Status };
        return `**${res.scenario?.label}.** ${res.scenario?.hint}\n\n${statusLine(res.now)}`;
      }
    };

  // temperature or load numbers
  const temp = /(-?\d+(?:\.\d+)?)\s*(°\s*c|degrees|deg|c\b)/.exec(t);
  const load = /(\d+(?:\.\d+)?)\s*%/.exec(t);
  if ((temp || load) && has(/outside|temp|hot|degree|°|load|%|harder|work/))
    return {
      calls: [{ name: 'set_conditions', args: { ...(temp ? { outdoor_c: Number(temp[1]) } : {}), ...(load ? { load: Number(load[1]) / 100 } : {}) } }],
      say: (r) => statusLine(r[0] as Status)
    };

  // break a part
  const brkWhat =
    /\b(?:break|fail|kill|turn off|switch off|shut down|disable|lose)\s+(?:the\s+|a\s+|one\s+)?(.+?)[?.!]*$/.exec(t)?.[1] ??
    /\bif\s+(?:the\s+|a\s+|one\s+)?(.+?)\s+(?:breaks|fails|dies|goes down|stops|trips)\b/.exec(t)?.[1];
  if (brkWhat) {
    const found = findParts(brkWhat);
    const target = found.find((e) => !['rack', 'battery'].includes(e.kind));
    if (!target)
      return { calls: [], say: () => `I couldn’t find “${brkWhat}” to break. Try “break cooler 2”, “break UPS A1” or “break generator 3”.` };
    return {
      calls: [{ name: 'break_parts', args: { ids: [target.id] } }],
      say: (r) => {
        const res = r[0] as { now: Status };
        return `I broke ${ref(target.id, target.label)}.\n\n${statusLine(res.now)}\n\nSay **“fix everything”** to repair it.`;
      }
    };
  }

  // single-failure sweep
  if (has(/surviv|single (point|failure)|n\+1|any one|weak spot|redundan/))
    return {
      calls: [{ name: 'test_single_failures' }],
      say: (r) => {
        const rows = r[0] as { kind: string; count: number; survives_any_one: boolean; weak_spot: string | null }[];
        const weak = rows.filter((x) => !x.survives_any_one);
        return weak.length
          ? `${state.conditions.failed.size ? 'With what’s already broken, n' : 'N'}ot quite. These can’t lose one more unit safely:\n${weak.map((x) => `- ${x.kind.replace(/ \(.*\)/, '')}: try ${ref(x.weak_spot!, 'this one')}`).join('\n')}`
          : `**Yes.** I broke all ${rows.reduce((a, x) => a + x.count, 0)} parts one at a time — every kind can lose one unit and every rack keeps running:\n${rows.map((x) => `- ${x.kind.replace(/ \(.*\)/, '')} (${x.count})`).join('\n')}`;
      }
    };

  // switch option
  const cool = COOLINGS.find(([re]) => has(re));
  if (cool && has(/\b(switch|change|show|use|pick|go|try|see|select|open)\b/))
    return {
      calls: [{ name: 'select_option', args: { option: cool[1] } }],
      say: (r) => {
        const s = r[0] as { title: string; racks: number; rack_kw: number; build_cost: string; pue: number; recommended: boolean };
        return `Showing **${s.title}**: ${s.racks} racks at ${s.rack_kw} kW, ${s.build_cost} to build, PUE ${s.pue}.${s.recommended ? ' This is the one I recommend.' : ''}`;
      }
    };

  // lenses and camera
  const lens = /\b(heat|power|backup|layout)\b/.exec(t);
  if (lens && has(/\b(show|lens|view|see|colou?r|where)\b/) && !has(/cost|bill|price/))
    return {
      calls: [{ name: 'set_view', args: { lens: lens[1] } }],
      say: () =>
        ({
          heat: 'Here’s the **Heat** lens: colours show the air temperature in front of each rack, and the dots show air flowing through the racks.',
          power: 'Here’s the **Power** lens: racks coloured by how much power they draw, and the two power paths lit up.',
          backup: 'Here’s the **Backup** lens: green has a spare, amber has no backup left, red is down.',
          layout: 'Back to the normal view.'
        })[lens[1]] ?? 'Done.'
    };
  if (has(/step inside|walk|inside the hall/)) return { calls: [{ name: 'set_view', args: { camera: 'inside' } }], say: () => 'You’re standing in a cold aisle now. Drag to look around.' };
  if (has(/from above|top view|bird/)) return { calls: [{ name: 'set_view', args: { camera: 'top' } }], say: () => 'Here’s the view from above.' };

  // money settings: "electricity at 15 cents", "over 10 years", "$0.12 per kWh"
  const cents = /(\d+(?:\.\d+)?)\s*(?:cents?|¢)/.exec(t);
  const dollars = /\$\s*(0?\.\d+)\s*(?:\/|per)?\s*kwh/.exec(t);
  const yrs = /\b(?:over|for)\s+(\d{1,2})\s*(?:years?|yrs?)\b/.exec(t);
  if (cents || dollars || yrs)
    return {
      calls: [
        {
          name: 'set_money',
          args: { ...(cents ? { price_kwh: Number(cents[1]) / 100 } : dollars ? { price_kwh: Number(dollars[1]) } : {}), ...(yrs ? { years: Number(yrs[1]) } : {}) }
        }
      ],
      say: (r) => {
        const c = r[0] as Costs;
        return `Updated for every option. This one now costs **${c.run_per_year} a year** to run (${c.of_which.electricity} electricity), and **${c.total} over ${c.years} years**.`;
      }
    };

  // costs and energy
  if (has(/pue|electric|energy|power bill|kwh|carbon|co2|co₂/))
    return {
      calls: [{ name: 'get_costs' }],
      say: (r) => {
        const c = r[0] as Costs;
        return `The PUE is **${c.pue}**: of all the electricity, ${c.energy_split.computers} reaches the computers, ${c.energy_split.cooling} goes to cooling and ${c.energy_split.power_losses} is lost in the power chain.\n\nThat’s **${c.of_which.electricity} a year** in electricity and about ${c.co2_t_per_year.toLocaleString('en-US')} t of CO₂.`;
      }
    };
  if (has(/cost|price|expensive|cheap|money|budget|spend|tco|\$|how much/))
    return {
      calls: [{ name: 'get_costs' }],
      say: (r) => {
        const c = r[0] as Costs;
        return `For this option:\n- **${c.build_site}** to build the site (${c.build_per_mw} per MW)\n- **${c.computers}** for the computers\n- **${c.run_per_year} a year** to run it (${c.of_which.electricity} is electricity)\n\nThat’s **${c.total} over ${c.years} years**, or ${c.per_gpu_hour} per GPU-hour.`;
      }
    };

  // compare / why
  if (has(/compare|differen|versus|\bvs\b|which (one|is better|should)|best option|options/))
    return {
      calls: [{ name: 'list_options' }],
      say: (r) => {
        const os = r[0] as unknown as Opt[];
        return `${os.map((o) => `- **${o.title}**${o.recommended ? ' (recommended)' : ''}: ${o.racks} × ${o.rack_kw} kW racks, ${o.build} to build, ${o.run_per_year}/yr to run, PUE ${o.pue}, ${o.per_kw_month} per kW-month`).join('\n')}`;
      }
    };
  if (has(/\bwhy\b|recommend/))
    return {
      calls: [{ name: 'list_options' }],
      say: (r) => {
        const os = r[0] as unknown as Opt[];
        const rec = os.find((o) => o.recommended)!;
        const others = os.filter((o) => o !== rec);
        const matched = state.basis.cooling === rec.option;
        return `I recommend **${rec.title}**${matched ? ' because your brief asked for it' : ' because it’s the cheapest to build and run of the options that pass every check'}. It has a PUE of ${rec.pue}, against ${others.map((o) => `${o.pue} for ${o.title.toLowerCase()}`).join(' and ')}, so less electricity goes to cooling.`;
      }
    };

  // checks
  if (has(/check|rule|code|safe|pass|fail/))
    return {
      calls: [{ name: 'get_checks' }],
      say: (r) => {
        const cs = r[0] as unknown as { title: string; pass: boolean; measured: string }[];
        const bad = cs.filter((c) => !c.pass);
        return bad.length
          ? `${bad.length} check${bad.length > 1 ? 's need' : ' needs'} a look:\n${bad.map((c) => `- ${c.title} — ${c.measured}`).join('\n')}`
          : `All ${cs.length} checks pass:\n${cs.map((c) => `- ${c.title}`).join('\n')}`;
      }
    };

  // status
  if (has(/status|running|what happen|is it ok|still work|down\b|broken/))
    return { calls: [{ name: 'get_status' }], say: (r) => statusLine(r[0] as Status) };

  // explain a thing
  const what = /\b(what(?:'s| is| are| does)|explain|tell me about|meaning of)\s+(?:an?\s+|the\s+)?(.+?)[?.!]*$/.exec(t);
  if (what && !/^(it|this|that|this design|the design|this site)$/.test(what[2]))
    return {
      calls: [{ name: 'explain', args: { topic: what[2] } }],
      say: (r) => {
        const e = r[0] as { topic: string; text: string | null };
        return e.text ? `**${e.topic}.** ${e.text}` : `I don’t have “${what[2]}” in my notes. Connect Nemotron for open questions, or ask me about a part of this design.`;
      }
    };

  // counts and the design itself
  if (has(/how many|how big|size|gpu|rack|tell me about (it|this)|overview|summar|about this|describe/))
    return {
      calls: [{ name: 'get_overview' }],
      say: (r) => {
        const o = r[0] as { showing: { title: string; hardware: string; racks: number; rack_kw: number; gpus: number; halls: number; building_m: string; checks_passed: string; pue: number; build_cost: string } };
        const s = o.showing;
        return `**${s.title}** (${s.hardware}).\n- ${s.racks.toLocaleString('en-US')} racks at ${s.rack_kw} kW, ${s.gpus.toLocaleString('en-US')} GPUs\n- ${s.halls} data hall${s.halls > 1 ? 's' : ''} in a ${s.building_m} m building\n- ${s.checks_passed} checks pass, PUE ${s.pue}, ${s.build_cost} to build`;
      }
    };

  return {
    calls: [],
    say: () =>
      'I can answer questions about this design and act on it. Try:\n- “What does it cost?”\n- “Break cooler 2”\n- “What happens in a heat wave?”\n- “Can it survive any one failure?”\n\nFor open-ended questions, connect a model (Nemotron) to the server.'
  };
}

export function offlineProvider(): Provider {
  let pending: Plan | null = null;
  return {
    id: 'builtin',
    label: 'Built-in',
    detail: 'Instant answers from the app’s own numbers. Start the server with a model for open questions.',
    live: false,
    async chat({ messages }) {
      const last = messages[messages.length - 1];
      if (last.role === 'tool' && pending) {
        // the results of this turn's calls, in order
        let i = messages.length - 1;
        while (i > 0 && messages[i].role === 'tool') i--;
        const results = messages.slice(i + 1).map((m: ChatMessage) => {
          try {
            return JSON.parse(m.content) as unknown;
          } catch {
            return {};
          }
        });
        const p = pending;
        pending = null;
        const err = results.find((x) => x && typeof x === 'object' && 'error' in x) as { error?: string } | undefined;
        return { text: err?.error ? `I couldn’t do that: ${err.error}` : p.say(results), toolCalls: [] };
      }
      const user = [...messages].reverse().find((m) => m.role === 'user');
      const p = plan(user?.content ?? '');
      if (!p.calls.length) return { text: p.say([]), toolCalls: [] };
      pending = p;
      const stamp = Date.now();
      const calls: ToolCall[] = p.calls.map((c, k) => ({ id: `local_${stamp}_${k}`, name: c.name, arguments: JSON.stringify(c.args ?? {}) }));
      return { text: '', toolCalls: calls };
    }
  };
}
