// The browser check for the pages the desktop draws (its strips), at 375, 582 and 1280 wide and at the narrowest a
// desktop window may be made (its minWidth, read from src/main/windows.js): no horizontal scroll, the page fits its
// own height, and a screenshot of each state is kept. The strips are loaded from the source with a stand-in for the
// bridge, in each state they can be in.
//
// Then each strip in a window at its minimum size (minWidth by minHeight): a plugin or dashboard window's strip, as
// first drawn, asks for no more than the window's minimum height, so it fits the smallest window; the bar's does
// too with no panel open and no notice. Whatever a strip holds beyond its window (a panel or fingerprints the person
// opened, the bar's notices) is reached by scrolling the strip under its first row, which stays in view: every
// control can be brought into view and none is cut off.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PAGES = path.resolve(import.meta.dirname, '..', '..', 'src', 'renderer');
const SHOTS = path.resolve(import.meta.dirname, '..', '..', 'test-results', 'browser-shots');
// Every desktop window, the bar's and each plugin's, is made with the same minimum size.
const WINDOWS = fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'main', 'windows.js'), 'utf8');
const MIN_WIDTH = Number(/minWidth:\s*(\d+)/.exec(WINDOWS)?.[1]);
if (!(MIN_WIDTH > 0)) throw new Error('the windows\' minWidth is not found in src/main/windows.js');
const MIN_HEIGHT = Number(/minHeight:\s*(\d+)/.exec(WINDOWS)?.[1]);
if (!(MIN_HEIGHT > 0)) throw new Error('the windows\' minHeight is not found in src/main/windows.js');
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

// The states a window at its minimum size is checked in: every state above, and what the person can open in them.
const OPENED = {
  'frame-first-certificate-fingerprint': { ...STATES['frame-first-certificate'], open: ['details.prints > summary'] },
  'frame-changed-certificate-fingerprints': { ...STATES['frame-changed-certificate'], open: ['details.prints > summary'] },
  'bar-add': { ...STATES.bar, open: ['button[data-open=add]'] },
  'bar-saveas': { ...STATES.bar, open: ['button[data-open=saveas]'] },
  'bar-browser-sign-in': { page: 'bar.html', info: { ...STATES.bar.info, notice: { kind: 'browser-sign-in' } } },
  'bar-changed-certificate': { page: 'bar.html', info: { ...STATES.bar.info, notice: STATES['frame-changed-certificate'].info.notice } },
  'bar-changed-certificate-fingerprints': { page: 'bar.html', info: { ...STATES.bar.info, notice: STATES['frame-changed-certificate'].info.notice }, open: ['details.prints > summary'] },
};
// Which strips must fit the smallest window whole, as first drawn: every plugin and dashboard window's, and the bar
// with no panel open and no notice.
const MUST_FIT = new Set([...Object.keys(STATES).filter((n) => n.startsWith('frame')), 'bar']);

for (const [name, state] of Object.entries({ ...STATES, ...OPENED })) {
  test(`${name} in a window at its minimum size, ${MIN_WIDTH} by ${MIN_HEIGHT}`, async ({ page }) => {
    let stripHeight = 0;
    await page.setViewportSize({ width: MIN_WIDTH, height: MIN_HEIGHT });
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
    if (MUST_FIT.has(name)) expect(stripHeight, `asks for no more than a window's ${MIN_HEIGHT} px minimum height`).toBeLessThanOrEqual(MIN_HEIGHT);
    // The window gives its strip what it asks for, up to the window's own height (src/main/windows.js, layout).
    await page.setViewportSize({ width: MIN_WIDTH, height: Math.min(Math.max(36, stripHeight || 36), MIN_HEIGHT) });
    for (const opener of state.open || []) await page.click(opener);
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: MIN_WIDTH, height: Math.min(Math.max(36, stripHeight || 36), MIN_HEIGHT) });
    await page.waitForTimeout(100);
    const seen = await page.evaluate(() => {
      const first = document.querySelector('body > .row');
      const controls = [...document.querySelectorAll('button, select, input, summary')].filter((c) => c.getClientRects().length);
      const cut = new Set();
      for (const c of controls) {
        c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = c.getBoundingClientRect();
        const top = first.getBoundingClientRect();
        const below = first.contains(c) ? 0 : top.bottom;
        if (top.top < -0.5) cut.add('the first row scrolled out of view');
        if (r.top < below - 0.5 || r.bottom > innerHeight + 0.5 || r.left < -0.5 || r.right > innerWidth + 0.5) {
          cut.add(`${c.tagName.toLowerCase()} "${(c.textContent || c.name || c.id || '').trim().slice(0, 40)}" at ${Math.round(r.top)}..${Math.round(r.bottom)}, view ${Math.round(below)}..${innerHeight}`);
        }
      }
      return { cut: [...cut], sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, controls: controls.length };
    });
    expect(seen.controls, 'the strip has controls').toBeGreaterThan(0);
    expect(seen.cut, 'every control can be brought into view').toEqual([]);
    expect(seen.sw, 'no horizontal scroll').toBeLessThanOrEqual(seen.cw);
    expect(errors).toEqual([]);
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.evaluate(() => document.documentElement.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, `${name}-minimum.png`) });
  });
}
