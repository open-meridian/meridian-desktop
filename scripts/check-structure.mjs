// The code-structure rules that apply here (CONTRIBUTING.md): S2 file size and S5 immutable pins.
// - S2: a hand-written file stays under 1,500 lines. Generated and vendored files are exempt.
// - S5: every dependency is pinned to an exact version and locked; every action a workflow uses is pinned to a
//   full commit SHA; nothing names a branch or a sibling checkout.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];
const LIMIT = 1500;
const skip = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', 'build']);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|mjs|cjs|html|css|sh|py|ya?ml|md)$/.test(entry.name) && entry.name !== 'LICENSE') {
      const lines = fs.readFileSync(full, 'utf8').split('\n').length;
      if (lines > LIMIT) failures.push(`S2: ${path.relative(root, full)} has ${lines} lines (most ${LIMIT})`);
    }
  }
}
walk(root);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) failures.push(`S5: ${name} is "${version}", not an exact version`);
}
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
for (const [where, entry] of Object.entries(lock.packages || {})) {
  if (where && entry.resolved && !entry.resolved.startsWith('https://registry.npmjs.org/')) failures.push(`S5: ${where} resolves outside the npm registry: ${entry.resolved}`);
  if (where && !entry.link && !entry.integrity) failures.push(`S5: ${where} has no integrity in the lock`);
}
const workflows = path.join(root, '.github', 'workflows');
for (const file of fs.existsSync(workflows) ? fs.readdirSync(workflows) : []) {
  const text = fs.readFileSync(path.join(workflows, file), 'utf8');
  for (const m of text.matchAll(/uses:\s*([^\s#]+)/g)) {
    if (m[1].startsWith('./')) continue;
    if (!/@[0-9a-f]{40}$/.test(m[1])) failures.push(`S5: ${file} uses ${m[1]}, not pinned to a full commit SHA`);
  }
}

if (failures.length) { for (const f of failures) console.error(f); process.exit(1); }
console.log('check-structure: S2 file size and S5 pins hold');
