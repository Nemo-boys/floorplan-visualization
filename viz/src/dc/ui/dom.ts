/* Tiny DOM helpers: no framework, just typed element builders. */
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export const icon = (paths: string, extra = ''): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;

export const ICONS = {
  arrowUp: icon('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  arrowRight: icon('<path d="M5 12h14M13 5l7 7-7 7"/>'),
  sparkle: icon('<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: icon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  download: icon('<path d="M12 4v12M6 10l6 6 6-6M5 20h14"/>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  fan: icon('<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7 2 0 3 2 1 4l-3 3M14 12c4 0 7 1 7 4 0 2-2 3-4 1l-3-3M12 14c0 4-1 7-4 7-2 0-3-2-1-4l3-3M10 12c-4 0-7-1-7-4 0-2 2-3 4-1l3 3"/>'),
  bolt: icon('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  plug: icon('<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/><path d="M3 3l18 18"/>'),
  thermo: icon('<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>'),
  gauge: icon('<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>'),
  storm: icon('<path d="M7 16a5 5 0 1 1 1-9.9A6 6 0 0 1 19 9a4 4 0 0 1-1 7.9"/><path d="M13 12l-2 4h3l-2 4"/>'),
  play: icon('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  pause: icon('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  wrench: icon('<path d="M14.5 6.5a4 4 0 0 1 5.3-3.1l-2.7 2.7 1.8 1.8 2.7-2.7a4 4 0 0 1-5.1 5.3L8 19a2 2 0 0 1-3-3z"/>'),
  reset: icon('<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/>')
};
