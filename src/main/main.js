'use strict';
// Meridian Desktop's main process: the app:// pages, the windows, the partitions, setups and updates.
// spec/the-desktop-shows-the-same-pages (meridian-design), L1 of its decision 8.
const fs = require('node:fs');
const path = require('node:path');
const { app, protocol, ipcMain, shell, dialog } = require('electron');
const { Store } = require('./store');
const { Desk } = require('./windows');
const { Setups } = require('./setups');
const partitions = require('./partitions');
const updates = require('./updates');
const { mayOpenOutside, isKeptPath } = require('./origins');

const profile = app.commandLine.getSwitchValue('user-data-dir');
if (profile) app.setPath('userData', path.resolve(profile));
if (!app.requestSingleInstanceLock()) app.exit(0);

app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);

const PAGES = path.join(__dirname, '..', 'renderer');
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; "
  + "frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function log(line) { process.stdout.write(`${line}\n`); }

let store, desk, setups;
const held = new Map(); // deployment id -> certificate verifications waiting on the person

// The person's answer to every held verification of a deployment: yes only for the certificate they accepted.
function answerHeld(id, accepted) {
  for (const h of held.get(id) || []) h.answer(accepted !== null && h.seen === accepted);
  held.delete(id);
}

function hardeningHooks() {
  return {
    store,
    onCertificate: (deployment, tell, answer) => {
      if (!held.has(deployment.id)) held.set(deployment.id, []);
      held.get(deployment.id).push({ seen: tell.seen, answer });
      desk.setNotice(deployment.id, { ...tell, kind: 'certificate', change: tell.kind });
    },
    askNotifications: async (deployment, origin) => {
      const { response } = await dialog.showMessageBox({
        type: 'question', buttons: ['Allow', 'Don\'t allow'], defaultId: 1, cancelId: 1,
        message: `Allow notifications from ${origin}?`, detail: `On ${deployment.name}. You can change this by removing the deployment.`,
      });
      store.allowNotifications(deployment.id, origin, response === 0);
      return response === 0;
    },
  };
}

function partitionFor(deployment) {
  partitions.forDeployment(deployment, hardeningHooks());
  return partitions.partitionOf(deployment);
}

function openOutside(url) { if (mayOpenOutside(url)) shell.openExternal(url); }
function openPlugin(deployment, target, opts) { return desk.open('plugin', deployment, target, opts); }
function openPage(deployment, target, opts) { return desk.open('dashboard', deployment, target, opts); }
function openWindow(deployment, target, opts) {
  return /^\/plugins\/[^/?]+\/?(\?|$)/.test(target) ? openPlugin(deployment, target, opts) : openPage(deployment, target, opts);
}

// Whether the person has a session on the deployment: the dashboard sends somebody without one to /sign-in.
async function signedIn(deployment, target) {
  try {
    const ses = partitions.forDeployment(deployment, hardeningHooks());
    const res = await ses.fetch(new URL(isKeptPath(target) ? target : '/', deployment.address).href, { redirect: 'manual' });
    // Followed or not, a redirect from a page that needs a session is the way to sign-in.
    const redirected = res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
    const landed = res.url ? new URL(res.url).pathname : '';
    return !redirected && landed !== '/sign-in';
  } catch (failed) {
    // Electron's fetch refuses a redirect under `manual` by throwing: the page sent the person to sign in.
    if (/redirect/i.test(failed.message)) return false;
    log(`sign-in check on ${deployment.name}: ${failed.message}`);
    return true; // unreachable or refused: the windows open and say why
  }
}

function openSignIn(deployment, then) {
  const win = openPage(deployment, '/sign-in', { bounds: { width: 520, height: 640 } });
  win.afterSignIn = then;
}

function onWindowUpdate(win) {
  const p = win.currentPath();
  if (win.afterSignIn && p && !p.startsWith('/sign-in')) {
    const then = win.afterSignIn;
    win.afterSignIn = null;
    win.win.close();
    then();
  }
}

// The strips' requests. Only a strip's own top frame, loaded from app://desk/, is answered.
function stripOf(event) {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame || !frame.url.startsWith('app://desk/')) return null;
  return desk.byStrip(event.sender);
}

function barState() {
  return {
    deployments: store.deployments().map(({ id, name, colour, address }) => ({ id, name, colour, address })),
    active: store.data.active, setups: setups.names(), defaultSetup: store.data.defaultSetup,
    launchAtStart: store.data.launchDefaultAtStart === true,
  };
}

