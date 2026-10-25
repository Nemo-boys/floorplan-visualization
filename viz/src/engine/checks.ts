/* Example U.S. checks computed from the plan. Module 2 will supply the real, complete rule set. */
import type { Check, PreparedPlan } from './types';

export function runChecks(P: PreparedPlan): Check[] {
  const m = P.m,
    info = P.info,
    out: Check[] = [];
  out.push({
    id: 'reach',
    label: 'Every room can be reached through doors',
    pass: info.unreachableRooms.length === 0,
    detail: info.unreachableRooms.length
      ? 'Not reachable: ' + info.unreachableRooms.join(', ')
      : 'All ' + m.rooms.length + ' rooms connect to the entrance',
    source: 'Computed from the plan'
  });
  const doors = m.doors.filter(d => d.kind === 'door' && !d.isEntrance);
  const clear = doors.length ? Math.min(...doors.map(d => d.width * 1000 - 85)) : 0;
  out.push({
    id: 'door',
    label: 'Doors give at least 32 in (815 mm) clear width',
    pass: clear >= 815,
    detail: 'Narrowest door: about ' + Math.round(clear) + ' mm clear',
    source: 'Example rule: ADA 404.2.3'
  });
  const corr = m.rooms.filter(r => r.type === 'corridor'),
    cw = corr.length ? Math.min(...corr.map(r => Math.min(r.w, r.h))) : 0;
  out.push({
    id: 'route',
    label: 'Corridors are at least 36 in (915 mm) wide',
    pass: cw >= 0.915,
    detail: 'Narrowest corridor: ' + cw.toFixed(2) + ' m',
    source: 'Example rule: ADA 403.5.1'
  });
  const rr = m.rooms.filter(r => r.type === 'restroom'),
    rmin = rr.length ? Math.min(...rr.map(r => Math.min(r.w, r.h))) : null;
  out.push({
    id: 'turn',
    label: 'Restrooms fit a 60 in (1.525 m) turning circle',
    pass: rmin === null || rmin >= 1.525,
    detail:
      rmin === null
        ? 'No restrooms in this plan'
        : 'Smallest restroom side: ' + rmin.toFixed(2) + ' m (room size only, fixtures not counted)',
    source: 'Example rule: ADA 304.3.1'
  });
  const eg = info.routes.egress;
  out.push({
    id: 'egress',
    label: 'Longest way out is under 61 m (200 ft)',
    pass: !!eg && eg.len <= 61,
    detail: eg ? Math.round(eg.len) + ' m, from ' + eg.fromLabel : 'No exit found',
    source: 'Example rule: IBC exit travel distance'
  });
  return out;
}
