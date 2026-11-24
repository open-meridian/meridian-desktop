// scripts/forbidden-packages.mjs: dockview-enterprise never comes in, by any route, and a Dockview package is MIT.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { forbidden } from '../../scripts/forbidden-packages.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

test('the lock and the manifest hold no dockview-enterprise and no Dockview package that is not MIT', () => {
  assert.deepEqual(forbidden(read('package-lock.json'), read('package.json')), []);
});

test('a planted dockview-enterprise is caught, as a dependency, a dev dependency or nested in the lock', () => {
  assert.equal(forbidden({ packages: {} }, { dependencies: { 'dockview-enterprise': '1.0.0' } }).length, 1);
  assert.equal(forbidden({ packages: {} }, { devDependencies: { 'dockview-enterprise': '1.0.0' } }).length, 1);
  const nested = { packages: { '': {}, 'node_modules/a/node_modules/dockview-enterprise': { version: '1.0.0', dev: true, license: 'SEE LICENSE IN LICENSE' } } };
  assert.equal(forbidden(nested).length, 1);
});

test('Dockview\'s MIT packages pass; one under another licence does not', () => {
  const lock = (license) => ({ packages: { 'node_modules/dockview-core': { version: '4.0.0', license }, 'node_modules/@dockview/x': { version: '1.0.0', license } } });
  assert.deepEqual(forbidden(lock('MIT')), []);
  assert.equal(forbidden(lock('SEE LICENSE IN LICENSE')).length, 2);
});