const ACTIONS = {
  close: (w) => w.win.close(),
  minimize: (w) => w.win.minimize(),
  maximize: (w) => (w.win.isMaximized() ? w.win.unmaximize() : w.win.maximize()),
  pin: (w) => { w.win.setAlwaysOnTop(!w.win.isAlwaysOnTop(), 'floating'); w.update(); },
  duplicate: (w) => { if (w.kind !== 'bar' && w.currentPath()) openWindow(w.deployment, w.currentPath()); },
  reload: (w) => w.retry(),
  height: (w, px) => w.setStripHeight(Number(px) || 0),
  openInBrowser: (w) => w.deployment && openOutside(w.deployment.address),
  acceptCertificate: (w) => {
    const notice = desk.notices.get(w.deployment?.id);
    if (!notice || notice.kind !== 'certificate') return;
    store.pin(w.deployment.id, notice.seen);
    desk.setNotice(w.deployment.id, null);
    answerHeld(w.deployment.id, notice.seen);
  },
  dismissNotice: (w) => { if (!w.deployment) return; answerHeld(w.deployment.id, null); desk.setNotice(w.deployment.id, null); },
};
const BAR_ACTIONS = {
  addDeployment: (w, form) => {
    const added = store.addDeployment(form || {});
    store.setActive(added.id);
    w.attach(added, '/');
    return barState();
  },
  removeDeployment: (w, id) => {
    for (const each of [...desk.all]) if (each.kind !== 'bar' && each.deployment?.id === id) each.win.close();
    store.removeDeployment(id);
    const next = store.deployment(store.data.active);
    if (next) w.attach(next, '/'); else if (w.view) { w.win.contentView.removeChildView(w.view); w.view.webContents.close(); w.view = null; w.deployment = null; }
    return barState();
  },
  selectDeployment: (w, id) => { const d = store.deployment(id); if (d) { store.setActive(id); w.attach(d, '/'); } return barState(); },
  saveSetup: (w, name) => { setups.save(name); return barState(); },
  launchSetup: async (w, name) => { await setups.launch(name); return barState(); },
  removeSetup: (w, name) => { setups.remove(name); return barState(); },
  setDefault: (w, name) => { setups.setDefault(name || null); return barState(); },
  launchAtStart: (w, on) => { store.data.launchDefaultAtStart = on === true; store.save(); return barState(); },
  exportSetup: async (w, name) => { await setups.exportTo(name); return barState(); },
  importSetup: async () => { await setups.importFrom(); return barState(); },
};

function wireIpc() {
  ipcMain.handle('desk:info', (event) => {
    const w = stripOf(event);
    if (!w) return null;
    return { ...w.info(), bar: w.kind === 'bar' ? barState() : null, version: app.getVersion() };
  });
  ipcMain.handle('desk:act', async (event, action, arg) => {
    const w = stripOf(event);
    if (!w || typeof action !== 'string') return { refused: 'not a strip' };
    const act = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : (w.kind === 'bar' && Object.hasOwn(BAR_ACTIONS, action) ? BAR_ACTIONS[action] : null);
    if (!act) return { refused: `no action ${action}` };
    try { return { done: (await act(w, arg)) ?? null }; } catch (failed) { return { refused: failed.message }; }
  });
}

function servePages() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    if (url.host !== 'desk') return new Response('not found', { status: 404 });
    const file = path.normalize(path.join(PAGES, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PAGES + path.sep) || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(fs.readFileSync(file), {
      headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-security-policy': PAGE_CSP, 'x-content-type-options': 'nosniff' },
    });
  });
}

// Every web contents: no <webview>, no window the desktop did not make, nothing loaded outside its own rules.
app.on('web-contents-created', (_event, wc) => {
  wc.on('will-attach-webview', (event) => event.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (app.isPackaged) wc.on('devtools-opened', () => wc.closeDevTools());
});

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  desk = new Desk({ partitionFor, openOutside, openPlugin, openPage, notify: onWindowUpdate, onClosed: (w) => { if (w.kind === 'bar') app.quit(); } });
  setups = new Setups({ store, desk, openWindow, signedIn, openSignIn });
  servePages();
  wireIpc();
  const active = store.deployment(store.data.active);
  const bar = desk.open('bar', active, '/', { bounds: store.data.last?.bar?.bounds });
  if (store.data.launchDefaultAtStart && store.data.defaultSetup) setups.launch(store.data.defaultSetup).catch((f) => log(f.message));
  updates.start(log);
  if (process.env.MERIDIAN_DESKTOP_TEST === '1' && !app.isPackaged) {
    globalThis.desktop = { store, desk, setups, partitions, bar, openPlugin, openWindow, signedIn };
  }
});

app.on('before-quit', () => { if (setups) setups.keepLast(); });
app.on('window-all-closed', () => app.quit());
app.on('second-instance', () => { const bar = desk?.bar(); if (bar) { if (bar.win.isMinimized()) bar.win.restore(); bar.win.focus(); } });
