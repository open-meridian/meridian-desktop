'use strict';
// A desktop window is one BaseWindow holding two WebContentsViews (spec, decision 1):
// - the strip, loaded from the application (app://desk/), the only view with a preload. It names what the window
//   shows (deployment, plugin) and holds the controls; for the bar it also holds the deployments and setups;
// - under it, the deployment view, in that deployment's partition, with no preload, no Node, no IPC and no
//   <webview>, showing a dashboard page top-level: a plugin's area page (`/plugins/{instance}?level=&tab=`),
//   or for the bar, the plugins home until the dashboard's bar page ships.
// A page never draws the strip, and the two share no DOM and no channel.
const path = require('node:path');
const { BaseWindow, WebContentsView, screen, app } = require('electron');
const { onDeployment, areaInstance } = require('./origins');
const { snap } = require('./snap');

const PRELOAD = path.join(__dirname, '..', 'preload', 'strip.js');
const STRIP = { bar: 84, plugin: 36, dashboard: 36 };

const STRIP_PREFS = {
  preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInSubFrames: false,
  webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, spellcheck: false, devTools: !app.isPackaged,
};
function pagePrefs(partition) {
  return {
    partition, contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
    safeDialogs: true, navigateOnDragDrop: false, spellcheck: false, devTools: !app.isPackaged,
  };
}

class Desk {
  // hooks: partitionFor(deployment) -> partition name, hardened; openOutside(url); notify(); onClosed(win)
  constructor(hooks) { this.hooks = hooks; this.all = new Set(); this.notices = new Map(); }

  byStrip(webContents) { return [...this.all].find((w) => w.strip.webContents === webContents) || null; }
  ofKind(kind) { return [...this.all].filter((w) => w.kind === kind); }
  bar() { return this.ofKind('bar')[0] || null; }

  open(kind, deployment, target, { bounds, pinned } = {}) {
    const win = new DeskWindow(this, kind, deployment, target, { bounds, pinned });
    this.all.add(win);
    return win;
  }

  // What every strip of a deployment shows, for example a certificate to accept or a sign-in to do in the browser.
  setNotice(deploymentId, notice) {
    if (notice) this.notices.set(deploymentId, notice); else this.notices.delete(deploymentId);
    for (const w of this.all) if (w.deployment?.id === deploymentId || w.kind === 'bar') w.update();
  }
}

class DeskWindow {
  constructor(desk, kind, deployment, target, { bounds, pinned }) {
    this.desk = desk; this.kind = kind; this.deployment = deployment; this.stripHeight = STRIP[kind];
    const size = bounds || (kind === 'bar' ? { width: 420, height: 640 } : { width: 1100, height: 760 });
    this.win = new BaseWindow({
      ...size, minWidth: 320, minHeight: 200, frame: false, show: true, backgroundColor: '#111318',
      title: kind === 'bar' ? 'Meridian Desktop' : 'Meridian Desktop window',
    });
    if (pinned) this.win.setAlwaysOnTop(true, 'floating');
    this.strip = new WebContentsView({ webPreferences: STRIP_PREFS });
    this.win.contentView.addChildView(this.strip);
    this.strip.webContents.loadURL(`app://desk/${kind === 'bar' ? 'bar' : 'frame'}.html`);
    if (deployment) this.attach(deployment, target);
    this.layout();
    this.win.on('resize', () => this.layout());
    this.win.on('moved', () => this.snapNow());
    if (process.platform === 'linux') {
      let timer = null;
      this.win.on('move', () => { clearTimeout(timer); timer = setTimeout(() => this.snapNow(), 200); });
    }
    this.win.on('closed', () => {
      for (const v of [this.view, this.strip]) if (v && !v.webContents.isDestroyed()) v.webContents.close();
      desk.all.delete(this);
      desk.hooks.onClosed(this);
    });
  }

  // The deployment view: replaced when the bar switches deployment.
  attach(deployment, target) {
    if (this.view) { this.win.contentView.removeChildView(this.view); this.view.webContents.close(); }
    this.deployment = deployment;
    this.view = new WebContentsView({ webPreferences: pagePrefs(this.desk.hooks.partitionFor(deployment)) });
    this.win.contentView.addChildView(this.view);
    this.guard(this.view.webContents);
    this.attempted = new URL(target || '/', deployment.address).href;
    this.view.webContents.loadURL(this.attempted).catch(() => {});
    this.layout();
    this.update();
  }

