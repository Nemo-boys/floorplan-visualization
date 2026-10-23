/* The reference's page globals that the shared tests drive (PLAN.md, “Test hooks”). Exposed on window.__fi in dev
   and test builds only. More are added as their phases are ported. */
import { state } from '../state';
import { endTour, nextTourStop, startTour, tour } from '../view3d/tour';
import { runCompare } from './compare';
import { applySwap } from './edit';
import { addBlock, moveBlock } from './simulate/builder';
import { compareHistory } from './simulate/history';
import { loadPreset, setSimTab } from './simulate';
import { runScenarioNow, runSweep } from './simulate/runner';
import { setStep } from './stepper';
import { seek } from './transport';
import { importPlan } from './versions';

export function exposeTestHooks(): void {
  (window as unknown as { __fi: object }).__fi = {
    state,
    tour,
    setStep,
    setSimTab,
    importPlan,
    seek,
    startTour,
    nextTourStop,
    endTour,
    loadPreset,
    addBlock,
    moveBlock,
    runScenarioNow,
    runSweep,
    runCompare,
    compareHistory,
    applySwap
  };
}
