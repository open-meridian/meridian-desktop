// The soak's rule (test/e2e/soak-rule.mjs): what "memory stays flat" means, and what cannot pass as it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, settled } from '../e2e/soak-rule.mjs';

const counts = { windows: 4, processes: 9 };
// One sample every half minute for an hour; reloads every ten minutes, each followed by a spike that settles.
function run({ at = () => 500, free = () => 0.5, minutes = 60 } = {}) {
  const reloads = [];
  for (let m = 10; m < minutes; m += 10) reloads.push(m);
  const samples = [];
  for (let m = 0; m <= minutes; m += 0.5) samples.push({ minute: m, mb: at(m), free: free(m) });
  return { samples, reloads, minutes, start: counts, end: counts };
}
const spike = (m) => (m >= 10 && m < 60 && m % 10 < 2 ? 900 : 500);

test('flat memory passes, and says nothing but that', () => {
  assert.deepEqual(judge(run()), { ok: true, reason: 'memory stayed flat' });
});

test('the two minutes after a reload are left out: a reload\'s spike is not growth', () => {
  assert.equal(settled(run({ at: spike })).some((s) => s.mb === 900), false);
  assert.equal(judge(run({ at: spike })).ok, true);
});

test('a spike that has not settled two minutes after a reload fails', () => {
  const late = judge(run({ at: (m) => (m >= 50 ? 900 : 500) }));
  assert.equal(late.ok, false);
  assert.match(late.reason, /last ten minutes/);
});

test('steady growth fails on the trend, at more than 5% of the baseline over an hour (the product owner, 2026-11-20)', () => {
  // Slow enough that no late sample is 10% over; the trend, carried over an hour, is over 5%.
  const grows = (perMinute) => judge(run({ at: (m) => 500 + (m > 10 ? (m - 10) * perMinute : 0) }));
  assert.equal(grows(0.5).ok, false); // 6% of the baseline an hour
  assert.match(grows(0.5).reason, /trend/);
  assert.equal(grows(0.95).ok, false);
  assert.equal(grows(0.4).ok, true); // 4.8%
});

test('no window, a lost window or a lost process cannot pass', () => {
  assert.match(judge({ ...run(), start: { windows: 0, processes: 3 }, end: { windows: 0, processes: 3 } }).reason, /no plugin window/);
  assert.match(judge({ ...run(), end: { windows: 3, processes: 9 } }).reason, /windows/);
  assert.match(judge({ ...run(), end: { windows: 4, processes: 8 } }).reason, /processes/);
  assert.match(judge({ ...run(), end: { windows: 4, processes: 10 } }).reason, /processes/);
});

test('a runner short of memory decides nothing: the run fails, whatever the samples say', () => {
  const pressed = judge(run({ free: (m) => (m === 30 ? 0.05 : 0.5) }));
  assert.equal(pressed.ok, false);
  assert.match(pressed.reason, /short of memory/);
  assert.match(judge(run({ free: () => undefined })).reason, /free memory/);
});

test('too few samples to judge fails', () => {
  assert.equal(judge(run({ minutes: 4 })).ok, false);
});

test('no reason carries a figure', () => {
  const said = [run(), run({ at: (m) => 500 + m * 3 }), run({ at: (m) => (m >= 50 ? 900 : 500) }), run({ free: () => 0.01 }),
    { ...run(), end: { windows: 1, processes: 2 } }].map((r) => judge(r).reason);
  // The rule's own bounds (10%, ten minutes) are words here; nothing measured is said.
  for (const reason of said) assert.doesNotMatch(reason, /\d/);
});
