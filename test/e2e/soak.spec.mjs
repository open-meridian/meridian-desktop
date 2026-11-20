// L1's condition: the desktop's memory stays flat over a one-hour soak. Every plugin the person may open is open
// in a window on one of the plugin's own pages (not the dashboard's Summary), and each of those windows is loaded
// again every ten minutes. One more window, on the first plugin's page, is never loaded again: growth in a page
// left alone shows there. The desktop's working set, summed over all its processes, and the runner's free memory
// are sampled every 30 seconds.
//
// What flat means is test/e2e/soak-rule.mjs. This prints the pass or the fail and its reason, and nothing
// measured: figures stay out of CI's output and out of any file a run keeps.
import { test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import { launch, profile, strip, page, pluginPage, signIn, deploymentA, until } from './harness.mjs';
import { judge } from './soak-rule.mjs';

const MINUTES = Number(process.env.SOAK_MINUTES || 60);

// The desktop's plugin windows and its processes, as the main process counts them.
const counted = (app) => app.evaluate(({ app: a }) => ({
  windows: [...globalThis.desktop.desk.all].filter((w) => w.kind === 'plugin' && !w.win.isDestroyed() && w.view && !w.view.webContents.isDestroyed() && !w.view.webContents.isCrashed()).length,
  processes: a.getAppMetrics().length,
}));

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
    const area = await page(app, (u) => new URL(u).origin === A.address && new URL(u).pathname === `/plugins/${instance}`, `${instance}'s area page`);
    await pluginPage(area, instance, A.address);
  }
  // The window never loaded again: the first plugin's page as its window shows it now, in a window of its own.
  await app.evaluate(() => {
    const { desk, openPlugin } = globalThis.desktop;
    const first = [...desk.all].find((w) => w.kind === 'plugin');
    openPlugin(first.deployment, first.currentPath()).leftAlone = true;
  });
  const hosts = () => app.context().pages().filter((p) => p.frames().some((f) => f !== p.mainFrame() && f.url().includes('.plugins.'))).length;
  await until('every window on a plugin\'s page', () => hosts() === listed.length + 1);
  const start = await counted(app);

  const samples = [], reloads = [];
  const began = Date.now();
  while (Date.now() - began < MINUTES * 60_000) {
    const minute = (Date.now() - began) / 60_000;
    const kb = await app.evaluate(({ app: a }) => a.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0));
    // On Linux, where the soak runs, Node's free memory is the kernel's MemAvailable. (macOS counts its file
    // cache as used, so a busy Mac reads as short of memory and the run fails there, saying so.)
    samples.push({ minute, mb: kb / 1024, free: os.freemem() / os.totalmem() });
    if (Math.floor(minute / 10) > reloads.length) {
      reloads.push(minute);
      await app.evaluate(() => { for (const w of globalThis.desktop.desk.all) if (w.kind === 'plugin' && !w.leftAlone) w.retry(); });
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  const end = await counted(app);
  await app.close();
  await A.close();
  fs.rmSync(dir, { recursive: true, force: true });

  const { ok, reason } = judge({ samples, reloads, start, end, minutes: MINUTES });
  console.log(`soak: ${ok ? 'passed' : 'failed'}: ${reason}`);
  if (!ok) throw new Error(`the soak failed: ${reason}`);
});
