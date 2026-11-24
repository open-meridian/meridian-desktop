// The L1 done-when checks of spec/the-desktop-shows-the-same-pages (meridian-design), driven by Playwright.
// Run in order: each builds on the profile the one before left.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launch, profile, windows, page, pluginPage, strip, signIn, deploymentA, standIn, certificate, until } from './harness.mjs';

test.describe.configure({ mode: 'serial' });

let A, B, oidc, app, dir;
const opened = (app) => app.evaluate(() => globalThis.openedOutside);
const areaOf = (i) => (u) => { const x = new URL(u); return x.origin === A.address && x.pathname === `/plugins/${i}`; };

test.beforeAll(async () => {
  A = await deploymentA();
  B = await standIn({ name: 'second' });
  oidc = await standIn({ name: 'firm', oidc: true });
  dir = profile();
});
test.afterAll(async () => {
  if (app) await app.close().catch(() => {});
  for (const s of [A, B, oidc]) await s?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a deployment is added, and its local account signs in inside the window', async () => {
  app = await launch(dir);
  const bar = await strip(app);
  await bar.fill('#add input[name=address]', A.address);
  await bar.fill('#add input[name=name]', 'Deployment A');
  await bar.click('#add button[type=submit]');
  const view = await page(app, (u) => new URL(u).origin === A.address, 'the bar\'s view of A');
  await view.waitForSelector('a[href="/sign-in"]');
  await view.click('a[href="/sign-in"]');
  await signIn(view, A.person);
  await view.waitForSelector('li[data-instance]');
});

test('the bar shows the plugins home, and opens every plugin the person may open, on its area page', async () => {
  const view = await page(app, (u) => new URL(u).origin === A.address && new URL(u).pathname === '/');
  const listed = await view.$$eval('li[data-instance]', (rows) => rows.map((r) => r.dataset.instance));
  // Every plugin launched for the run is listed; every one listed is opened below.
  expect(listed).toEqual(expect.arrayContaining(A.instances));
  expect(listed.length).toBeGreaterThan(0);
  for (const instance of listed) {
    // Clicked from the main process: Playwright waits forever on a navigation the desktop cancels.
    await app.evaluate((_e, i) => globalThis.desktop.desk.bar().view.webContents.executeJavaScript(
      `document.querySelector('li[data-instance="${i}"] a.plugin-level').click()`), instance);
    const area = await page(app, areaOf(instance), `${instance}'s area page`);
    // Top-level: the window's own page is the dashboard's area page; the plugin page is framed on its own host.
    const host = `${instance}.plugins.${new URL(A.address).hostname}`;
    const framed = await pluginPage(area, instance, A.address);
    expect(areaOf(instance)(area.url())).toBe(true);
    expect(new URL(framed.url()).hostname).toBe(host);
    expect(new URL(view.url()).pathname).toBe('/');
  }
  const wins = await windows(app);
  for (const instance of listed) expect(wins.some((w) => w.kind === 'plugin' && w.path?.startsWith(`/plugins/${instance}`))).toBe(true);
});

test('no page finds require, process or a bridge; the strips are the only views with one', async () => {
  let checked = 0, pluginHosts = 0;
  for (const p of app.context().pages()) {
    const url = p.url();
    for (const frame of p.frames()) {
      const found = await frame.evaluate(() => ['require', 'process', 'desk', 'electron', 'ipcRenderer', 'module', 'Buffer']
        .filter((name) => typeof globalThis[name] !== 'undefined')).catch(() => null);
      if (found === null) continue;
      if (url.startsWith('app://desk/') && frame === p.mainFrame()) expect(found).toEqual(['desk']);
      else { expect(found, `${frame.url()} in ${url}`).toEqual([]); checked++; }
      if (frame.url().includes('.plugins.')) pluginHosts++;
    }
  }
  const plugins = (await windows(app)).filter((w) => w.kind === 'plugin').length;
  expect(checked).toBeGreaterThanOrEqual(1 + 2 * plugins); // the bar's page, and each window's page and plugin page
  expect(pluginHosts).toBeGreaterThanOrEqual(plugins);
});

