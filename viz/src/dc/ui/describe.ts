/* Step 1: one sentence in, three designs out. The dials mirror what was understood and can be nudged. */
import { fmtPower, readBrief } from '../engine/brief';
import type { Basis, Redundancy } from '../engine/types';
import { state } from '../state';
import { ICONS, h } from './dom';

const EXAMPLES = [
  '20 MW AI factory, liquid-cooled GB200 racks, N+1 cooling, 2N power',
  '2 MW edge site for inference, air cooled, N+1',
  '50 MW training campus, liquid cooling, 2N power, 7 cents per kWh',
  '5 MW enterprise hall, compare cooling options, 10-year cost'
];

export function describeScreen(onGenerate: (brief: string, basis: Basis) => void): HTMLElement {
  let basis: Basis = { ...state.basis };
  const area = h('textarea', {
    id: 'brief',
    rows: 2,
    'aria-label': 'Describe your data center',
    placeholder: 'e.g. 20 MW AI factory, liquid cooled, N+1 cooling, 2N power'
  });
  area.value = state.brief;
  const understood = h('div', { class: 'understood', 'aria-live': 'polite' });
  const send = h('button', { class: 'send', type: 'button', 'aria-label': 'Design it', html: ICONS.arrowUp });
  const thinking = h('div', { class: 'thinking', 'aria-live': 'polite' });

  // dials
  const mwOut = h('output');
  const mw = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': 'Computing power' });
  const priceOut = h('output');
  const price = h('input', { type: 'range', min: 4, max: 30, step: 0.5, 'aria-label': 'Electricity price' });
  const segButtons = (vals: Redundancy[], get: () => Redundancy, set: (v: Redundancy) => void, label: string) => {
    const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
    const paint = () => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === get())));
    vals.forEach((v) =>
      wrap.append(
        h('button', {
          type: 'button',
          'data-v': v,
          onclick: () => {
            set(v);
            paint();
            syncText();
          }
        }, v)
      )
    );
    return { wrap, paint };
  };
  const cool = segButtons(['N', 'N+1', '2N'], () => basis.coolingRedundancy, (v) => (basis.coolingRedundancy = v), 'Cooling backup');
  const pow = segButtons(['N', 'N+1', '2N'], () => basis.powerRedundancy, (v) => (basis.powerRedundancy = v), 'Power backup');

  // the power slider is logarithmic: 0.5 MW .. 100 MW
  const toKw = (v: number) => Math.round((500 * Math.pow(200, v / 100)) / 100) * 100;
  const fromKw = (kw: number) => (100 * Math.log(kw / 500)) / Math.log(200);

  const paintDials = () => {
    mw.value = String(fromKw(basis.itKw));
    mwOut.textContent = fmtPower(basis.itKw);
    price.value = String(basis.priceKwh * 100);
    priceOut.textContent = `${Math.round(basis.priceKwh * 1000) / 10}¢ per kWh`;
    cool.paint();
    pow.paint();
  };
  const paintUnderstood = (items: string[]) => {
    understood.replaceChildren(
      ...(items.length ? items.map((t) => h('span', { class: 'tag' }, t)) : [h('span', { class: 'tag grey' }, 'Type a sentence or use the dials below')])
    );
  };
  const readText = () => {
    const r = readBrief(area.value);
    basis = { ...r.basis };
    paintUnderstood(r.understood);
    paintDials();
    send.disabled = !area.value.trim();
  };
  // when a dial changes, the sentence follows so the two never disagree
  const syncText = () => {
    const parts = [
      `${fmtPower(basis.itKw)} data center`,
      basis.cooling ? `${basis.cooling}-cooled` : 'compare cooling options',
      `${basis.coolingRedundancy} cooling`,
      `${basis.powerRedundancy} power`,
      `${Math.round(basis.priceKwh * 1000) / 10} cents per kWh`
    ];
    area.value = parts.join(', ');
    readText();
  };
  mw.addEventListener('input', () => {
    basis.itKw = toKw(Number(mw.value));
    mwOut.textContent = fmtPower(basis.itKw);
  });
  mw.addEventListener('change', syncText);
  price.addEventListener('input', () => {
    basis.priceKwh = Number(price.value) / 100;
    priceOut.textContent = `${Number(price.value)}¢ per kWh`;
  });
  price.addEventListener('change', syncText);

  area.addEventListener('input', readText);
  const go = () => {
    if (!area.value.trim()) return;
    send.disabled = true;
    thinking.replaceChildren(h('span', { class: 'spinner' }), 'Designing three options…');
    // let the spinner paint before the (fast, synchronous) design work
    requestAnimationFrame(() =>
      setTimeout(() => {
        onGenerate(area.value.trim(), basis);
        thinking.replaceChildren();
        send.disabled = false;
      }, 30)
    );
  };
  area.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      go();
    }
  });
  send.addEventListener('click', go);
  readText();

  return h(
    'section',
    { class: 'describe', id: 'describe' },
    h(
      'div',
      { class: 'describe-inner fade-in' },
      h('h1', {}, 'What should we build?'),
      h('p', { class: 'lede' }, 'Describe a data center in one sentence. You’ll get three designs to explore, test and price, all in your browser.'),
      h('div', { class: 'composer' }, area, h('div', { class: 'composer-foot' }, understood, send)),
      thinking,
      h(
        'div',
        { class: 'examples', 'aria-label': 'Examples' },
        ...EXAMPLES.map((ex) =>
          h('button', {
            type: 'button',
            onclick: () => {
              area.value = ex;
              readText();
              area.focus();
            }
          }, ex)
        )
      ),
      h(
        'div',
        { class: 'dials' },
        h('div', { class: 'dial' }, h('label', {}, 'Computing power'), mwOut, mw),
        h('div', { class: 'dial' }, h('label', {}, 'Cooling backup'), cool.wrap),
        h('div', { class: 'dial' }, h('label', {}, 'Power backup'), pow.wrap),
        h('div', { class: 'dial' }, h('label', {}, 'Electricity price'), priceOut, price)
      ),
      h(
        'div',
        { class: 'how' },
        h('div', {}, h('b', {}, '1 · Describe'), h('span', {}, 'Say what you need in plain words.')),
        h('div', {}, h('b', {}, '2 · Design'), h('span', {}, 'Compare three ways to cool it.')),
        h('div', {}, h('b', {}, '3 · Test'), h('span', {}, 'Break things and see what survives.')),
        h('div', {}, h('b', {}, '4 · Cost'), h('span', {}, 'See what it costs to build and run.'))
      )
    )
  );
}
