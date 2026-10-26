/* The studio look's runtime parts (deviations.md #10): the brand mark, a light/dark switch, Simulate's quick
   setup and the shared assistant with the clinic's tools. Nothing here runs with ?look=reference. */
import { createChatPanel } from '../../assistant/panel';
import { detectRemote, remoteProvider } from '../../assistant/providers';
import { fmtClock, fmtMin } from '../../engine';
import { state } from '../../state';
import { focusRoom } from '../../view3d/marks';
import { $ } from '../dom';
import { onRoomTap } from '../review';
import { resize } from '../resize';
import { moveGlider } from '../stepper';
import { STUDIO } from './look';
import { offlineProvider, resultsText } from './offline';
import { initQuick } from './quick';
import { TOOLS, overview } from './tools';

const ICON = {
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
};

const PROMPT = `You are the assistant inside Floorplan Intelligence, a browser app (built on AegisPlan) where a team brings in an outpatient clinic floor plan, reviews it in 3D, simulates clinic days with patients, nurses, providers and front-desk staff, and exports it for Blender. The same pipeline also designs data centers; this screen is the clinic one.

Who you talk to: clinic managers, architects, students. Plain words, short sentences.

How you work:
- Never guess a number. Call a tool (get_overview, list_rooms, get_checks, get_day, get_results) and quote what it returns.
- When asked to do something (show a room, change staff or patients, load a preset day, run the simulation, compare layouts, change the camera, switch step), do it with a tool, then say in one or two sentences what changed and what it means.
- For "what if" questions: set_day (or load_day), then run_simulation, then compare with the previous result if there was one.
- Keep answers under 90 words unless asked for more. Use **bold** for the key number.
- Link rooms as [label](#id), e.g. [Exam 2](#exam_room_2), so people can click to fly there. Only use ids a tool returned.
- Results are averages over simulated days, a planning aid, not a guarantee.`;

function themeToggle(): HTMLButtonElement {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('fi.theme');
    if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  } catch {
    /* storage blocked: follow the system */
  }
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn';
  b.setAttribute('aria-label', 'Switch light or dark');
  const paint = () => (b.innerHTML = isDark() ? ICON.sun : ICON.moon);
  b.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try {
      localStorage.setItem('fi.theme', root.dataset.theme);
    } catch {
      /* this visit only */
    }
    paint(); // the 3D scene and canvases repaint from the MutationObserver in app.ts
  });
  paint();
  return b;
}

