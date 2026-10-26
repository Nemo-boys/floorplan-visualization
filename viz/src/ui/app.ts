/* ---------- Bindings, the render loop and startup ---------- */
import { clamp, type PlanJson } from '../engine';
import { planPeople } from '../plan2d/overlay';
import { state, type EditTool, type ViewMode } from '../state';
import { applyOrbit, fitCamera, orbit, setView, updateFollow, updateWalk, walker } from '../view3d/cameras';
import { initThree, setSun } from '../view3d/init';
import { highlightRoom, pulseMarks } from '../view3d/marks';
import { updatePeople } from '../view3d/people';
import { removeSelected, rotateSelected, selectItem, startPlacing, stopPlacing } from '../view3d/placement';
import { R3 } from '../view3d/r3';
import { buildLabels, buildWalls, paintHeat } from '../view3d/scene';
import { endTour, nextTourStop, prevTourStop, startTour, tour, updateTour } from '../view3d/tour';
import { toggleChat } from './assistant';
import { applyDock, bindDock, loadDock, setDockOpen } from './dock';
import { $, reduceMotion } from './dom';
import { applyRename, applySwap, enterEdit, exitEdit, renderEditTools, renderPlanHint, syncEditMarks } from './edit';
import { renderSampleThumbs, updatePlanHeader } from './import';
import { ROLE_DOTS } from './icons';
import { bindExport, renderExport } from './export-step';
import { refreshPlanOverlay } from './plan-panel';
import { resize } from './resize';
import { onTourStop, renderReviewInfo, roomNow } from './review';
import { initSimulate } from './simulate';
import { STEPS, is2DVisible, is3DVisible, moveGlider, setStep } from './stepper';
import { applyTheme } from './theme';
import { dayDone, dayRange, drawTimeline, resetSim, seek, updateLive, updateTransport } from './transport';
import { importPlan } from './versions';
import { initPipeline } from './pipeline';
import { initPanelToggles } from './panels';
import { initStudio } from './studio';

