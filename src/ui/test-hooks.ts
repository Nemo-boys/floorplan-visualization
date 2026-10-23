/* The reference's page globals that the shared tests drive (PLAN.md, “Test hooks”). Exposed on window.__fi in dev
   and test builds only. More are added as their phases are ported. */
import { state } from '../state';
import { tour } from '../view3d/tour';
import { setStep } from './stepper';
import { importPlan } from './versions';

export function exposeTestHooks(): void {
  (window as unknown as { __fi: object }).__fi = { state, tour, setStep, importPlan };
}
