/* The guided tour: what each room is for, and the order the camera visits them. */
import type { PreparedPlan, Room, TourStop } from './types';

export const PURPOSE: Record<string, string> = {
  waiting: 'Where patients sit after checking in, until a nurse calls them.',
  reception: 'Check-in and checkout. Staff see the waiting room through the counter.',
  exam_room: 'A nurse takes vitals first, then the provider sees the patient here.',
  procedure_room: 'Minor procedures that need more space than an exam room.',
  nurse_station: 'The nurses’ base. They walk from here to every exam room.',
  lab: 'Blood draws and sample handling.',
  provider_office: 'Providers chart and work here between visits.',
  staff_lounge: 'Break room for staff, with a kitchenette.',
  restroom: 'Accessible single-user restroom.',
  clean_utility: 'Clean supplies and linens.',
  soiled_utility: 'Used linens and waste, kept away from patients.',
  storage: 'General storage.',
  corridor: 'Connects every room to the lobby.'
};
/* Tour order follows a visit: entrance, lobby, exam rooms nearest first, then staff and support rooms, then out. */
export function tourStops(P: PreparedPlan): TourStop[] {
  const m = P.m,
    info = P.info,
    stops: TourStop[] = [{ kind: 'entrance' }];
  const add = (r: Room | undefined): void => {
    if (r && r.type !== 'corridor' && !stops.some(s => s.room === r)) stops.push({ room: r });
  };
  m.rooms.filter(r => r.type === 'waiting').forEach(r => add(r));
  m.rooms.filter(r => r.type === 'reception').forEach(r => add(r));
  info.allExams
    .slice()
    .sort((a, b) => a.distWait - b.distWait)
    .forEach(e => add(m.rooms[e.k]));
  for (const t of [
    'nurse_station',
    'procedure_room',
    'lab',
    'provider_office',
    'staff_lounge',
    'clean_utility',
    'soiled_utility',
    'storage',
    'restroom'
  ])
    m.rooms.filter(r => r.type === t).forEach(r => add(r));
  m.rooms.forEach(r => add(r));
  stops.push({ kind: 'exit' });
  return stops;
}