export function bindUI(): void {
  document
    .querySelectorAll<HTMLButtonElement>('[data-step]')
    .forEach(b => b.addEventListener('click', () => setStep(b.dataset.step as string)));
  $('#stepper').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-step]')].filter(b => !b.disabled),
      i = tabs.findIndex(b => b.dataset.step === state.step);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (n) {
      setStep(n.dataset.step as string);
      n.focus();
    }
  });
  document
    .querySelectorAll<HTMLButtonElement>('[data-next]')
    .forEach(b => b.addEventListener('click', () => setStep(b.dataset.next as string)));
  $('#openPipeline').addEventListener('click', () => importPlan({ kind: 'pipeline', key: 'A' }));
  document
    .querySelectorAll<HTMLButtonElement>('[data-sample]')
    .forEach(b => b.addEventListener('click', () => importPlan({ kind: 'sample', key: b.dataset.sample as string })));
  $<HTMLInputElement>('#fileInput').addEventListener('change', e => {
    const input = e.target as HTMLInputElement,
      f = input.files && input.files[0],
      msg = $('#fileMsg');
    if (!f) return;
    f.text()
      .then(t => {
        const json = JSON.parse(t) as PlanJson;
        importPlan({ kind: 'file', json, file: f.name });
        state.uploaded = json;
        msg.hidden = true;
      })
      .catch((err: Error) => {
        msg.hidden = false;
        msg.textContent =
          'Couldn’t read ' +
          f.name +
          ': ' +
          err.message +
          '. The page expects plan.json v0.1: rooms with "rect" or "polygon_mm", and doors with "center_mm".';
      });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b =>
    b.addEventListener('click', () => {
      const v = b.dataset.view as ViewMode;
      if (v === 'tour') startTour(0);
      else if (state.view === 'tour') {
        endTour();
        if (v !== 'orbit') setView(v);
      } else setView(v);
    })
  );
  document.querySelectorAll<HTMLButtonElement>('[data-walls]').forEach(b =>
    b.addEventListener('click', () => {
      state.walls = b.dataset.walls as 'cut' | 'full';
      document
        .querySelectorAll<HTMLElement>('[data-walls]')
        .forEach(x => x.setAttribute('aria-pressed', String(x.dataset.walls === state.walls)));
      buildWalls();
      syncEditMarks();
    })
  );
  $('#tourPlay').addEventListener('click', () => {
    tour.playing = !tour.playing;
    if (tour.playing && tour.phase === 'dwell' && tour.t >= tour.dwell) nextTourStop();
    onTourStop(tour.i, tour.stops.length, tour.stops[tour.i]);
  });
  $('#tourPrev').addEventListener('click', prevTourStop);
  $('#tourNext').addEventListener('click', nextTourStop);
  $('#tourExit').addEventListener('click', endTour);
  const route = (id: string, key: 'journey' | 'staff' | 'egress'): void =>
    $(id).addEventListener('change', e => {
      const on = (e.target as HTMLInputElement).checked;
      state.planRoutes[key] = on;
      state.routes[key] = on;
      if (R3 && R3.routeMeshes) R3.routeMeshes[key].visible = on;
      refreshPlanOverlay();
    });
  route('#rJourney', 'journey');
  route('#rStaff', 'staff');
  route('#rEgress', 'egress');
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b =>
    b.addEventListener('click', () => {
      state.editTool = b.dataset.tool as EditTool;
      if (state.editTool !== 'furniture') stopPlacing();
      state.swapSel = [];
      state.renameSel = null;
      if (state.editing && state.editTool !== 'furniture') setDockOpen(true);
      renderEditTools();
      renderPlanHint();
      refreshPlanOverlay();
    })
  );
  $('#editToggle').addEventListener('click', () => (state.editing ? exitEdit() : enterEdit()));
  $('#doneEditing').addEventListener('click', () => exitEdit());
  bindDock();
  $('#swapApply').addEventListener('click', applySwap);
  $('#swapClear').addEventListener('click', () => {
    state.swapSel = [];
    renderEditTools();
    refreshPlanOverlay();
  });
  $('#renameSave').addEventListener('click', applyRename);
  $('#renameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') applyRename();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-place]').forEach(b =>
    b.addEventListener('click', () => {
      if (state.placing === b.dataset.place) stopPlacing();
      else startPlacing(b.dataset.place as string);
      renderEditTools();
    })
  );
  $('#rotateBtn').addEventListener('click', rotateSelected);
  $('#removeBtn').addEventListener('click', removeSelected);
  $('#playBtn').addEventListener('click', () => {
    if (state.sim && state.sim.done) resetSim(0);
    state.playing = !state.playing;
    updateTransport();
  });
  $('#restartBtn').addEventListener('click', () => {
    resetSim(0);
    updateTransport();
  });
  document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b =>
    b.addEventListener('click', () => {
      state.speed = +(b.dataset.speed as string);
      document
        .querySelectorAll<HTMLElement>('[data-speed]')
        .forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    })
  );
  $('#tl').addEventListener('click', e => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(),
      d = dayRange(state.sim as NonNullable<typeof state.sim>);
    seek(d.t0 + clamp((e.clientX - r.left) / r.width, 0, 1) * (d.t1 - d.t0));
  });
  $('#closeCompare').addEventListener('click', () => {
    $('#comparePanel').hidden = true;
  });
  $('#lyrTraffic').addEventListener('change', e => {
    const on = (e.target as HTMLInputElement).checked;
    state.layers.traffic = on;
    if (R3 && R3.heat) R3.heat.mesh.visible = on;
    if (on) paintHeat();
  });
  $('#lyrWaits').addEventListener('change', e => {
    state.layers.waits = (e.target as HTMLInputElement).checked;
  });
  bindExport();
  $('#assistantBtn').addEventListener('click', () => toggleChat());
  $('#chatClose').addEventListener('click', () => toggleChat(false));
  window.addEventListener('keydown', e => {
    if (/input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (state.placing) stopPlacing();
      else if (state.selected) selectItem(null);
      else if (state.view === 'tour') endTour();
      else if (state.view !== 'orbit') setView('orbit');
      renderEditTools();
      return;
    }
    if (k === 'r' && state.editing) {
      rotateSelected();
      return;
    }
    if ((k === 'delete' || k === 'backspace') && state.selected) {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (
      state.view === 'walk' &&
      ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)
    ) {
      walker.keys.add(k);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => walker.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => walker.keys.clear());
  document.querySelectorAll<HTMLElement>('[data-pad]').forEach(b => {
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      walker.pad.add(b.dataset.pad as string);
    });
    const stop = (): boolean => walker.pad.delete(b.dataset.pad as string);
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointerleave', stop);
    b.addEventListener('pointercancel', stop);
  });
  const toOrbit = (): void => {
    if (state.view !== 'orbit') {
      if (state.view === 'tour') endTour();
      else setView('orbit');
    }
  };
  $('#zoomIn').addEventListener('click', () => {
    toOrbit();
    orbit.goal.r = clamp(orbit.goal.r * 0.78, 5, 90);
  });
  $('#zoomOut').addEventListener('click', () => {
    toOrbit();
    orbit.goal.r = clamp(orbit.goal.r * 1.28, 5, 90);
  });
  $('#zoomFit').addEventListener('click', () => {
    toOrbit();
    fitCamera();
    highlightRoom(null);
    state.selectedRoom = null;
    renderReviewInfo();
    refreshPlanOverlay();
  });
}
/* Planned difference 3 (PLAN.md): the badge names the renderer in use. */
export function rendererNote(): void {
  const badge = $('#rendererBadge');
  if (!R3) {
    badge.textContent = '3D off';
    badge.title = 'The 3D renderer didn’t start in this browser.';
    return;
  }
  badge.textContent = R3.kind === 'webgpu' ? 'WebGPU' : 'WebGL2';
  badge.title =
    R3.kind === 'webgpu' ? 'Rendering with WebGPU.' : 'Rendering with WebGL2. WebGPU isn’t available in this browser.';
}
let last = performance.now(),
  lastSun = 0,
  lastHeat = 0,
  lastPeople2d = 0,
  lastCaption = 0;
