// S10, licences by layer, for this repository (CONTRIBUTING.md):
// - meridian-desktop is AGPL-3.0-or-later, an extension of core, and publishes no library: so no AGPL code of
//   ours can reach an Apache-licensed library from here. Checked: the licence, `private`, no Apache-2.0 header on
//   our own sources.
// - every package a release ships carries a licence an AGPL program may include, and its notice is shipped
//   (scripts/notices.mjs writes them; ci checks the packaged app carries them, with Electron's own).
// - the provenance file is here.
// - `dockview-enterprise` (proprietary) is in no part of the tree, shipped or not, and any Dockview package is MIT
//   (scripts/forbidden-packages.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { productionPackages, root } from './production-deps.mjs';
import { forbidden } from './forbidden-packages.mjs';

const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense', 'Python-2.0']);
const failures = [];

function allowed(expression) {
  if (!expression) return false;
  const e = expression.replace(/[()]/g, '').trim();
  if (e.includes(' OR ')) return e.split(' OR ').some((part) => allowed(part));
  if (e.includes(' AND ')) return e.split(' AND ').every((part) => allowed(part));
  return ALLOWED.has(e);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.license !== 'AGPL-3.0-or-later') failures.push(`package.json's licence is ${pkg.license}, not AGPL-3.0-or-later`);
if (pkg.private !== true) failures.push('package.json is not private: this repository publishes no package');
if (!fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').includes('GNU AFFERO GENERAL PUBLIC LICENSE')) failures.push('LICENSE is not the AGPL');
for (const f of ['PROVENANCE.md', 'NOTICE']) if (!fs.existsSync(path.join(root, f))) failures.push(`${f} is missing`);

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
for (const file of [...sources(path.join(root, 'src')), ...sources(path.join(root, 'scripts')), ...sources(path.join(root, 'test'))]) {
  if (/SPDX-License-Identifier:\s*Apache/i.test(fs.readFileSync(file, 'utf8'))) failures.push(`${path.relative(root, file)} carries an Apache-2.0 header: our code is AGPL`);
}

failures.push(...forbidden(JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')), pkg));

const shipped = productionPackages();
for (const p of shipped) if (!allowed(p.license)) failures.push(`${p.name}@${p.version} is licensed "${p.license}", which is not on the allowed list`);
if (failures.length) { for (const f of failures) console.error(`check-licences: ${f}`); process.exit(1); }
console.log(`check-licences: ${shipped.length} shipped packages, each under an allowed licence; no dockview-enterprise; AGPL, private, provenance and notice in place`);
