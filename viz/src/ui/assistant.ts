/* The assistant drawer. A placeholder in this build (PLAN.md, planned difference 1): it only opens and closes.
   The approved chat (sendChat and the functions around it) stays in reference-src/ui3.js for later. */
import { $ } from './dom';
import { resize } from './resize';
import { moveGlider } from './stepper';

export function toggleChat(open?: boolean): void {
  const app = $('#app'),
    on = open == null ? !app.classList.contains('chat-open') : open;
  app.classList.toggle('chat-open', on);
  $('#assistant').hidden = !on;
  $('#assistantBtn').setAttribute('aria-pressed', String(on));
  requestAnimationFrame(() => {
    resize();
    moveGlider();
  });
}
