import test from 'node:test';
import assert from 'node:assert/strict';
import snapping from '../../src/main/snap.js';

const { snap, groups, fit, NEAR } = snapping;
const area = { x: 0, y: 25, width: 1920, height: 1055 };

test('an edge within reach meets the edge beside it; size is kept', () => {
  const left = { x: 100, y: 100, width: 600, height: 500 };
  const moving = { x: 700 + NEAR - 2, y: 130, width: 400, height: 300 };
  assert.deepEqual(snap(moving, [left], area), { x: 700, y: 130, width: 400, height: 300 });
});

test('edges snap to the work area too, and nothing far away moves a window', () => {
  assert.deepEqual(snap({ x: 5, y: 30, width: 300, height: 200 }, [], area), { x: 0, y: 25, width: 300, height: 200 });
  const far = { x: 400, y: 400, width: 300, height: 200 };
  assert.deepEqual(snap(far, [{ x: 0, y: 0, width: 100, height: 100 }], area), far);
});

test('a window does not snap to one it does not face', () => {
  const other = { x: 100, y: 100, width: 600, height: 100 };
  const moving = { x: 705, y: 600, width: 200, height: 200 };
  assert.equal(snap(moving, [other], area).x, 705);
});

test('touching windows form a snap group; a lone window has none', () => {
  const g = groups([
    { x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 0, width: 100, height: 100 },
    { x: 500, y: 500, width: 100, height: 100 }, { x: 100, y: 100, width: 100, height: 50 },
  ]);
  assert.deepEqual(g, [1, 1, null, 1]);
});

test('bounds from a display that has gone are fitted to another, keeping proportions', () => {
  const r = fit({ x: 960, y: 0, width: 960, height: 1080 }, { x: 0, y: 0, width: 1920, height: 1080 }, { x: 0, y: 0, width: 1280, height: 720 });
  assert.deepEqual(r, { x: 640, y: 0, width: 640, height: 720 });
});
