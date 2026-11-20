// The soak's rule: what "memory stays flat over the soak" means (L1's condition), as one pure function, tested in
// test/unit/soak-rule.test.mjs. Its answer is a pass or a fail and the reason in words: never a figure, since what
// a run measured stays out of CI's output and out of this repository.
//
// A run is: `samples` ({ minute, mb, free }, `free` the runner's free memory as a share of its total), the
// `reloads` (the minutes at which windows were loaded again), `start` and `end` ({ windows, processes }: the
// desktop's plugin windows and its processes, counted once every window showed its page and again at the end),
// and `minutes`, how long it ran.
//
// It fails when:
// - there was no plugin window, or the windows or processes at the end are not as many as at the start (a closed
//   window or a crashed renderer would otherwise read as memory given back);
// - the runner was short of memory at any sample, or its free memory was not recorded: under pressure the
//   system takes pages back, and the working set says nothing about the desktop;
// - a settled sample in the last ten minutes is above the baseline by more than 10%;
// - the least-squares trend of the settled samples from minute 10 on, carried over an hour, adds more than 5%
//   of the baseline (the product owner's ruling, 2026-11-20).
// The baseline is the mean of the settled samples of minutes 5 to 10. A settled sample is one not taken in the
// two minutes after a reload: a page loading again holds the old and the new for a moment.
export const SETTLE_MINUTES = 2;
export const MOST_OVER = 0.10; // of the baseline: a settled sample in the last ten minutes
export const MOST_TREND = 0.05; // of the baseline, over an hour
export const LEAST_FREE = 0.10; // of the runner's memory

export function settled({ samples, reloads }) {
  return samples.filter((s) => !reloads.some((r) => s.minute >= r && s.minute < r + SETTLE_MINUTES));
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fail = (reason) => ({ ok: false, reason });

export function judge(run) {
  const { samples, minutes, start, end } = run;
  if (!start || !end || start.windows < 1) return fail('no plugin window was open, so nothing was soaked');
  if (end.windows !== start.windows) return fail('the plugin windows open at the end are not as many as at the start');
  if (end.processes !== start.processes) return fail('the desktop\'s processes at the end are not as many as at the start');
  if (samples.some((s) => typeof s.free !== 'number' || Number.isNaN(s.free))) return fail('the runner\'s free memory was not recorded with every sample');
  if (samples.some((s) => s.free < LEAST_FREE)) return fail('the runner was short of memory during the run, so its samples decide nothing');
  const kept = settled(run);
  const warm = kept.filter((s) => s.minute >= 5 && s.minute < 10).map((s) => s.mb);
  const late = kept.filter((s) => s.minute >= minutes - 10).map((s) => s.mb);
  const trend = kept.filter((s) => s.minute >= 10);
  if (!warm.length || !late.length || trend.length < 2) return fail('the run was too short to judge: it has no baseline, no late samples or no trend');
  const baseline = mean(warm);
  if (Math.max(...late) > baseline * (1 + MOST_OVER)) return fail('a settled sample in the last ten minutes was above the baseline by more than the rule allows');
  const mx = mean(trend.map((s) => s.minute)), my = mean(trend.map((s) => s.mb));
  const spread = trend.reduce((a, s) => a + (s.minute - mx) ** 2, 0);
  const slope = spread ? trend.reduce((a, s) => a + (s.minute - mx) * (s.mb - my), 0) / spread : 0;
  if (slope * 60 > baseline * MOST_TREND) return fail('the trend, carried over an hour, adds more to the baseline than the rule allows');
  return { ok: true, reason: 'memory stayed flat' };
}
