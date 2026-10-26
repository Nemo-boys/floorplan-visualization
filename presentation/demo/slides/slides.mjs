// Renders the keynote slides to slides/png/*.png (1920x1080).   node presentation/demo/slides/slides.mjs
// Numbers come only from presentation/11-key-numbers.md.
import { chromium, W, H } from '../tools/lib.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, 'png');
fs.mkdirSync(OUT, { recursive: true });
const img = p => {
  const f = path.join(ROOT, p);
  return fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : '';
};

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}px; height: ${H}px; background: #000; color: #f5f5f7; font-family: Inter, system-ui, sans-serif; overflow: hidden; }
.s { position: relative; width: 100%; height: 100%; padding: 110px 140px; display: flex; flex-direction: column; justify-content: center; }
.glow { position: absolute; inset: 0; background: radial-gradient(1200px 700px at 50% 120%, rgba(118,185,0,.16), transparent 60%),
        radial-gradient(900px 600px at 85% -10%, rgba(10,132,255,.16), transparent 60%); pointer-events: none; }
.eyebrow { font-size: 30px; font-weight: 600; letter-spacing: .02em; color: #86868b; margin-bottom: 26px; }
h1 { font-size: 132px; line-height: 1.02; font-weight: 800; letter-spacing: -.035em; }
h2 { font-size: 84px; line-height: 1.05; font-weight: 800; letter-spacing: -.03em; margin-bottom: 40px; }
.grad { background: linear-gradient(90deg, #76b900 0%, #3cc8bb 45%, #0a84ff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sub { font-size: 44px; color: #a1a1a6; font-weight: 500; margin-top: 28px; letter-spacing: -.01em; }
.team { position: absolute; left: 140px; bottom: 96px; font-size: 32px; color: #d2d2d7; font-weight: 600; }
.team span { color: #86868b; font-weight: 500; }
.event { position: absolute; left: 140px; top: 92px; font-size: 28px; font-weight: 700; color: #f5f5f7; letter-spacing: .04em; text-transform: uppercase; }
.event b { color: #76b900; }
.grid { display: grid; gap: 28px; }
.card { background: #111114; border: 1px solid #26262b; border-radius: 28px; padding: 34px 36px; }
.card .k { font-size: 68px; font-weight: 800; letter-spacing: -.03em; }
.card .l { font-size: 26px; color: #a1a1a6; margin-top: 10px; line-height: 1.3; }
.card h3 { font-size: 34px; font-weight: 700; margin-bottom: 12px; }
.card p { font-size: 25px; color: #a1a1a6; line-height: 1.4; }
.rule { display: grid; grid-template-columns: 330px 1fr 360px; gap: 20px; align-items: center; padding: 15px 0; border-bottom: 1px solid #222; font-size: 27px; }
.rule .id { font-weight: 700; color: #f5f5f7; } .rule .rq { color: #d2d2d7; } .rule .m { color: #86868b; font-size: 23px; }
.ok { color: #30d158; font-weight: 700; margin-right: 12px; }
.foot { position: absolute; left: 140px; right: 140px; bottom: 60px; font-size: 21px; color: #6e6e73; }
.shot { border-radius: 22px; border: 1px solid #2a2a2e; box-shadow: 0 30px 90px rgba(0,0,0,.6); width: 100%; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; }
.pill { display: inline-block; font-size: 24px; padding: 10px 22px; border-radius: 999px; border: 1px solid #333; color: #d2d2d7; margin: 0 12px 12px 0; }
.c-nv { color: #76b900; } .c-teal { color: #3cc8bb; } .c-blue { color: #0a84ff; } .c-yel { color: #ffd60a; }
`;

const slides = {
  '01-title': `
    <div class="s"><div class="glow"></div>
      <div class="event">Nebius <b>×</b> NVIDIA Global AI Hackathon 2026</div>
      <h1>Floorplan<br><span class="grad">Intelligence</span></h1>
      <div class="sub">Brief in, building out.</div>
      <div class="team">Venu Arvind <span>&nbsp;·&nbsp;</span> Sarvesh Arunachalam M</div>
    </div>`,
  '02-problem': `
    <div class="s"><div class="glow"></div><div class="eyebrow">The problem</div>
      <h2>A language model can’t be<br>trusted with geometry.</h2>
      <div class="grid" style="grid-template-columns: repeat(3, 1fr)">
        <div class="card"><h3>Slow and expert-bound</h3><p>A first plan from a brief takes an architect days. Testing how it runs on a busy day usually never happens.</p></div>
        <div class="card"><h3>LLMs hallucinate plans</h3><p>Overlapping rooms, corridors ten times too wide, and an invented “code-compliant”.</p></div>
        <div class="card"><h3>Solvers can’t read</h3><p>Perfect geometry, but no idea what “nurse station among the exam rooms” means.</p></div>
      </div></div>`,
  '03-idea': `
    <div class="s"><div class="glow"></div><div class="eyebrow">The idea</div>
      <h2>Split the work by what<br>each tool is good at.</h2>
      <div class="grid" style="grid-template-columns: repeat(4, 1fr)">
        <div class="card"><h3 class="c-nv">Nemotron</h3><p>Reads the brief and writes the room program, under a grammar.</p></div>
        <div class="card"><h3 class="c-blue">CP-SAT</h3><p>Exact geometry on a 100 mm grid, or a proof that it’s impossible.</p></div>
        <div class="card"><h3 class="c-yel">Checker</h3><p>9 cited rules: ADA, FGI, IBC. Says what passed, never “compliant”.</p></div>
        <div class="card"><h3 class="c-teal">Browser</h3><p>WebGPU 3D, simulation, failure tests, cost, and an assistant.</p></div>
      </div>
      <div class="sub" style="margin-top:56px">The model proposes. The solver proves. The simulator tells you if it works.</div></div>`,
  '04-nemotron': `
    <div class="s"><div class="glow"></div><div class="eyebrow">The model</div>
      <h2><span class="c-nv">Nemotron Nano 9B v2</span>,<br>fine-tuned for floor plans.</h2>
      <div class="grid" style="grid-template-columns: repeat(4, 1fr)">
        <div class="card"><div class="k">r = 32</div><div class="l">QLoRA, α = 64, on 400 train / 50 val solver-certified plans</div></div>
        <div class="card"><div class="k">GRPO</div><div class="l">500 prompts, 4 verifiable rewards: format, overlap, connectivity, regulatory</div></div>
        <div class="card"><div class="k">GBNF</div><div class="l">Grammar-constrained decoding inside llama.cpp: every line parses</div></div>
        <div class="card"><div class="k">5.5 GB</div><div class="l">Q4_K_M GGUF, all layers on Apple Silicon Metal</div></div>
      </div></div>`,
  '05-checks': `
    <div class="s" style="padding-top:90px"><div class="glow"></div><div class="eyebrow">Rule checker</div>
      <h2 style="font-size:68px;margin-bottom:26px">Nine rules. Each with its citation.</h2>
      ${[
        ['GEOM-BOUNDARY-01', 'Every room inside the footprint', 'containment'],
        ['GEOM-OVERLAP-02', '0 mm² overlap between rooms', 'interval disjointness'],
        ['ADA 404.2.3', 'Door clear width ≥ 915 mm (clinical)', 'opening widths'],
        ['ADA 403.5.1', 'Corridor ≥ 1,830 mm', 'axis-aligned width'],
        ['ADA 304.3', '1,525 mm wheelchair turning circle', 'inscribed circle'],
        ['FGI 2.1-2.2', 'Exam room ≥ 11.15 m², side ≥ 3,048 mm', 'area and dimension'],
        ['FGI 2.1-3', 'Clean and soiled utility never connect', 'adjacency graph'],
        ['IBC 1017', 'Every room reachable from the exit', 'BFS on the door graph'],
        ['IBC 1017.2', 'Exit travel ≤ 45,720 mm (150 ft)', 'shortest path through doors']
      ].map(([a, b, c]) => `<div class="rule"><div class="id"><span class="ok">✓</span>${a}</div><div class="rq">${b}</div><div class="m">${c}</div></div>`).join('')}
      <div class="foot">Screening checks: they report what was measured and what was required. Not a licensed code review.</div></div>`,
  '06-engineering': `
    <div class="s"><div class="glow"></div><div class="eyebrow">Built, not mocked up</div>
      <h2>Two apps. One pipeline.</h2>
      <div class="grid" style="grid-template-columns: repeat(4, 1fr)">
        <div class="card"><div class="k">~21,900</div><div class="l">lines of TypeScript and CSS: 3D, simulation, failure testing, cost, assistant</div></div>
        <div class="card"><div class="k">~5,400</div><div class="l">lines of Python: generation, CP-SAT repair, validation, FastAPI</div></div>
        <div class="card"><div class="k">210</div><div class="l">tests: 152 viz unit + golden, 58 pytest, plus Playwright e2e and visual diffs</div></div>
        <div class="card"><div class="k">500</div><div class="l">dataset plans converted and schema-checked by the adapter, all pass</div></div>
      </div>
      <div style="margin-top:44px">${['three.js 0.186 · WebGPU', 'InstancedMesh', 'render on demand', 'discrete-event simulation', 'A* paths', 'SOR thermal estimate', 'OpenUSD', 'GLB + Blender', 'tool-calling assistant'].map(t => `<span class="pill">${t}</span>`).join('')}</div></div>`,
  '07-demo-clinic': `
    <div class="s" style="align-items:center;text-align:center"><div class="glow"></div>
      <div class="eyebrow">Demo · part one</div><h1 style="font-size:150px">The <span class="grad">clinic</span>.</h1>
      <div class="sub">Generate · review · simulate · ask · edit · export</div></div>`,
  '08-demo-dc': `
    <div class="s" style="align-items:center;text-align:center"><div class="glow"></div>
      <div class="eyebrow">Demo · part two</div><h1 style="font-size:150px">The <span class="grad">data center</span>.</h1>
      <div class="sub">Describe · design · test · cost</div></div>`,
  '09-apps': `
    <div class="s" style="padding:80px 110px"><div class="glow"></div><div class="eyebrow">Same model · same solver · same viewer</div>
      <div class="two">
        <div><img class="shot" src="${img('viz/docs/screenshots/review.png')}"><div class="sub" style="font-size:30px;margin-top:20px">Clinic: review, simulate, export</div></div>
        <div><img class="shot" src="${img('presentation/demo/screenshots/dc-design.png')}"><div class="sub" style="font-size:30px;margin-top:20px">Data Center Studio: design, test, cost</div></div>
      </div></div>`,
  '10-numbers': `
    <div class="s"><div class="glow"></div><div class="eyebrow">Does it hold up?</div>
      <h2>Measured, not promised.</h2>
      <div class="grid" style="grid-template-columns: repeat(3, 1fr)">
        <div class="card"><div class="k c-nv">20 / 20</div><div class="l">feasible briefs accepted, every applicable check passing</div></div>
        <div class="card"><div class="k c-blue">5 / 5</div><div class="l">impossible requests answered with a conflict core, not a plan</div></div>
        <div class="card"><div class="k c-teal">0.04 s</div><div class="l">p50 latency for 3 checked candidates (model off)</div></div>
        <div class="card"><div class="k">~30 ms</div><div class="l">CP-SAT proof of a data center layout, OPTIMAL on all 6 designs</div></div>
        <div class="card"><div class="k">5.5 GB</div><div class="l">model on a laptop. No data leaves the machine</div></div>
        <div class="card"><div class="k">$0</div><div class="l">API cost per plan when run locally</div></div>
      </div>
      <div class="foot">Benchmark: 2026-10-25, Apple M4 Pro, docs/BENCHMARK.md. With Nemotron on: ~47 s for 3 candidates.</div></div>`,
  '11-use-cases': `
    <div class="s"><div class="glow"></div><div class="eyebrow">Where it goes</div>
      <h2>A new building type is a<br>config pack, not a new product.</h2>
      <div class="grid" style="grid-template-columns: repeat(3, 1fr)">
        <div class="card"><h3 class="c-teal">Health systems</h3><p>Test whether 6 exam rooms and 2 nurses handle flu season before signing the lease.</p></div>
        <div class="card"><h3 class="c-yel">Architects</h3><p>A checked first plan in minutes, plain-language edits in the client meeting, exports to Blender.</p></div>
        <div class="card"><h3 class="c-blue">AI infrastructure</h3><p>Liquid vs. air on cost, PUE and $/GPU-hour; what survives a heat wave; OpenUSD to Omniverse.</p></div>
      </div>
      <div style="margin-top:40px">${['Hospitals', 'Schools', 'Offices', 'Warehouses', 'Labs and cleanrooms', 'Airports', 'Factories'].map(t => `<span class="pill">${t}</span>`).join('')}</div></div>`,
  '12-closing': `
    <div class="s" style="align-items:center;text-align:center"><div class="glow"></div>
      <h2 style="font-size:96px">From a sentence to a building<br>you can <span class="grad">walk, stress and price</span>.</h2>
      <div class="sub" style="font-size:52px;color:#f5f5f7;font-weight:700">Floorplan Intelligence</div>
      <div class="sub" style="font-size:32px">Venu Arvind · Sarvesh Arunachalam M</div>
      <div class="sub" style="font-size:26px;color:#86868b">Nebius × NVIDIA Global AI Hackathon 2026</div></div>`
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const want = process.argv.slice(2);
for (const [name, body] of Object.entries(slides)) {
  if (want.length && !want.includes(name)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('slide', name);
}
await browser.close();
