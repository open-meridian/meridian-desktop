// The desktop's own strips (src/renderer) look like the rest of Open Meridian: their colours are the plugin UI kit's
// tokens, under the kit's own names, and no rule writes a colour of its own. The strips load nothing from a
// deployment, so desk.css gives the tokens their values once, in its :root blocks; everything else reads a token.
// The strip's one variable of its own is --dep, the colour the person chose for a deployment.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RENDERER = path.resolve(import.meta.dirname, '..', '..', 'src', 'renderer');

// The kit's custom properties (meridian-ui): surfaces, text, edges, accent and primary, status and market
// direction, each status with its wash; spacing, radius, shadow and type.
const KIT = new Set([
  'page', 'card', 'hover', 'ink', 'ink-soft', 'ink-faint', 'line', 'line-soft', 'line-strong',
  'accent', 'accent-wash', 'primary', 'primary-ink',
  'good', 'good-wash', 'danger', 'danger-wash', 'warn-ink', 'warn-wash', 'violet', 'violet-wash',
  'buy', 'buy-wash', 'sell', 'sell-wash',
  ...Array.from({ length: 10 }, (_, i) => `space-${i + 1}`), 'radius', 'shadow', 'sans', 'mono',
]);
const OWN = new Set(['dep']);

const NAMED = ['white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'orange', 'yellow', 'purple', 'pink',
  'silver', 'navy', 'teal', 'maroon', 'olive', 'lime', 'aqua', 'fuchsia', 'brown'];
const RAW = new RegExp(`#[0-9a-f]{3,8}\\b|\\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|:\\s*[^;{}]*\\b(${NAMED.join('|')})\\b`, 'i');

// What a file says once the places allowed a colour are taken out: desk.css's :root blocks, where the tokens get
// their values, and an <input type="color">'s starting value, which is the person's data, not a style.
function styled(name, text) {
  if (name.endsWith('.css')) return text.replace(/:root\s*\{[^}]*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (name.endsWith('.html')) return text.replace(/<input[^>]*type="color"[^>]*>/g, '').replace(/&#\d+;/g, '');
  return text.replace(/^\s*\/\/.*$/gm, '');
}

export function problems(name, text) {
  const found = [];
  for (const m of text.matchAll(/(?:var\(\s*|['"`]|^|[\s;{])--([a-z0-9-]+)/gim)) {
    if (!KIT.has(m[1]) && !OWN.has(m[1])) found.push(`${name} names --${m[1]}, which is not one of the kit's tokens`);
  }
  for (const line of styled(name, text).split('\n')) {
    if (RAW.test(line)) found.push(`${name} writes a colour of its own: ${line.trim()}`);
  }
  return found;
}

const files = fs.readdirSync(RENDERER).filter((f) => /\.(css|html|js)$/.test(f));

test('every strip file uses the kit\'s tokens and writes no colour of its own', () => {
  assert.ok(files.includes('desk.css'));
  const found = files.flatMap((f) => problems(f, fs.readFileSync(path.join(RENDERER, f), 'utf8')));
  assert.deepEqual(found, []);
});

test('desk.css gives a value to every token it uses, in light and in dark', () => {
  const css = fs.readFileSync(path.join(RENDERER, 'desk.css'), 'utf8');
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => new Set([...m[1].matchAll(/--([a-z0-9-]+)\s*:/g)].map((d) => d[1])));
  assert.equal(blocks.length, 2, 'a light :root and a dark one');
  const used = new Set([...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]).filter((t) => !OWN.has(t)));
  for (const token of used) for (const block of blocks) assert.ok(block.has(token), `--${token} has no value in one of the :root blocks`);
});

test('a planted raw colour or a token the kit does not have is caught', () => {
  assert.notDeepEqual(problems('x.css', 'button { color: #fff; }'), []);
  assert.notDeepEqual(problems('x.css', 'a { background: rgb(1, 2, 3); }'), []);
  assert.notDeepEqual(problems('x.css', 'p { color: white; }'), []);
  assert.notDeepEqual(problems('x.css', 'p { color: var(--muted); }'), []);
  assert.notDeepEqual(problems('x.js', "el.style.color = 'hsl(0 0% 0%)';"), []);
  assert.deepEqual(problems('x.css', ':root { --ink: #000; } p { color: var(--ink); background: transparent; }'), []);
  assert.deepEqual(problems('x.html', '<input name="colour" type="color" value="#2f6fde">'), []);
});
