// The packages a release ships: the production dependency tree, from the lock file (no network).
import fs from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');

export function productionPackages() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  return Object.entries(lock.packages)
    .filter(([where, entry]) => where.startsWith('node_modules/') && !entry.dev && !entry.optional)
    .map(([where, entry]) => {
      const dir = path.join(root, where);
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const license = typeof meta.license === 'string' ? meta.license : meta.license?.type ?? (Array.isArray(meta.licenses) ? meta.licenses.map((l) => l.type).join(' OR ') : null);
      return { name: meta.name, version: entry.version, license, dir };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
