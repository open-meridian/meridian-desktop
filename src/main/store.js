'use strict';
// The person's own records on this machine (the-workspace ruling 10): the deployments they added, with a name,
// a colour and pinned certificate fingerprints, and their setups. One JSON file in the application-data
// folder, readable by its owner alone, written whole and renamed into place. It holds no credential: sessions
// are each deployment's partition's cookies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalAddress } = require('./origins');

const COLOURS = ['#2f6fde', '#1f9d6b', '#c2410c', '#9333ea', '#be123c', '#0e7490'];

function empty() { return { version: 1, deployments: [], active: null, setups: {}, defaultSetup: null, last: null }; }

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'desktop.json');
    this.data = empty();
    try {
      const read = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (read && read.version === 1) this.data = { ...empty(), ...read };
    } catch (failed) {
      if (failed.code !== 'ENOENT') this.unreadable = true; // kept aside, never overwritten silently
    }
  }

  save() {
    if (this.unreadable) {
      fs.renameSync(this.file, `${this.file}.unreadable-${Date.now()}`);
      this.unreadable = false;
    }
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
    fs.chmodSync(this.file, 0o600);
  }

  deployments() { return this.data.deployments; }
  deployment(id) { return this.data.deployments.find((d) => d.id === id) || null; }
  byAddress(address) { return this.data.deployments.find((d) => d.address === address) || null; }

  addDeployment({ address, name, colour }) {
    const canonical = canonicalAddress(address);
    const found = this.byAddress(canonical);
    if (found) return found;
    const label = String(name || '').trim().slice(0, 60) || new URL(canonical).hostname;
    const chosen = /^#[0-9a-f]{6}$/i.test(colour || '') ? colour : COLOURS[this.data.deployments.length % COLOURS.length];
    const added = { id: crypto.randomBytes(8).toString('hex'), address: canonical, name: label, colour: chosen, pins: [], notifications: [] };
    this.data.deployments.push(added);
    if (!this.data.active) this.data.active = added.id;
    this.save();
    return added;
  }

  removeDeployment(id) {
    this.data.deployments = this.data.deployments.filter((d) => d.id !== id);
    if (this.data.active === id) this.data.active = this.data.deployments[0]?.id ?? null;
    this.save();
  }

  setActive(id) { if (this.deployment(id)) { this.data.active = id; this.save(); } }

  pin(id, fingerprint) {
    const d = this.deployment(id);
    if (!d) return;
    // Accepting a new certificate replaces the old: a changed one is refused until accepted knowingly.
    d.pins = [fingerprint];
    this.save();
  }

  allowNotifications(id, origin, allowed) {
    const d = this.deployment(id);
    if (!d) return;
    d.notifications = d.notifications.filter((o) => o !== origin);
    if (allowed) d.notifications.push(origin);
    this.save();
  }
}

module.exports = { Store, COLOURS };
