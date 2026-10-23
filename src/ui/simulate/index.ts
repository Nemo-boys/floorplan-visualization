/* Simulate. Phase 4 needs only the scenario the 3D plays (Normal Tuesday, as at startup in the reference);
   the builder, runner, results and history are ported in Phase 5. */
import { compileScenario, makeScenario, type Scenario } from '../../engine';
import { state } from '../../state';

export function fillRoomDefaults(scn: Scenario): Scenario {
  const ex = state.P && state.P.m.rooms.find(r => r.type === 'exam_room');
  for (const b of scn.blocks) if (b.type === 'closed' && !b.fields.room && ex) b.fields.room = ex.id;
  return scn;
}
export function initSimulate(): void {
  state.scn = fillRoomDefaults(makeScenario('normal'));
  state.scenario = compileScenario(state.scn);
}
