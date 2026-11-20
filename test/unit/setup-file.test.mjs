import test from 'node:test';
import assert from 'node:assert/strict';
import setupFile from '../../src/main/setup-file.js';

const { exported, imported, cleanSetup, cleanName } = setupFile;
const deployments = { a1: { id: 'a1', address: 'http://meridian.localhost', name: 'Local', colour: '#2f6fde', pins: ['AA:BB'] } };
const setup = {
  windows: [{ deployment: 'a1', path: '/plugins/fx?level=open', bounds: { x: 0, y: 0, width: 800, height: 600 }, display: { x: 0, y: 0, width: 1920, height: 1080 }, pinned: true, snapGroup: 1 }],
  bar: { bounds: { x: 10, y: 10, width: 420, height: 640 }, display: null },
};

test('an exported setup names deployments by address, never their pins, and imports back the same', () => {
  const file = exported('Morning', setup, (id) => deployments[id]);
  const text = JSON.stringify(file);
  assert.ok(!text.includes('AA:BB'), 'no pinned fingerprint leaves');
  assert.ok(!text.includes('a1'), 'no local id leaves');
  const back = imported(text);
  assert.equal(back.name, 'Morning');
  assert.deepEqual(back.deployments, [{ ref: 'd1', address: 'http://meridian.localhost', name: 'Local', colour: '#2f6fde' }]);
  assert.deepEqual(back.setup.windows[0], { ...setup.windows[0], deployment: 'd1' });
});

test('an import refuses what is not a setup, or a window pointing anywhere but a path', () => {
  assert.throws(() => imported('nope'), /not JSON/);
  assert.throws(() => imported('{"format":"x"}'), /not a Meridian Desktop setup/);
  const file = exported('M', setup, (id) => deployments[id]);
  file.windows[0].path = 'https://evil.example/';
  assert.throws(() => imported(JSON.stringify(file)), /path/);
  file.windows[0].path = '/ok';
  file.deployments[0].address = 'http://evil.example';
  assert.throws(() => imported(JSON.stringify(file)), /Plain http/);
});

test('a setup keeps only what it holds: extra fields are dropped', () => {
  const cleaned = cleanSetup({ windows: [{ ...setup.windows[0], cookie: 'x', html: '<p>' }], token: 'x' }, () => true);
  assert.deepEqual(Object.keys(cleaned.windows[0]).sort(), ['bounds', 'deployment', 'display', 'path', 'pinned', 'snapGroup']);
  assert.equal(cleaned.token, undefined);
  assert.throws(() => cleanName(''), /1 to 60/);
});
