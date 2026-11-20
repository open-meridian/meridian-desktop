// L1's condition: the desktop's memory stays flat over a one-hour soak. Every plugin the person may open is open
// in a window, and each window's page is loaded again every ten minutes. The desktop's working set, summed over
// all its processes, is sampled every 30 seconds into test-results/soak.json.
// Flat means, against the mean of minutes 5 to 10 (the warm baseline):
// - no sample in the last ten minutes above the baseline by more than 10%; and
// - the least-squares trend from minute 10 on adding no more than 10% of the baseline over the hour.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launch, profile, strip, page, signIn, deploymentA, windows, until, REPO } from './harness.mjs';

const MINUTES = Number(process.env.SOAK_MINUTES || 60);

test('memory stays flat over the soak', async () => {
  test.skip(!process.env.SOAK, 'the soak runs on its schedule (SOAK=1)');
  test.setTimeout((MINUTES + 10) * 60_000);
  const A = await deploymentA();
  const dir = profile();
  const app = await launch(dir);
  const bar = await strip(app);
  await bar.fill('#add input[name=address]', A.address);
  await bar.click('#add button[type=submit]');
  const view = await page(app, (u) => new URL(u).origin === A.address);
  await view.click('a[href="/sign-in"]');
  await signIn(view, A.person);
  await view.waitForSelector('li[data-instance]');
  const listed = await view.$$eval('li[data-instance]', (rows) => rows.map((r) => r.dataset.instance));
  for (const instance of listed) {
    await app.evaluate((_e, i) => globalThis.desktop.desk.bar().view.webContents.executeJavaScript(
      `document.querySelector('li[data-instance="${i}"] a.plugin-level').click()`), instance);
  }
  await until('every window', async () => (await windows(app)).filter((w) => w.kind === 'plugin' && w.path).length === listed.length);

  const samples = [];
  const start = Date.now();
  let reloaded = 0;
  while (Date.now() - start < MINUTES * 60_000) {
    const minute = (Date.now() - start) / 60_000;
    const kb = await app.evaluate(({ app: a }) => a.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0));
    samples.push({ minute: Number(minute.toFixed(2)), mb: Math.round(kb / 1024) });
    if (Math.floor(minute / 10) > reloaded) {
      reloaded = Math.floor(minute / 10);
      await app.evaluate(() => { for (const w of globalThis.desktop.desk.all) if (w.kind === 'plugin') w.retry(); });
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  fs.mkdirSync(path.join(REPO, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(REPO, 'test-results', 'soak.json'), JSON.stringify({ minutes: MINUTES, windows: listed.length, samples }, null, 1));
  await app.close();
  await A.close();
  fs.rmSync(dir, { recursive: true, force: true });

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const baseline = mean(samples.filter((s) => s.minute >= 5 && s.minute < 10).map((s) => s.mb));
  const lastTen = samples.filter((s) => s.minute >= MINUTES - 10).map((s) => s.mb);
  const trend = samples.filter((s) => s.minute >= 10);
  const mx = mean(trend.map((s) => s.minute)), my = mean(trend.map((s) => s.mb));
  const slope = trend.reduce((a, s) => a + (s.minute - mx) * (s.mb - my), 0) / trend.reduce((a, s) => a + (s.minute - mx) ** 2, 0);
  console.log(`soak: baseline ${baseline.toFixed(0)} MB, last ten minutes at most ${Math.max(...lastTen)} MB, trend ${slope.toFixed(3)} MB/min`);
  expect(Math.max(...lastTen)).toBeLessThanOrEqual(baseline * 1.10);
  expect(slope * 60).toBeLessThanOrEqual(baseline * 0.10);
});
