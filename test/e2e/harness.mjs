// Launching the desktop under Playwright, and finding its views. The desktop runs from source here (`electron .`):
// the packaged app has Node's inspector fused off, so nothing can drive it; ci checks the fuses on the package.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { standIn } from './stand-in.mjs';

const require = createRequire(import.meta.url);
export const REPO = path.resolve(import.meta.dirname, '..', '..');

export async function until(what, check, ms = 30_000, every = 250) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await check(); if (last) return last; } catch (failed) { last = failed; }
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`timed out after ${ms} ms waiting for ${what}${last instanceof Error ? `: ${last.message}` : ''}`);
}

export function profile() { return fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-desktop-')); }

export async function launch(dir) {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [REPO, `--user-data-dir=${dir}`, '--use-mock-keychain'],
    env: { ...process.env, MERIDIAN_DESKTOP_TEST: '1' },
    cwd: REPO,
  });
  await until('the bar', () => app.evaluate(() => !!globalThis.desktop));
  await app.evaluate(({ shell }) => { globalThis.openedOutside = []; shell.openExternal = async (url) => { globalThis.openedOutside.push(url); }; });
  return app;
}

// The desktop's windows, as the main process knows them.
export function windows(app) {
  return app.evaluate(() => [...globalThis.desktop.desk.all].map((w) => ({
    kind: w.kind, deployment: w.deployment?.id ?? null, path: w.currentPath(), bounds: w.win.getBounds(),
    pinned: w.win.isAlwaysOnTop(), url: w.view && !w.view.webContents.isDestroyed() ? w.view.webContents.getURL() : null,
    notice: w.deployment ? globalThis.desktop.desk.notices.get(w.deployment.id) ?? null : null,
  })));
}

export async function page(app, test, what) {
  return until(what || 'a page', () => app.context().pages().find((p) => { try { return test(p.url()); } catch { return false; } }));
}

export const strip = (app, kind = 'bar') => page(app, (u) => u === `app://desk/${kind === 'bar' ? 'bar' : 'frame'}.html`, `the ${kind} strip`);

export async function signIn(view, person) {
  await view.waitForSelector('#name', { timeout: 30_000 });
  await view.fill('#name', person.name);
  await view.fill('#password', person.password);
  await Promise.all([view.waitForNavigation({ timeout: 30_000 }).catch(() => {}), view.click('button[type=submit]')]);
}

// Deployment A: CI's real deployment when it is named, otherwise a stand-in.
export async function deploymentA() {
  if (process.env.DESKTOP_DEPLOYMENT) {
    const person = JSON.parse(fs.readFileSync(process.env.DESKTOP_PERSON_FILE, 'utf8'));
    const instances = (process.env.DESKTOP_INSTANCES || '').split(',').filter(Boolean);
    return { address: process.env.DESKTOP_DEPLOYMENT, person, instances, real: true, close: async () => {} };
  }
  return standIn({ name: 'stand' });
}

// A self-signed certificate for `name` and its plugin hosts, made for this run and thrown away with it.
export function certificate(name, dir) {
  const key = path.join(dir, `${name}-${Date.now()}.key`), cert = `${key}.crt`;
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '2',
    '-subj', `/CN=${name}.localhost`, '-addext', `subjectAltName=DNS:${name}.localhost,DNS:*.plugins.${name}.localhost`,
    '-keyout', key, '-out', cert], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

export { standIn };
