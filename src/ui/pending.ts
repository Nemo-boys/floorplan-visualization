/* Functions the shell already calls but that later phases port (PLAN.md). Each is a no-op until its phase replaces
   it with the real port in its own module and removes it from here. With R3 null, the reference itself skips
   the 3D ones, so the shell behaves as the reference does when 3D can't start. */
import type { FurnItem, PreparedPlan, Room, Scenario, ClinicSim } from '../engine';
import type { SimTab, ViewMode } from '../state';
import type { ThemeColors } from './theme';

/* Phase 3: the interactive 2D plan */
export function renderPlan2D(): void {}
export function refreshPlanOverlay(): void {}
export function planPeople(
  _svg: SVGElement | null,
  _P: PreparedPlan,
  _sim: ClinicSim | null,
  _colors: Record<string, string>
): void {}

/* Phase 4: 3D view, Review and editing */
export function initThree(): boolean {
  return false;
}
export function buildScene(): void {}
export function buildLabels(): void {}
export function fitCamera(_instant?: boolean): void {}
export function setView(_v: ViewMode): void {}
export function endTour(): void {}
export function stopPlacing(): void {}
export function selectItem(_it: FurnItem | null): void {}
export function paintHeat(): void {}
export function theme3D(_T: ThemeColors): void {}
export function enterEdit(): void {}
export function exitEdit(_silent?: boolean): void {}
export function applyDock(): void {}
export function bindDock(): void {}
export function renderDockThumb(): void {}
export function renderReviewInfo(): void {}
export function renderEditTools(): void {}
export function renderVersions(): void {}
export function updateRouteText(): void {}
export function roomNow(_r: Room): string {
  return '';
}

/* Phase 5: Simulate and the transport */
export function initSimulate(): void {}
export function setSimTab(_t: SimTab): void {}
export function fillRoomDefaults(scn: Scenario): Scenario {
  return scn;
}
export function renderBuilder(): void {}
export function resetSim(_startAt: number): void {}
export function dayDone(): void {}
export function updateTransport(): void {}
export function updateLive(_force: boolean): void {}
export function drawTimeline(): void {}
export function renderChecks(): void {}

/* Phase 6: Export */
export function renderExport(): void {}