  guard(wc) {
    const address = () => this.deployment.address;
    let started = null; // the URL the current main-frame navigation began at
    wc.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      started = details.url;
      if (!details.url.startsWith('chrome-error:')) this.attempted = details.url;
    });
    wc.on('will-frame-navigate', (event) => {
      const url = event.url;
      if (url === 'about:blank' || url === 'about:srcdoc') return;
      if (!onDeployment(address(), url)) { event.preventDefault(); this.desk.hooks.openOutside(url); return; }
      if (event.isMainFrame && this.kind === 'bar' && areaInstance(address(), url)) {
        event.preventDefault();
        this.desk.hooks.openPlugin(this.deployment, pathOf(url));
      }
    });
    wc.on('will-redirect', (event) => {
      if (onDeployment(address(), event.url)) return;
      event.preventDefault();
      const from = started && onDeployment(address(), started) ? new URL(started).pathname : '';
      if (event.isMainFrame && from === '/sign-in') {
        // Firm sign-in (OIDC) goes through the person's browser, and the hand-off to the desktop is L2.
        this.desk.setNotice(this.deployment.id, { kind: 'browser-sign-in' });
      } else if (event.isMainFrame) {
        this.desk.hooks.openOutside(event.url);
      }
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (!onDeployment(address(), url)) this.desk.hooks.openOutside(url);
      else if (areaInstance(address(), url)) this.desk.hooks.openPlugin(this.deployment, pathOf(url));
      else this.desk.hooks.openPage(this.deployment, url);
      return { action: 'deny' };
    });
    wc.on('did-navigate', () => this.update());
    wc.on('did-navigate-in-page', () => this.update());
    wc.on('page-title-updated', () => this.update());
  }

  // Load again what the window last tried to show: a reload of Chromium's error page would reload the error.
  retry() {
    if (!this.view || this.view.webContents.isDestroyed()) return;
    this.view.webContents.loadURL(this.attempted || this.deployment.address).catch(() => {});
  }

  layout() {
    const { width, height } = this.win.getContentBounds();
    const h = Math.min(this.stripHeight, height);
    this.strip.setBounds({ x: 0, y: 0, width, height: h });
    if (this.view) this.view.setBounds({ x: 0, y: h, width, height: Math.max(0, height - h) });
  }

  setStripHeight(px) {
    const base = STRIP[this.kind];
    this.stripHeight = Math.max(base, Math.min(Math.round(px), 420));
    this.layout();
  }

  // Where the window shows now: a path on the deployment's dashboard host, or null (a plugin host, or nothing).
  currentPath() {
    if (!this.view || this.view.webContents.isDestroyed()) return null;
    const url = this.view.webContents.getURL();
    if (!url || !onDeployment(this.deployment.address, url)) return null;
    const u = new URL(url);
    return u.origin === this.deployment.address ? `${u.pathname}${u.search}` : null;
  }

  info() {
    const url = this.view && !this.view.webContents.isDestroyed() ? this.view.webContents.getURL() : '';
    const instance = this.deployment ? areaInstance(this.deployment.address, url) : null;
    return {
      kind: this.kind, pinned: this.win.isAlwaysOnTop(),
      deployment: this.deployment ? { id: this.deployment.id, name: this.deployment.name, colour: this.deployment.colour, address: this.deployment.address } : null,
      instance, path: this.currentPath(),
      notice: this.deployment ? this.desk.notices.get(this.deployment.id) || null : null,
    };
  }

  update() { if (!this.strip.webContents.isDestroyed()) this.strip.webContents.send('desk:update'); this.desk.hooks.notify?.(this); }

  snapNow() {
    if (this.win.isDestroyed() || this.win.isMaximized() || this.win.isFullScreen()) return;
    const bounds = this.win.getBounds();
    const others = [...this.desk.all].filter((w) => w !== this && !w.win.isDestroyed() && !w.win.isMinimized()).map((w) => w.win.getBounds());
    const area = screen.getDisplayMatching(bounds).workArea;
    const snapped = snap(bounds, others, area);
    if (snapped.x !== bounds.x || snapped.y !== bounds.y) this.win.setBounds(snapped);
  }
}

function pathOf(url) { const u = new URL(url); return `${u.pathname}${u.search}`; }

module.exports = { Desk, STRIP };
