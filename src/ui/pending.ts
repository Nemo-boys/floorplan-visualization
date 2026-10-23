/* Functions the shell already calls but that later phases port (PLAN.md). Each is a no-op until its phase replaces
   it with the real port in its own module and removes it from here. */
import type { SimTab } from '../state';

/* Phase 5: Simulate and the transport */
export function setSimTab(_t: SimTab): void {}
export function renderBuilder(): void {}
export function updateTransport(): void {}
export function updateLive(_force: boolean): void {}
export function drawTimeline(): void {}
export function renderChecks(): void {}

/* Phase 6: Export */
export function renderExport(): void {}
