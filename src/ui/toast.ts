/* The toast under the top bar, with an optional action such as Undo, and the notice box in the 3D view. */
import { state } from '../state';
import { $, esc } from './dom';

export function toast(text: string): void {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 3600);
}
export function showNotice(text: string): void {
  const n = $('#notice');
  n.textContent = text;
  n.hidden = !text;
}
/* toastAction keeps its own timer, as in the reference (toastAction.timer). */
let actionTimer: ReturnType<typeof setTimeout> | undefined;
export function toastAction(msg: string, label: string, fn: () => void): void {
  const t = $('#toast');
  t.innerHTML =
    '<span>' + esc(msg) + '</span> <button type="button" class="btn small" id="toastAct">' + esc(label) + '</button>';
  t.hidden = false;
  $('#toastAct').addEventListener('click', () => {
    t.hidden = true;
    fn();
  });
  clearTimeout(actionTimer);
  actionTimer = setTimeout(() => {
    t.hidden = true;
  }, 7000);
}
