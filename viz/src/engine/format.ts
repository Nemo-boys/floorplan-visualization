/* Clock times, durations, role names and rule text. Times are minutes from 8:00 am. */
import { clamp } from './util';
import type { BlockFields, Role } from './types';

export function fmtMin(v: number): string {
  return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' min';
}
/* Minutes from 8:00 am to a clock time like 9:30 am. */
export function fmtClock(min: number): string {
  const total = Math.round(480 + min),
    h24 = Math.floor(total / 60) % 24,
    mm = total % 60,
    h = ((h24 + 11) % 12) + 1;
  return h + ':' + String(mm).padStart(2, '0') + (h24 < 12 ? ' am' : ' pm');
}
export const ROLE_NAMES: Record<Role, [string, string]> = {
  provider: ['provider', 'providers'],
  nurse: ['nurse', 'nurses'],
  reception: ['receptionist', 'receptionists']
};
export const roleName = (r: string, n: number): string =>
  ROLE_NAMES[r as Role] ? ROLE_NAMES[r as Role][n === 1 ? 0 : 1] : r;
export const hm = (v: unknown): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
  return m ? +m[1] * 60 + +m[2] - 480 : NaN;
};
export const hmStr = (t: number): string => {
  const v = clamp(Math.round(t + 480), 0, 1439);
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
};
export function fmtHM(v: unknown): string {
  const t = hm(v);
  return isNaN(t) ? '?' : fmtClock(t);
}
/* The options of the When / Then block's "When" field. BLOCK_TYPES.rule.fields.metric.options is this object. */
export const RULE_METRICS: Record<string, string> = {
  waiting: 'patients waiting in the lobby',
  longest: 'the longest current wait (min)',
  desk: 'the line at reception',
  free_rooms: 'free exam rooms'
};
export function ruleText(f: BlockFields): string {
  const what = RULE_METRICS[f.metric as string],
    op = f.op === 'lt' ? 'less than' : 'more than';
  const act =
    f.action === 'call_in'
      ? 'call in ' + f.count + ' ' + roleName(f.role as string, f.count as number) + ' for ' + f.duration + ' min'
      : 'stop taking walk-ins for ' + f.duration + ' min';
  return 'When ' + what + ' is ' + op + ' ' + f.value + (f.hold ? ' for ' + f.hold + ' min' : '') + ', ' + act;
}
