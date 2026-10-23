/* Functions the shell already calls but that later phases port (PLAN.md). Each is a no-op until its phase replaces
   it with the real port in its own module and removes it from here. */

/* Phase 6: Export */
export function renderExport(): void {}