test('another origin opens in the person\'s browser, never in a window', async () => {
  const instance = (await windows(app)).find((w) => w.kind === 'plugin').path.split('/')[2].split('?')[0];
  const area = await page(app, areaOf(instance));
  const before = area.url();
  await area.evaluate(() => { location.href = 'https://example.org/from-the-page'; });
  await until('the link outside', async () => (await opened(app)).includes('https://example.org/from-the-page'));
  await area.evaluate(() => window.open('https://example.org/a-new-window'));
  await until('the window outside', async () => (await opened(app)).includes('https://example.org/a-new-window'));
  expect(area.url()).toBe(before);
  expect((await windows(app)).every((w) => !w.url || !w.url.startsWith('https://example.org'))).toBe(true);
});

test('two windows dragged near each other snap edge to edge', async () => {
  const result = await app.evaluate(() => {
    const [a, b] = [...globalThis.desktop.desk.all].filter((w) => w.kind === 'plugin');
    a.win.setBounds({ x: 100, y: 120, width: 600, height: 420 });
    b.win.setBounds({ x: 707, y: 150, width: 500, height: 400 });
    b.win.emit('moved');
    return b.win.getBounds();
  });
  expect(result.x).toBe(700);
});

test('two deployments keep their sessions apart', async () => {
  const bar = await strip(app);
  await bar.click('button[data-open=add]');
  await bar.fill('#add input[name=address]', B.address);
  await bar.click('#add button[type=submit]');
  const view = await page(app, (u) => new URL(u).origin === B.address, 'the bar\'s view of B');
  await view.click('a[href="/sign-in"]');
  await signIn(view, B.person);
  await view.waitForSelector('#cookies');
  const jars = await app.evaluate(async () => {
    const out = {};
    for (const d of globalThis.desktop.store.deployments()) {
      const ses = globalThis.desktop.partitions.forDeployment(d, {});
      out[d.address] = (await ses.cookies.get({})).map((c) => c.domain.replace(/^\./, ''));
    }
    return out;
  });
  const hostA = new URL(A.address).hostname, hostB = new URL(B.address).hostname;
  expect(jars[A.address]).toContain(hostA);
  expect(jars[A.address]).not.toContain(hostB);
  expect(jars[B.address]).toEqual([hostB]);
  expect(await view.textContent('#cookies')).not.toContain('meridian_session=');
  await bar.selectOption('#deployments', { label: 'Deployment A' });
  await page(app, (u) => new URL(u).origin === A.address && new URL(u).pathname === '/');
});

test('a setup is saved, and relaunching puts back each window: its path, bounds and pin', async () => {
  const saved = await app.evaluate(() => {
    const plugins = [...globalThis.desktop.desk.all].filter((w) => w.kind === 'plugin');
    plugins[0].win.setAlwaysOnTop(true, 'floating');
    return plugins.map((w) => ({ path: w.currentPath(), bounds: w.win.getBounds(), pinned: w.win.isAlwaysOnTop() }));
  });
  const bar = await strip(app);
  await bar.click('button[data-open=saveas]');
  await bar.fill('#saveas input[name=name]', 'Morning');
  await bar.click('#saveas button[type=submit]');
  await until('the setup saved', () => app.evaluate(() => !!globalThis.desktop.store.data.setups.Morning));
  await app.close();
  app = await launch(dir);
  expect((await windows(app)).filter((w) => w.kind !== 'bar')).toEqual([]);
  const relaunchBar = await strip(app);
  await relaunchBar.selectOption('#setups', 'Morning');
  await relaunchBar.click('#launch');
  const back = await until('every window back', async () => {
    const wins = (await windows(app)).filter((w) => w.kind === 'plugin' && w.path);
    return wins.length === saved.length ? wins : null;
  });
  for (const s of saved) {
    const w = back.find((b) => b.path === s.path);
    expect(w, `${s.path} in ${JSON.stringify(back)}`).toBeTruthy();
    expect(w.bounds).toEqual(s.bounds);
    expect(w.pinned).toBe(s.pinned);
  }
});

test('a window whose plugin is gone shows the dashboard\'s refusal in place', async () => {
  await app.evaluate(() => {
    const { store } = globalThis.desktop;
    const id = store.byAddress(store.deployments()[0].address).id;
    store.data.setups.Gone = { windows: [{ deployment: id, path: '/plugins/gone-plugin?level=admin', bounds: { x: 50, y: 60, width: 700, height: 500 }, display: null, pinned: false, snapGroup: null }], bar: null };
    store.save();
    globalThis.desktop.desk.bar().update();
  });
  const bar = await strip(app);
  await bar.selectOption('#setups', 'Gone');
  await bar.click('#launch');
  const refused = await page(app, areaOf('gone-plugin'), 'the lost plugin\'s window');
  await expect(refused.locator('body')).toContainText('No plugin gone-plugin runs in this deployment');
});

