'use strict';
// Setups: named arrangements of windows, saved from the bar and relaunched (the-workspace ruling 6). They live in
// the person's store on this machine, are exported to a file and imported, and are invisible to the deployment.
// Saving never happens silently, except the arrangement at quitting, kept as "last".
const fs = require('node:fs');
const { screen, dialog } = require('electron');
const { groups, fit } = require('./snap');
const { cleanSetup, cleanName, exported, imported } = require('./setup-file');

class Setups {
  constructor({ store, desk, openWindow, signedIn, openSignIn }) {
    Object.assign(this, { store, desk, openWindow, signedIn, openSignIn });
  }

  names() { return Object.keys(this.store.data.setups).sort(); }

  // The windows open now, as a setup: plugin and dashboard windows on a dashboard path, and the bar's place.
  capture() {
    const wins = [...this.desk.all].filter((w) => w.kind !== 'bar' && !w.win.isDestroyed() && w.currentPath());
    const bounds = wins.map((w) => w.win.getBounds());
    const snapGroup = groups(bounds);
    const bar = this.desk.bar();
    return {
      windows: wins.map((w, i) => ({
        deployment: w.deployment.id, path: w.currentPath(), bounds: bounds[i],
        display: screen.getDisplayMatching(bounds[i]).bounds, pinned: w.win.isAlwaysOnTop(), snapGroup: snapGroup[i],
      })),
      bar: bar ? { bounds: bar.win.getBounds(), display: screen.getDisplayMatching(bar.win.getBounds()).bounds } : null,
    };
  }

  save(name) {
    const n = cleanName(name);
    this.store.data.setups[n] = cleanSetup(this.capture(), (id) => !!this.store.deployment(id));
    this.store.save();
    return n;
  }

  keepLast() {
    try { this.store.data.last = cleanSetup(this.capture(), (id) => !!this.store.deployment(id)); this.store.save(); } catch { /* nothing to keep */ }
  }

  remove(name) { delete this.store.data.setups[name]; if (this.store.data.defaultSetup === name) this.store.data.defaultSetup = null; this.store.save(); }
  setDefault(name) { if (name === null || this.store.data.setups[name]) { this.store.data.defaultSetup = name; this.store.save(); } }

  // Relaunch: a deployment not signed in asks for sign-in once, in one window, and then its windows open. Each
  // window re-enters at its path under the checks every opening meets, so a plugin that is gone or no longer
  // the person's shows the dashboard's refusal in place. A display that has gone is replaced by the nearest.
  async launch(name) {
    const setup = name === 'last' ? this.store.data.last : this.store.data.setups[name];
    if (!setup) throw new Error(`No setup is called ${name}.`);
    const byDeployment = new Map();
    for (const w of setup.windows) {
      if (!this.store.deployment(w.deployment)) continue;
      if (!byDeployment.has(w.deployment)) byDeployment.set(w.deployment, []);
      byDeployment.get(w.deployment).push(w);
    }
    for (const [id, wins] of byDeployment) {
      const deployment = this.store.deployment(id);
      const openAll = () => { for (const w of wins) this.openWindow(deployment, w.path, { bounds: placed(w), pinned: w.pinned }); };
      if (await this.signedIn(deployment, wins[0].path)) openAll();
      else this.openSignIn(deployment, openAll);
    }
    if (setup.bar && this.desk.bar()) this.desk.bar().win.setBounds(placed(setup.bar));
  }

  async exportTo(name, filePath) {
    const setup = this.store.data.setups[name];
    if (!setup) throw new Error(`No setup is called ${name}.`);
    let target = filePath;
    if (!target) {
      const chosen = await dialog.showSaveDialog({ title: 'Export the setup', defaultPath: `${name}.meridian-setup.json`, filters: [{ name: 'Setup', extensions: ['json'] }] });
      if (chosen.canceled || !chosen.filePath) return null;
      target = chosen.filePath;
    }
    const file = exported(name, setup, (id) => this.store.deployment(id));
    fs.writeFileSync(target, JSON.stringify(file, null, 2), { mode: 0o600 });
    return target;
  }

  // Import: each deployment is added by its address (or matched to one already here), never with a pin, and
  // the setup is kept under its name. The person signs in when it is launched.
  async importFrom(filePath) {
    let source = filePath;
    if (!source) {
      const chosen = await dialog.showOpenDialog({ title: 'Import a setup', properties: ['openFile'], filters: [{ name: 'Setup', extensions: ['json'] }] });
      if (chosen.canceled || !chosen.filePaths[0]) return null;
      source = chosen.filePaths[0];
    }
    const stat = fs.statSync(source);
    if (stat.size > 1 << 20) throw new Error('That file is too large to be a setup.');
    const { name, deployments, setup } = imported(fs.readFileSync(source, 'utf8'));
    const ids = new Map();
    for (const d of deployments) ids.set(d.ref, this.store.addDeployment({ address: d.address, name: d.name, colour: d.colour }).id);
    setup.windows = setup.windows.map((w) => ({ ...w, deployment: ids.get(w.deployment) }));
    this.store.data.setups[name] = setup;
    this.store.save();
    return name;
  }
}

// Bounds for a saved window on today's displays: as saved when its display is still there, else fitted to the
// nearest display, keeping proportions.
function placed(saved) {
  const displays = screen.getAllDisplays();
  if (!saved.display) return saved.bounds;
  const same = displays.find((d) => d.bounds.x === saved.display.x && d.bounds.y === saved.display.y
    && d.bounds.width === saved.display.width && d.bounds.height === saved.display.height);
  if (same) return saved.bounds;
  const nearest = screen.getDisplayMatching(saved.bounds);
  return fit(saved.bounds, saved.display, nearest.bounds);
}

module.exports = { Setups };