export function loop(ts: number): void {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
  last = ts;
  const sim = state.sim;
  if (state.P && sim && state.playing && !sim.done) {
    sim.advanceTo(sim.now + dt * state.speed);
    if (sim.done) dayDone();
  }
  if (is3DVisible() && state.P && R3) {
    if (ts - lastSun > 400) {
      setSun(sim ? sim.now : 90);
      lastSun = ts;
    }
    R3.tex.chevron.offset.x -= dt * 0.9;
    updatePeople(dt);
    pulseMarks(ts);
    if (state.view === 'orbit') applyOrbit(dt);
    else if (state.view === 'walk') updateWalk(dt);
    else if (state.view === 'tour') updateTour(dt);
    else updateFollow(dt);
    R3.renderer.render(R3.scene, R3.camera);
  }
  if (state.P) {
    updateLive(false);
    if (is2DVisible() && ts - lastPeople2d > 140) {
      planPeople(document.querySelector('#plan2d svg'), state.P, sim, ROLE_DOTS);
      lastPeople2d = ts;
    }
    if (ts - lastCaption > 700) {
      if (state.view === 'tour') {
        const el = $('#capNow'),
          st = tour.stops[tour.i];
        if (el && st && st.room) el.textContent = roomNow(st.room);
      }
      const rn = document.querySelector<HTMLElement>('#roomNow'),
        sr = state.selectedRoom && state.P.m.rooms.find(q => q.id === state.selectedRoom);
      if (rn && sr) rn.textContent = roomNow(sr);
      lastCaption = ts;
    }
    if (state.layers.traffic && state.step === 'simulate' && ts - lastHeat > 700) {
      paintHeat();
      lastHeat = ts;
    }
  }
  requestAnimationFrame(loop);
}
/* In the reference this also asked the artifact viewer for the assistant and for downloads. In this build the
   assistant is a placeholder and downloads are the browser's own (PLAN.md, planned differences 1, 2 and 4). */
export function initCapabilities(): void {
  renderExport();
}
export async function init(): Promise<void> {
  const want = (location.hash || '').replace('#', '');
  state.dock = loadDock() || { open: false, corner: 'br', w: 440, h: 300 };
  // The renderer starts first, as in the reference, but it's asynchronous now (WebGPU), so the page is set up while it
  // starts. None of the next three steps needs the 3D view.
  const three = initThree();
  renderSampleThumbs();
  bindUI();
  void initPipeline();
  initSimulate();
  await three;
  rendererNote();
  updatePlanHeader();
  initPanelToggles();
  initStudio();
  setStep('import');
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => {
    if (b.dataset.step !== 'import') b.disabled = true;
  });
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      resize();
      applyDock();
      moveGlider();
      drawTimeline();
    });
    ['#workspace', '#view3dBody'].forEach(s => ro.observe($(s)));
  }
  window.addEventListener('resize', () => {
    resize();
    moveGlider();
  });
  if (window.matchMedia) {
    const q = window.matchMedia('(prefers-color-scheme: dark)');
    if (q.addEventListener) q.addEventListener('change', applyTheme);
  }
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => {
      moveGlider();
      if (R3 && state.P) buildLabels();
    });
  if ((STEPS.includes(want as never) && want !== 'import') || want === 'edit') {
    importPlan({ kind: 'pipeline', key: 'A' });
    setStep(want === 'edit' ? 'review' : want);
    if (want === 'edit') enterEdit();
  }
  state.playing = !reduceMotion;
  updateTransport();
  applyTheme();
  initCapabilities();
  requestAnimationFrame(loop);
}
