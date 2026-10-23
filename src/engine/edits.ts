/* ---------- Editing (pure functions) ---------- */
import type { LayoutSpec } from './types';

export const LOCKED_TYPES = new Set(['waiting', 'reception', 'corridor']);
export function swapInSpec(
  spec: LayoutSpec | null | undefined,
  idA: string,
  idB: string
): { spec: LayoutSpec; error?: undefined } | { error: string; spec?: undefined } {
  if (!spec)
    return {
      error: 'Swapping rooms works on the sample layouts. For your own plans, layout changes go to Module 1.'
    };
  if (idA === idB) return { error: 'Pick two different rooms.' };
  for (const row of ['south', 'north'] as const) {
    const list = spec[row],
      ia = list.findIndex(e => e[0] === idA),
      ib = list.findIndex(e => e[0] === idB);
    if (ia < 0 && ib < 0) continue;
    if (ia < 0 || ib < 0) return { error: 'Pick two rooms on the same side of the corridor.' };
    if (LOCKED_TYPES.has(list[ia][1]) || LOCKED_TYPES.has(list[ib][1]))
      return {
        error:
          'The waiting room and reception stay where they are, because the entrance and check-in counter depend on them.'
      };
    const out = JSON.parse(JSON.stringify(spec)) as LayoutSpec;
    [out[row][ia], out[row][ib]] = [out[row][ib], out[row][ia]];
    return { spec: out };
  }
  return { error: 'Pick two rooms on the same side of the corridor.' };
}
