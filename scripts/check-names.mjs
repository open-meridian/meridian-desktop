// Names: what the desktop publishes as a name never names a persona as a product (a researcher's desktop, a trader
// app, a PM tool), nor an upstream project's trademark as ours (FINOS, Dockview, OpenFin, Electron, and the like).
// Describing what the desktop is built on or works with, in running text, is not a name and is not checked.
//
// The names published: the README's headings, the package's name and product name, the packager's product name and
// app id, the release's title, the windows' titles, and the strips' page titles and brand.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PERSONA = /\b(researchers?|traders?|PMs?|portfolio managers?|analysts?|quants?|risk managers?)\b/i;
export const TRADEMARK = /\b(FINOS|Dockview|OpenFin|FDC3|Electron|Chromium)\b/i;

// Each name with where it is published.
export function published(root) {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const names = [];
  const add = (where, name) => { if (name) names.push({ where, name: name.trim() }); };
  for (const line of read('README.md').split('\n')) if (/^#{1,6}\s/.test(line)) add('README.md heading', line.replace(/^#+\s*/, ''));
  const pkg = JSON.parse(read('package.json'));
  add('package.json name', pkg.name);
  add('package.json productName', pkg.productName);
  const builder = read('electron-builder.yml');
  for (const key of ['productName', 'appId']) add(`electron-builder.yml ${key}`, new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(builder)?.[1]);
  for (const m of read('.github/workflows/release.yml').matchAll(/--title\s+"([^"]+)"/g)) add('the release title', m[1]);
  for (const m of read('src/main/windows.js').matchAll(/title:\s*([^,\n]+)/g)) {
    for (const s of m[1].matchAll(/'([^']+)'/g)) add('a window title', s[1]);
  }
  const renderer = path.join(root, 'src', 'renderer');
  for (const f of fs.readdirSync(renderer).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(renderer, f), 'utf8');
    add(`${f} title`, /<title>([^<]*)<\/title>/.exec(html)?.[1]);
    for (const m of html.matchAll(/class="brand">([^<]*)</g)) add(`${f} brand`, m[1]);
  }
  return names;
}

export function offending(names) {
  const found = [];
  for (const { where, name } of names) {
    if (PERSONA.test(name)) found.push(`${where} "${name}" names a persona as a product`);
    if (TRADEMARK.test(name)) found.push(`${where} "${name}" names an upstream trademark as ours`);
  }
  return found;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = path.resolve(import.meta.dirname, '..');
  const names = published(root);
  const found = offending(names);
  if (!names.length) found.push('no published name was found to check');
  if (found.length) { for (const f of found) console.error(`check-names: ${f}`); process.exit(1); }
  console.log(`check-names: ${names.length} published names, none a persona or an upstream trademark`);
}
