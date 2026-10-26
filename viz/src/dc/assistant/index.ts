/* The data center studio's assistant: the shared chat panel with this app's tools, context and first words. */
import { createChatPanel, type ChatPanel } from '../../assistant/panel';
import { detectRemote, remoteProvider } from '../../assistant/providers';
import { fmtPower } from '../engine/brief';
import { fmtMoney } from '../engine/cost';
import { evaluate } from '../engine/status';
import { current, emit, on, state } from '../state';
import { ICONS, h } from '../ui/dom';
import { getStage } from '../ui/stage';
import { offlineProvider } from './offline';
import { TOOLS, overview } from './tools';

const PROMPT = `You are the assistant inside Data Center Studio, a browser app (part of Floorplan Intelligence, built on AegisPlan) that designs AI data centers from a one-line brief, shows them in 3D, breaks things to test them, and estimates cost. The same pipeline also designs outpatient clinics; this screen is the data center one.

Who you talk to: anyone, including a high-school student. Use plain words and short sentences. Explain jargon in a few words the first time (e.g. "PUE, the energy overhead").

How you work:
- Never guess a number. Call a tool (get_overview, list_options, get_costs, get_status, get_checks, find_parts) and quote what it returns.
- When asked to do something (break or fix a part, run a what-if, switch option, show a lens, change a price, design a new site), do it with a tool, then say in one or two sentences what changed and why.
- To break a part by name, call find_parts first to get its id, then break_parts.
- Keep answers under 90 words unless asked for more. Use **bold** for the key number and short bullet lists to compare.
- Link parts and rooms as [label](#id), e.g. [Liquid cooler 1.1](#cdu_h1_1), so people can click to fly there. Only use ids a tool returned.
- These are planning estimates, not an engineer's sign-off. Say so if someone asks about building it for real.`;

function context(): string {
  const o = current();
  const snap: Record<string, unknown> = { now: overview() };
  if (o && (state.conditions.failed.size || state.conditions.load !== 1 || state.conditions.outdoorC !== 25)) {
    const r = evaluate(o.design, state.conditions);
    snap.test = { headline: r.headline, sentence: r.sentence, broken: [...state.conditions.failed] };
  }
  if (state.pick) snap.picked = state.pick;
  return `${PROMPT}\n\nLive context (JSON):\n${JSON.stringify(snap)}`;
}

function suggestions(): string[] {
  if (!state.options.length) return ['Design a 20 MW AI factory, liquid cooled', 'Design a 2 MW edge site, air cooled', 'What can you do?'];
  switch (state.step) {
    case 'test':
      return ['What if the grid goes down?', 'Can it survive any one failure?', 'Run a heat wave', 'Fix everything'];
    case 'cost':
      return ['Compare the options', 'Electricity at 15 cents', 'Where does the energy go?', 'Over 10 years'];
    default:
      return ['Why this one?', 'Break a cooler', 'What does it cost?', 'Show me the heat'];
  }
}

function welcome(): string {
  const o = current()!;
  const d = o.design;
  const matched = state.basis.cooling === d.profile.key;
  const passed = o.checks.filter((c) => c.pass).length;
  return `Here are **three ways** to build your ${fmtPower(state.basis.itKw)} site. I recommend **${d.title}**${
    matched ? ', as your brief asked' : ', the cheapest to build and run of those that pass every check'
  }: ${d.racks.toLocaleString('en-US')} racks, **${fmtMoney(o.cost.facility)}** to build, PUE ${o.cost.pue.toFixed(2)}, ${passed} of ${o.checks.length} checks pass.\n\nAsk me anything about it, or I can break something to see what keeps running.`;
}

export function mountAssistant(): { panel: ChatPanel; button: HTMLElement } {
  const offline = offlineProvider();
  let busy = false;
  const panel = createChatPanel({
    title: 'Assistant',
    emptyTitle: 'Ask about your data center',
    emptyText: 'I can read every number on screen, break things, run what-ifs and compare costs.',
    placeholder: 'Ask or tell me what to do…',
    tools: TOOLS,
    system: context,
    suggestions,
    onRef: (id) => {
      const d = current()?.design;
      if (!d) return;
      const isEquip = d.equipment.some((e) => e.id === id);
      if (!isEquip && !d.rooms.some((r) => r.id === id)) return;
      state.pick = { kind: isEquip ? 'equip' : 'room', id };
      emit('pick');
      getStage().focus(id);
    },
    onReset: () => {
      if (state.options.length) panel.say(welcome(), undefined, { peek: false });
    }
  });
  panel.setProviders([offline]);
  detectRemote().then((info) => info && panel.setProviders([remoteProvider(info), offline]));

  // top-bar button with an unread dot
  const dot = h('span', { class: 'unread', 'aria-hidden': 'true' });
  const button = h('button', { class: 'icon-btn assistant-btn', type: 'button', 'aria-pressed': 'false', title: 'Assistant (⌘J)', onclick: () => panel.toggle() });
  button.innerHTML = `${ICONS.sparkle}<span class="label">Assistant</span>`;
  button.append(dot);
  panel.onChange((s) => {
    busy = s.busy;
    button.setAttribute('aria-pressed', String(s.open));
    dot.textContent = s.unread ? String(s.unread) : '';
    dot.classList.toggle('on', s.unread > 0);
  });

  // ---------- speaking first ----------
  let greeted = '';
  on('options', () => {
    const o = current();
    if (!o || greeted === o.design.id + state.brief) return;
    greeted = o.design.id + state.brief;
    if (busy) return; // it was the assistant itself that designed it; its answer says so
    setTimeout(() => panel.say(welcome()), 700);
  });
  const nudged = new Set<string>();
  on('step', () => {
    const o = current();
    if (!o || busy || (state.step !== 'test' && state.step !== 'cost')) return;
    const key = `${state.step}|${state.brief}`;
    if (nudged.has(key)) return;
    nudged.add(key);
    if (state.step === 'test')
      panel.say('This is where you break things. Tap a **what-if** on the left, or click any part and press **Break it**. Or just ask me, e.g. “what if the grid goes down?”', undefined, { peek: false });
    else {
      const c = o.cost;
      panel.say(
        `**${o.design.title}**: ${fmtMoney(c.facility)} to build and ${fmtMoney(c.opexYear)} a year to run. The computers themselves cost ${fmtMoney(c.it)}${c.it > c.facility ? ', more than the building' : ''}. Want me to compare the options or try another electricity price?`,
        undefined,
        { peek: false }
      );
    }
  });
  // when something the person broke takes rows down, explain it (only while the chat is open)
  let lastHeadline = 'ok';
  let timer = 0;
  on('conditions', () => {
    const o = current();
    if (!o) return;
    const r = evaluate(o.design, state.conditions);
    const was = lastHeadline;
    lastHeadline = r.headline;
    if (busy || !panel.isOpen() || r.headline !== 'down' || was === 'down') return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const bad = r.pools.filter((p) => p.health === 'down').slice(0, 2);
      panel.say(`That took rows down. ${r.sentence}\n${bad.map((p) => `- ${p.sentence}`).join('\n')}`, ['Why?', 'How do I fix it?', 'Fix everything']);
    }, 500);
  });

  return { panel, button };
}
