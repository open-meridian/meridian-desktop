// Packages the desktop never takes in, shipped or used only to build and test: `dockview-enterprise`, which is
// proprietary, by any route. The desktop uses no Dockview package today; should one ever come in, only Dockview's
// MIT packages may. Read from the lock file and the manifest, so a dev or a nested dependency counts too.
export const NEVER = new Set(['dockview-enterprise']);

function nameOf(where, entry) {
  if (entry.name) return entry.name;
  const at = where.lastIndexOf('node_modules/');
  return at < 0 ? null : where.slice(at + 'node_modules/'.length);
}

// What the lock and the manifest say against the rule, in words; empty when it holds.
export function forbidden(lock, pkg = {}) {
  const found = [];
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
    if (NEVER.has(name)) found.push(`package.json depends on ${name}, which never enters the desktop`);
  }
  for (const [where, entry] of Object.entries(lock.packages || {})) {
    const name = nameOf(where, entry);
    if (!name) continue;
    if (NEVER.has(name)) found.push(`${where} is ${name}, which never enters the desktop`);
    else if (/^(@dockview\/|dockview(-|$))/.test(name) && entry.license !== 'MIT') {
      found.push(`${where} is a Dockview package under "${entry.license ?? 'no stated licence'}": only Dockview's MIT packages may come in`);
    }
  }
  return found;
}
