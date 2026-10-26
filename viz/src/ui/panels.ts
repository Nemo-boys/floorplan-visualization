/* Side panels you can put away (Edit tools, the Simulate palette, checks and results), so the plan and the
   3D view can use the whole width. A small tab on the workspace edge hides and brings each one back; the
   tabs only show on steps that have a panel on that side. Session-only: nothing is stored. */
import { $ } from './dom';
import './panels.css';

const CHEVRON = (dir: 'left' | 'right') =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}"/></svg>`;

export function initPanelToggles(): void {
  const app = $('#app');
  const ws = $('#workspace');
  (['left', 'right'] as const).forEach(side => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `edge-tab ${side}`;
    b.id = side === 'left' ? 'edgeLeft' : 'edgeRight';
    const paint = () => {
      const hidden = app.classList.contains(`hide-${side}`);
      // the arrow points where the panel will go
      b.innerHTML = CHEVRON(hidden === (side === 'left') ? 'right' : 'left');
      b.setAttribute('aria-label', `${hidden ? 'Show' : 'Hide'} the ${side} panel`);
      b.setAttribute('aria-expanded', String(!hidden));
      b.title = `${hidden ? 'Show' : 'Hide'} the ${side} panel`;
    };
    b.addEventListener('click', () => {
      app.classList.toggle(`hide-${side}`);
      paint();
    });
    paint();
    ws.append(b);
  });
}
