'use strict';
// Updates from the project's GitHub releases (spec requirement 14), checked unasked as a browser does
// (the-workspace ruling 9). A downloaded update is installed only once its Ed25519 signature checks against the
// public key this build carries, and only when the person says to restart. A build without the key (any build
// not made by the release workflow) does not update itself.
const fs = require('node:fs');
const path = require('node:path');
const { app, dialog, net } = require('electron');
const { sha512File, verify } = require('./update-signature');

const RELEASES = 'https://github.com/open-meridian/meridian-desktop/releases/download';

function publicKey() {
  try { return fs.readFileSync(path.join(process.resourcesPath, 'update-key.pem'), 'utf8'); } catch { return null; }
}

function start(log) {
  const key = publicKey();
  if (!app.isPackaged || !key) { log('updates: off (no release key in this build)'); return; }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('error', (failed) => log(`updates: ${failed.message}`));
  autoUpdater.on('update-downloaded', async (info) => {
    try {
      const name = path.basename(info.downloadedFile);
      const response = await net.fetch(`${RELEASES}/v${info.version}/${encodeURIComponent(name)}.sig`);
      if (!response.ok) throw new Error(`no signature for ${name}`);
      const signature = await response.text();
      if (!verify(name, await sha512File(info.downloadedFile), signature, key)) throw new Error(`the signature on ${name} does not check`);
      const { response: chosen } = await dialog.showMessageBox({
        type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
        message: `Meridian Desktop ${info.version} is ready.`, detail: 'Its signature checks. Restart to use it.',
      });
      if (chosen === 0) autoUpdater.quitAndInstall();
    } catch (refused) {
      fs.rmSync(info.downloadedFile, { force: true });
      log(`updates: refused ${info.version}: ${refused.message}`);
    }
  });
  const check = () => autoUpdater.checkForUpdates().catch((failed) => log(`updates: ${failed.message}`));
  check();
  setInterval(check, 6 * 60 * 60 * 1000).unref();
}

module.exports = { start };
