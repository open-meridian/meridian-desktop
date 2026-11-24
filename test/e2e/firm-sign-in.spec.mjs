// L1's condition that a deployment signing in through a firm's identity provider tells the person to use their
// browser, against a real one: CI's desktop-firm-sign-in job brings up a deployment from the released chart and
// CLI whose people sign in through a throwaway Keycloak (ci/provider.sh), and runs this. desktop.spec.mjs checks
// the same against a stand-in, which only answers /sign-in with a redirect.
//
// Here the dashboard's own sign-in leaves for the provider, so the desktop must keep the provider's page out of
// its window, say why, and open nothing by itself; the person's own browser, sent to the deployment, then signs in
// at the provider and comes back signed in. Run only by that job: with its settings missing, it fails.
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import { launch, profile, page, strip, until } from './harness.mjs';

const address = process.env.DESKTOP_FIRM_DEPLOYMENT;
const issuer = process.env.DESKTOP_FIRM_ISSUER;
const personFile = process.env.DESKTOP_FIRM_PERSON_FILE;
const opened = (app) => app.evaluate(() => globalThis.openedOutside);
const at = (origin) => (u) => { try { return new URL(u).origin === origin; } catch { return false; } };

test.describe.configure({ mode: 'serial' });

test('a deployment signing in through a firm\'s provider says to use the browser, and the browser signs in there', async () => {
  expect(address && issuer && personFile, 'DESKTOP_FIRM_DEPLOYMENT, DESKTOP_FIRM_ISSUER and DESKTOP_FIRM_PERSON_FILE, set by ci').toBeTruthy();
  const deployment = new URL(address).origin;
  const provider = new URL(issuer).origin;

  // The desktop: the dashboard's sign-in goes to the provider, and the window says to sign in in the browser.
  const dir = profile();
  const app = await launch(dir);
  try {
    const bar = await strip(app);
    await bar.fill('#add input[name=address]', address);
    await bar.click('#add button[type=submit]');
    const view = await page(app, at(deployment), 'the bar\'s view of the deployment');
    await view.waitForSelector('a[href="/sign-in"]');
    await view.click('a[href="/sign-in"]');
    await bar.waitForSelector('[data-notice="browser-sign-in"]');
    expect(app.context().pages().some((p) => at(provider)(p.url())), 'the provider\'s page in no desktop window').toBe(false);
    expect(await opened(app), 'nothing opened in the browser by itself').toEqual([]);
    // Open in browser sends the person's browser to the deployment, which signs them in there.
    await bar.click('[data-notice="browser-sign-in"] button[data-act="openInBrowser"]');
    const sent = await until('the browser to be sent somewhere', async () => { const o = await opened(app); return o.length ? o : null; });
    expect(sent.map((u) => new URL(u).origin)).toEqual([deployment]);
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // The person's browser: the deployment sends it to the provider, which signs the person in and sends them back.
  const person = JSON.parse(fs.readFileSync(personFile, 'utf8'));
  const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  try {
    const tab = await browser.newPage();
    await tab.goto(`${deployment}/sign-in`);
    await tab.waitForURL(at(provider), { timeout: 30_000 });
    expect(tab.url().startsWith(`${issuer}/`), `the provider's own sign-in, under ${issuer}`).toBe(true);
    await tab.fill('#username', person.name);
    await tab.fill('#password', person.password);
    await Promise.all([tab.waitForURL(at(deployment), { timeout: 30_000 }), tab.click('#kc-login')]);
    await tab.waitForLoadState('load');
    expect(new URL(tab.url()).pathname, 'back at the deployment, signed in').not.toMatch(/^\/sign-in/);
    // Signed in: the home no longer offers a sign-in.
    await tab.goto(`${deployment}/`);
    expect(new URL(tab.url()).pathname).toBe('/');
    expect(await tab.locator('a[href="/sign-in"]').count(), 'no sign-in offered once signed in').toBe(0);
  } finally {
    await browser.close();
  }
});
