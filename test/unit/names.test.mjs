// scripts/check-names.mjs: no published name is a persona or an upstream trademark.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { published, offending } from '../../scripts/check-names.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');

test('every name the desktop publishes is found, and none names a persona or an upstream trademark', () => {
  const names = published(root);
  for (const where of ['README.md heading', 'package.json productName', 'electron-builder.yml productName', 'the release title', 'a window title', 'bar.html title']) {
    assert.ok(names.some((n) => n.where === where), `no ${where} was read`);
  }
  assert.deepEqual(offending(names), []);
});

test('a planted persona or trademark in a name is caught; running text is not a name', () => {
  for (const name of ['Meridian Trader', 'Researcher Desktop', 'PM Workspace', 'Quant Desk', 'FINOS Desktop', 'Meridian Dockview', 'OpenFin for Meridian']) {
    assert.equal(offending([{ where: 'x', name }]).length, 1, name);
  }
  assert.deepEqual(offending([{ where: 'x', name: 'Meridian Desktop' }, { where: 'y', name: 'Run it from source' }]), []);
});
