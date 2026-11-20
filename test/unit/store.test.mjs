import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import storeModule from '../../src/main/store.js';

test('the store is its owner\'s alone, holds no credential, and pins replace each other', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-store-'));
  const store = new storeModule.Store(dir);
  const d = store.addDeployment({ address: 'meridian.example.com', name: 'Prod' });
  assert.equal(store.addDeployment({ address: 'https://meridian.example.com/' }).id, d.id, 'one entry per address');
  store.pin(d.id, 'AA');
  store.pin(d.id, 'BB');
  const file = path.join(dir, 'desktop.json');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const again = new storeModule.Store(dir);
  assert.deepEqual(again.deployment(d.id).pins, ['BB']);
  assert.deepEqual(Object.keys(again.deployment(d.id)).sort(), ['address', 'colour', 'id', 'name', 'notifications', 'pins']);
  fs.rmSync(dir, { recursive: true });
});
