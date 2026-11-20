// The notices a release ships (S10): for each package it carries, its name, version, licence and its own
// LICENSE and NOTICE files, into build/notices/THIRD_PARTY_NOTICES.txt. Electron's own LICENSE and
// LICENSES.chromium.html are shipped beside the app by the packager.
import fs from 'node:fs';
import path from 'node:path';
import { productionPackages, root } from './production-deps.mjs';

const out = [`Meridian Desktop ships these packages besides Electron. Electron's licence and Chromium's notices are in`,
  `LICENSE and LICENSES.chromium.html beside the application.`, ''];
for (const p of productionPackages()) {
  out.push('='.repeat(78), `${p.name} ${p.version} (${p.license})`, '='.repeat(78));
  const files = fs.readdirSync(p.dir).filter((f) => /^(licen[cs]e|notice|copying)(\.|$)/i.test(f));
  if (!files.length) out.push(`(no licence file in the package; its licence is ${p.license})`);
  for (const f of files) out.push(fs.readFileSync(path.join(p.dir, f), 'utf8').trim(), '');
}
fs.mkdirSync(path.join(root, 'build', 'notices'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'notices', 'THIRD_PARTY_NOTICES.txt'), `${out.join('\n')}\n`);
console.log(`notices: ${productionPackages().length} packages`);