function mountAssistant(): void {
  const app = $('#app');
  let busy = false;
  const panel = createChatPanel({
    title: 'Assistant',
    emptyTitle: 'Ask about your clinic',
    emptyText: 'I can read the plan, fly to any room, change who works, run clinic days and compare layouts.',
    placeholder: 'Ask or tell me what to do…',
    tools: TOOLS,
    system: () => `${PROMPT}\n\nLive context (JSON):\n${JSON.stringify(overview())}`,
    suggestions: () => {
      if (!state.P) return ['What can you do?', 'Which layout should I start with?'];
      if (state.step === 'simulate')
        return state.run
          ? ['How did it go?', 'What if we add a nurse?', 'Run a flu-season day', 'Compare the layouts']
          : ['Run a normal day', 'What if we had 3 nurses?', 'Run a flu-season day', 'Short-staffed day'];
      return ['Tell me about this plan', 'Show me the lobby', 'Do the plan checks pass?', 'Start the guided tour'];
    },
    onRef: id => {
      const r = state.P?.m.rooms.find(x => x.id === id);
      if (!r) return;
      onRoomTap(r);
      focusRoom(r);
    },
    onReset: () => welcome(false)
  });
  const offline = offlineProvider();
  panel.setProviders([offline]);
  detectRemote().then(info => info && panel.setProviders([remoteProvider(info), offline]));
  document.body.append(panel.el, panel.peek);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn assistant-btn';
  btn.title = 'Assistant (⌘J)';
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = `${ICON.spark}<span class="label">Assistant</span><span class="unread" aria-hidden="true"></span>`;
  btn.addEventListener('click', () => panel.toggle());
  const dot = btn.querySelector('.unread') as HTMLElement;
  $('.topbar .actions').append(btn, themeToggle());
  let wasOpen = false;
  panel.onChange(s => {
    busy = s.busy;
    btn.setAttribute('aria-pressed', String(s.open));
    dot.textContent = s.unread ? String(s.unread) : '';
    dot.classList.toggle('on', s.unread > 0);
    if (s.open !== wasOpen) {
      wasOpen = s.open;
      app.classList.toggle('chat-open', s.open);
      setTimeout(() => {
        resize();
        moveGlider();
      }, 300);
    }
  });

  // ---------- speaking first ----------
  function welcome(peek = true): void {
    if (!state.P) {
      panel.say('Hi! Pick a sample layout (or upload a plan.json) and I’ll walk you through it, run clinic days on it and compare layouts.', undefined, { peek: false });
      return;
    }
    const o = overview().plan!;
    panel.say(
      `This is **${o.name}**: ${o.rooms} rooms with ${o.exam_rooms} exam rooms in ${o.floor_area_m2} m². A patient’s path, from the door to ${o.patient_path_exam ?? 'an exam room'} and back, is **${o.patient_path_m} m**.\n\nAsk me about any room, or say “run a normal day” to see how it copes.`,
      ['Show me the lobby', 'Start the guided tour', 'Run a normal day'],
      { peek }
    );
  }
  let greetedPlan = '';
  let nudgedSim = false;
  let lastRun = '';
  new MutationObserver(() => {
    if (busy) {
      if (state.run) lastRun = state.run.id; // the assistant ran it; its own answer says how it went
      return;
    }
    const v = state.versions[state.vIndex];
    const key = v ? `${v.name}|${v.n}` : '';
    if (state.step === 'review' && key && key !== greetedPlan && !greetedPlan.startsWith(v.name + '|')) {
      greetedPlan = key;
      setTimeout(() => welcome(), 600);
    } else if (key) greetedPlan = key;
    if (state.step === 'simulate' && !nudgedSim && !state.run) {
      nudgedSim = true;
      panel.say('Pick a kind of day, set who works and how many patients come, then press **Run**. Or just ask me, e.g. “what if we had 3 nurses?”', undefined, { peek: false });
    }
    const r = state.run;
    if (r && r.id !== lastRun) {
      lastRun = r.id;
      const a = r.sum.agg;
      panel.say(
          r.kind === 'range'
            ? `The range is done: ${r.sweep!.rows.map(x => `${x.value} → ${x.v.title.toLowerCase()}, wait ${fmtMin(x.agg.avgWait.mean)}`).join('; ')}.`
            : resultsText({
                scenario: r.name,
                days: r.sum.n,
                verdict: r.v.title,
                level: r.v.level,
                busiest: `${r.v.bottleneck.name} at ${Math.round(r.v.bottleneck.util * 100)}%`,
                patients_seen: Math.round(a.seen.mean),
                average_wait: fmtMin(a.avgWait.mean),
                average_wait_range: `${fmtMin(a.avgWait.lo)} to ${fmtMin(a.avgWait.hi)}`,
                one_in_ten_wait_over: fmtMin(a.p90Wait.mean),
                time_in_clinic: fmtMin(a.avgTime.mean),
                nurse_walk_km: a.nurseKm.mean,
                last_patient_leaves: fmtClock(a.lastExit.mean),
                lobby_peak: ''
              }),
          ['Why is that?', 'What if we add a nurse?', 'Compare the layouts']
        );
    }
  }).observe(app, { attributes: true, attributeFilter: ['class'] });
}

export function initStudio(): void {
  if (!STUDIO) return;
  if (!document.querySelector('link[href*="family=Inter"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.append(l);
  }
  const brand = $('.topbar .brand');
  const logo = document.createElement('span');
  logo.className = 'logo';
  logo.setAttribute('aria-hidden', 'true');
  logo.innerHTML = ICON.logo;
  const text = document.createElement('div');
  text.append(...brand.childNodes);
  brand.append(logo, text);
  initQuick();
  mountAssistant();
}
