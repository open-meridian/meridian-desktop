// The browser check for the pages the desktop draws (its strips), at 375, 582 and 1280 wide and at the narrowest a
// desktop window may be made (its minWidth, read from src/main/windows.js): no horizontal scroll, the page fits its
// own height, and a screenshot of each state is kept. The strips are loaded from the source with a stand-in for the
// bridge, in each state they can be in.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PAGES = path.resolve(import.meta.dirname, '..', '..', 'src', 'renderer');
const SHOTS = path.resolve(import.meta.dirname, '..', '..', 'test-results', 'browser-shots');
// Every desktop window, the bar's and each plugin's, is made with the same minimum size.
const WINDOWS = fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'main', 'windows.js'), 'utf8');
const MIN_WIDTH = Number(/minWidth:\s*(\d+)/.exec(WINDOWS)?.[1]);
if (!(MIN_WIDTH > 0)) throw new Error('the windows\' minWidth is not found in src/main/windows.js');
const WIDTHS = [...new Set([MIN_WIDTH, 375, 582, 1280])];
const deployment = { id: 'd1', name: 'Production with a long deployment name', colour: '#c2410c', address: 'https://meridian.example.com' };
const fp = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';
const bar = { deployments: [deployment, { id: 'd2', name: 'Local', colour: '#2f6fde', address: 'http://meridian.localhost' }], active: 'd1', setups: ['Morning', 'Close'], defaultSetup: 'Morning', launchAtStart: false };
const STATES = {
  'frame': { page: 'frame.html', info: { kind: 'plugin', pinned: false, deployment, instance: 'sample-fx-with-a-long-name', notice: null } },
  'frame-first-certificate': { page: 'frame.html', info: { kind: 'plugin', pinned: true, deployment, instance: 'fx', notice: { kind: 'certificate', change: 'first', hostname: 'meridian.example.com', seen: fp } } },
  'frame-changed-certificate': { page: 'frame.html', info: { kind: 'plugin', pinned: false, deployment, instance: 'fx', notice: { kind: 'certificate', change: 'changed', hostname: 'fx.plugins.meridian.example.com', seen: fp, pinned: fp.replace(/AB/g, '12') } } },
  'frame-browser-sign-in': { page: 'frame.html', info: { kind: 'dashboard', pinned: false, deployment, instance: null, notice: { kind: 'browser-sign-in' } } },
  'bar': { page: 'bar.html', info: { kind: 'bar', pinned: false, deployment, instance: null, notice: null, bar } },
  'bar-empty': { page: 'bar.html', info: { kind: 'bar', pinned: false, deployment: null, instance: null, notice: null, bar: { deployments: [], active: null, setups: [], defaultSetup: null, launchAtStart: false } } },
};

for (const [name, state] of Object.entries(STATES)) {
  for (const width of WIDTHS) {
    test(`${name} at ${width}`, async ({ page }) => {
      let stripHeight = 0;
      await page.setViewportSize({ width, height: 800 });
      await page.exposeFunction('stripHeight', (px) => { stripHeight = px; });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript((info) => {
        window.desk = { info: async () => info, act: async (a, arg) => { if (a === 'height') window.stripHeight(arg); return { done: null }; }, onUpdate: () => {} };
      }, state.info);
      await page.route('http://desk.test/**', (route) => {
        const file = path.join(PAGES, new URL(route.request().url()).pathname);
        route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      });
      await page.goto(`http://desk.test/${state.page}`);
      await page.waitForFunction(() => document.body.scrollHeight > 0);
      await page.waitForTimeout(100);
      // The strip asks the window for its own height, so the page is sized to what it asked for.
      await page.setViewportSize({ width, height: Math.max(36, stripHeight || 36) });
      await page.waitForTimeout(200);
      const sizes = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
      expect(sizes.sw, 'no horizontal scroll').toBeLessThanOrEqual(sizes.cw);
      expect(sizes.sh, 'fits the height it asked for').toBeLessThanOrEqual(sizes.ch);
      expect(errors).toEqual([]);
      expect(stripHeight, 'a strip of at most 420 px').toBeLessThanOrEqual(420);
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${name}-${width}.png`) });
    });
  }
}
