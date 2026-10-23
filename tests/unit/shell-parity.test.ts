/* The app shell against reference-src/shell.html: the CSS is the reference's, split but unchanged, and the markup
   differs only by the planned differences in PLAN.md. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f: string): string => fs.readFileSync(path.join(root, f), 'utf8');
const shell = read('reference-src/shell.html');

it('src/styles, joined in import order, is the reference <style> block plus the placeholder rule', () => {
  const order = [...read('src/styles/index.ts').matchAll(/import '\.\/(.+?\.css)';/g)].map(m => m[1]);
  const reference = shell.slice(shell.indexOf('<style>\n') + '<style>\n'.length, shell.indexOf('</style>'));
  const files = order.map(f => read('src/styles/' + f));
  expect(order.at(-1)).toBe('14-assistant-placeholder.css');
  expect(files.slice(0, -1).join('')).toBe(reference);
  expect(files.at(-1)).toContain(
    '.assistant-later { margin: 0; padding: 16px 14px; color: var(--ink-2); font-size: 13.5px; }'
  );
  expect(order).toEqual(fs.readdirSync(path.join(root, 'src/styles')).filter(f => f.endsWith('.css')));
});

it('index.html keeps the reference <head> and body, apart from the planned differences', () => {
  const html = read('index.html');
  const head = (s: string): string =>
    s.slice(0, s.indexOf('<style>') >= 0 ? s.indexOf('<style>') : s.indexOf('</head>'));
  expect(head(html)).toBe(head(shell));
  const body = (s: string): string => s.slice(s.indexOf('<body>'), s.indexOf('\n</div>\n') + '\n</div>\n'.length);
  let expected = body(shell);
  // Planned difference 1: the drawer is a placeholder, and the button that opened the chat is hidden.
  expected = expected.replace(
    /( {2}<aside class="drawer" id="assistant" hidden aria-label="Assistant">\n {4}<header>.*?<\/header>\n)[\s\S]*?( {2}<\/aside>)/,
    '$1    <p class="assistant-later">The assistant will be connected in a later version.</p>\n$2'
  );
  expected = expected.replace('id="askBigger">', 'id="askBigger" hidden>');
  // Planned differences 2 and 4: no note about downloads in the artifact viewer.
  expected = expected.replace(/ +<p class="small muted" id="exDlNote" hidden>.*<\/p>\n/, '');
  expect(body(html)).toBe(expected);
  expect(html).not.toMatch(/artifact|window\.claude|cdn\.jsdelivr/);
});
