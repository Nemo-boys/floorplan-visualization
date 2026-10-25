/* ---------- Simulate: icons, colors and labels shared by the builder, timeline, results and history ---------- */
export const BICON: Record<string, string> = {
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  repeat:
    '<path d="M4.5 11a7.5 7.5 0 0 1 13-4.6L19.5 8.5M19.5 4v4.5H15M19.5 13a7.5 7.5 0 0 1-13 4.6L4.5 15.5M4.5 20v-4.5H9"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
  door: '<path d="M6.5 20V4h10v16M4 20h16M13.5 12h.01"/>',
  stethoscope: '<path d="M6 4v5a4 4 0 0 0 8 0V4M10 13v1.5a5 5 0 0 0 10 0V13"/><circle cx="20" cy="11" r="2"/>',
  steps: '<path d="M4 18h5v-4h5v-4h6"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3v3M12.5 3v3"/>',
  'person-off': '<circle cx="11" cy="8" r="3.5"/><path d="M4 20a7 7 0 0 1 11-5.7M16.5 16l4 4M20.5 16l-4 4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  group:
    '<circle cx="9" cy="8.5" r="3"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14.5 15.5A5 5 0 0 1 21 20"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>'
};
export const bIcon = (n: string): string =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  (BICON[n] || BICON.bolt) +
  '</svg>';
export const SVG_GRIP =
  '<svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="4" cy="3" r="1.3"/><circle cx="10" cy="3" r="1.3"/><circle cx="4" cy="7" r="1.3"/><circle cx="10" cy="7" r="1.3"/><circle cx="4" cy="11" r="1.3"/><circle cx="10" cy="11" r="1.3"/></svg>';
export const SVG_COPY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';
export const SVG_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/></svg>';
export const SVG_CHEV =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>';
export const SVG_WARN =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l8 14H2z" fill="currentColor" opacity=".16"/><path d="M10 7.5v4M10 14.2v.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const TL_LANES: [string, string][] = [
  ['staff', 'Staff'],
  ['arrivals', 'Arrivals'],
  ['events', 'Changes'],
  ['rules', 'Rules']
];
export const TYPE_COLORS: Record<string, string> = {
  shift: '#2453d6',
  break: '#7d8a96',
  appointments: '#11806a',
  walkins: '#2f9e73',
  out: '#c73a1f',
  closed: '#8b3fb0',
  group: '#c98a10',
  rule: '#e0592a',
  hours: '#5d6b78',
  run: '#5d6b78',
  steps: '#2453d6',
  visit_type: '#2453d6'
};
export const ROLE_COLORS: Record<string, string> = { provider: '#8b3fb0', nurse: '#11806a', reception: '#5d6b78' };
export const SWEEP_FIELDS: Record<string, string> = {
  patients: 'Patients per day',
  providers: 'Providers',
  nurses: 'Nurses',
  receptionists: 'Receptionists'
};
export const HISTORY_KEY = 'fi.simHistory.v1';