test('a setup exported and imported on a fresh profile relaunches the same way, after sign-in', async () => {
  const file = path.join(dir, 'morning.json');
  await app.evaluate((_e, f) => globalThis.desktop.setups.exportTo('Morning', f), file);
  const exported = fs.readFileSync(file, 'utf8');
  expect(exported).not.toMatch(/meridian_session|password|pins/);
  const expected = JSON.parse(exported).windows;
  await app.close();
  const fresh = profile();
  app = await launch(fresh);
  await app.evaluate((_e, f) => globalThis.desktop.setups.importFrom(f), file);
  const bar = await strip(app);
  await app.evaluate(() => globalThis.desktop.setups.launch('Morning'));
  const signInView = await page(app, (u) => new URL(u).origin === A.address && new URL(u).pathname === '/sign-in', 'one sign-in window');
  await signIn(signInView, A.person);
  const back = await until('the imported setup\'s windows', async () => {
    const wins = (await windows(app)).filter((w) => w.kind === 'plugin' && w.path);
    return wins.length === expected.length ? wins : null;
  });
  for (const e of expected) expect(back.find((w) => w.path === e.path)?.bounds).toEqual(e.bounds);
  await app.close();
  app = null;
  fs.rmSync(fresh, { recursive: true, force: true });
});

test('a deployment that signs in through a firm\'s identity provider says to use the browser', async () => {
  const fresh = profile();
  app = await launch(fresh);
  const bar = await strip(app);
  await bar.fill('#add input[name=address]', oidc.address);
  await bar.click('#add button[type=submit]');
  const view = await page(app, (u) => new URL(u).origin === oidc.address);
  await view.click('a[href="/sign-in"]');
  await bar.waitForSelector('[data-notice="browser-sign-in"]');
  expect((await opened(app)).some((u) => u.includes('identity.example.invalid'))).toBe(false);
  await app.close();
  app = null;
});

test('a self-signed certificate is pinned when accepted, and a changed one is refused with both fingerprints', async () => {
  const fresh = profile();
  let pinned = await standIn({ name: 'pinned', tls: certificate('pinned', fresh) });
  const port = pinned.port;
  app = await launch(fresh);
  const bar = await strip(app);
  await bar.fill('#add input[name=address]', pinned.address);
  await bar.click('#add button[type=submit]');
  // The bar is narrow, so its fingerprints are behind a click: present, and read from the notice.
  await bar.waitForSelector('[data-notice="certificate"] code[data-fingerprint="seen"]', { state: 'attached' });
  const first = await bar.textContent('code[data-fingerprint="seen"]');
  await bar.click('button[data-act="acceptCertificate"]');
  const view = await page(app, (u) => new URL(u).origin === pinned.address, 'the pinned deployment');
  await view.waitForSelector('a[href="/sign-in"]');
  expect(await app.evaluate(() => globalThis.desktop.store.deployments()[0].pins)).toEqual([first]);

  // The same address, now answering with another certificate.
  await pinned.close();
  const https = await import('node:https');
  const second = certificate('pinned', fresh);
  pinned = await new Promise((resolve) => {
    const s = https.createServer({ key: second.key, cert: second.cert }, (req, res) => { res.end('<p id="changed">served</p>'); });
    s.listen(port, '127.0.0.1', () => resolve({ close: () => new Promise((r) => { s.closeAllConnections(); s.close(r); }) }));
  });
  await view.evaluate(() => { location.reload(); }).catch(() => {});
  await bar.waitForSelector('code[data-fingerprint="pinned"]', { state: 'attached' });
  expect(await bar.textContent('code[data-fingerprint="pinned"]')).toBe(first);
  expect(await bar.textContent('code[data-fingerprint="seen"]')).not.toBe(first);
  expect(await view.locator('#changed').count()).toBe(0);
  // Refused: "Not now" answers the held verification no, and the page never loads.
  await bar.click('button[data-act="dismissNotice"]');
  await until('the refusal', () => app.context().pages().some((p) => p.url().startsWith('chrome-error:')));
  expect(await app.evaluate(() => globalThis.desktop.store.deployments()[0].pins)).toEqual([first]);
  await app.close();
  app = null;
  await pinned.close();
  fs.rmSync(fresh, { recursive: true, force: true });
});
