'use strict';
// What a setup holds, checked; and the file a setup is exported to and imported from (the-workspace ruling 6;
// spec requirement 12). A setup holds, per window: the deployment, the path, bounds, display, pinned-on-top and
// snap group. It never holds a credential, a session or anything a page showed. Pure functions: tested in
// test/unit/setup-file.test.mjs.
const { isKeptPath, canonicalAddress } = require('./origins');

const FORMAT = 'meridian-desktop-setup';
const MOST_WINDOWS = 64;

function int(v, lo, hi) { return Number.isInteger(v) && v >= lo && v <= hi; }
function rect(r, minSize) {
  return r && typeof r === 'object' && int(r.x, -100000, 100000) && int(r.y, -100000, 100000)
    && int(r.width, minSize, 100000) && int(r.height, minSize, 100000);
}
function cleanRect(r) { return { x: r.x, y: r.y, width: r.width, height: r.height }; }

// One window of a setup, checked and copied field by field so nothing else rides along. `known` says which
// deployment references are valid.
function cleanWindow(w, known) {
  if (!w || typeof w !== 'object') throw new Error('a window in the setup is not a window');
  if (!known(w.deployment)) throw new Error('a window names a deployment the setup does not hold');
  if (!isKeptPath(w.path)) throw new Error('a window\'s path is not a path on its deployment');
  if (!rect(w.bounds, 100)) throw new Error('a window\'s bounds are not a rectangle');
  if (w.display !== undefined && w.display !== null && !rect(w.display, 1)) throw new Error('a window\'s display is not a rectangle');
  if (w.snapGroup !== null && w.snapGroup !== undefined && !int(w.snapGroup, 1, MOST_WINDOWS)) throw new Error('a snap group is not a number');
  return {
    deployment: w.deployment, path: w.path, bounds: cleanRect(w.bounds), display: w.display ? cleanRect(w.display) : null,
    pinned: w.pinned === true, snapGroup: w.snapGroup ?? null,
  };
}

function cleanSetup(s, known) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.windows)) throw new Error('that is not a setup');
  if (s.windows.length > MOST_WINDOWS) throw new Error(`a setup holds at most ${MOST_WINDOWS} windows`);
  return {
    windows: s.windows.map((w) => cleanWindow(w, known)),
    bar: s.bar && rect(s.bar.bounds, 100) ? { bounds: cleanRect(s.bar.bounds), display: s.bar.display && rect(s.bar.display, 1) ? cleanRect(s.bar.display) : null } : null,
  };
}

function cleanName(name) {
  const n = String(name ?? '').trim();
  if (!n || n.length > 60 || /[\u0000-\u001f]/.test(n)) throw new Error('A setup\'s name is 1 to 60 characters.');
  return n;
}

// The exported file: the setup with each deployment named by its address, name and colour, never its pinned
// certificate (the importing machine checks the certificate itself) and never anything of a session.
function exported(name, setup, deploymentOf) {
  const refs = new Map();
  for (const w of setup.windows) {
    if (!refs.has(w.deployment)) {
      const d = deploymentOf(w.deployment);
      if (!d) continue;
      refs.set(w.deployment, { ref: `d${refs.size + 1}`, address: d.address, name: d.name, colour: d.colour });
    }
  }
  return {
    format: FORMAT, version: 1, name,
    deployments: [...refs.values()],
    windows: setup.windows.filter((w) => refs.has(w.deployment)).map((w) => ({ ...w, deployment: refs.get(w.deployment).ref })),
    bar: setup.bar,
  };
}

// An imported file, checked: its name, its deployments (each a valid address) and its setup by reference.
function imported(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('That file is not a setup: it is not JSON.'); }
  if (!file || file.format !== FORMAT || file.version !== 1) throw new Error('That file is not a Meridian Desktop setup.');
  if (!Array.isArray(file.deployments) || file.deployments.length > MOST_WINDOWS) throw new Error('The setup\'s deployments are not a list.');
  const deployments = file.deployments.map((d) => ({
    ref: String(d.ref), address: canonicalAddress(d.address),
    name: String(d.name ?? '').slice(0, 60), colour: /^#[0-9a-f]{6}$/i.test(d.colour ?? '') ? d.colour : null,
  }));
  const refs = new Set(deployments.map((d) => d.ref));
  return { name: cleanName(file.name), deployments, setup: cleanSetup(file, (ref) => refs.has(ref)) };
}

module.exports = { FORMAT, MOST_WINDOWS, cleanSetup, cleanName, exported, imported };
