/* ---------- Save and load scenarios as files ---------- */
import { BLOCK_TYPES, makeBlock, type Block } from '../../engine';
import { state } from '../../state';
import { $ } from '../dom';
import { downloadFile, slug } from '../download';
import { toast } from '../toast';
import { renderBuilder } from './builder';
import { fillRoomDefaults, setSimTab } from './index';

export function bindScenarioFiles(): void {
  $('#scnDownload').addEventListener('click', () => {
    const scn = state.scn;
    if (!scn) return;
    const data = JSON.stringify(
      { schema: 'fi.scenario.v1', name: scn.name, preset: scn.preset, blocks: scn.blocks },
      null,
      2
    );
    // Planned difference 2 (PLAN.md): the browser's own download, so “Downloads aren’t available” never shows.
    try {
      downloadFile(slug(scn.name) + '.scenario.json', data, 'application/json');
      toast('Saved the scenario.');
    } catch {
      toast('Couldn’t save the scenario.');
    }
  });
  $<HTMLInputElement>('#scnImport').addEventListener('change', e => {
    const input = e.target as HTMLInputElement,
      f = input.files && input.files[0];
    if (!f) return;
    f.text()
      .then(t => {
        const j = JSON.parse(t);
        if (!j || !Array.isArray(j.blocks)) throw new Error('no blocks found');
        const blocks: Block[] = (j.blocks as Block[])
          .filter(b => b && typeof b.type === 'string' && b.fields && typeof b.fields === 'object')
          .map(b => ({
            id: makeBlock(BLOCK_TYPES[b.type] ? b.type : 'hours').id,
            type: b.type,
            enabled: b.enabled !== false,
            fields: b.fields
          }));
        state.scn = fillRoomDefaults({
          schema: 'fi.scenario.v1',
          name: String(j.name || f.name).slice(0, 60),
          preset: 'custom',
          blocks
        });
        renderBuilder();
        setSimTab('scenario');
        toast('Imported ' + f.name + '. Check the list on the right for anything to fix.');
      })
      .catch((err: Error) => toast('Couldn’t read ' + f.name + ': ' + err.message + '.'));
    input.value = '';
  });
}
