'use strict';
// One partition per deployment (spec requirement 5): its own cookie jar, cache and storage, never shared with
// another deployment. Each partition is hardened once, when first used:
// - every permission is denied, except notifications for an origin the person allowed (requirement 3);
// - plain http leaves only for loopback names (requirement 6);
// - a certificate is checked against the deployment's pin (requirement 6, certificates.js);
// - a download is saved only where the person picks (Electron asks when no path is set, and none ever is).
const { session } = require('electron');
const { plainAllowed, onDeployment } = require('./origins');
const { decide, CODE } = require('./certificates');

const hardened = new Map(); // deployment id -> session

function partitionOf(deployment) { return `persist:deployment-${deployment.id}`; }

function forDeployment(deployment, { store, onCertificate, askNotifications }) {
  if (hardened.has(deployment.id)) return hardened.get(deployment.id);
  const ses = session.fromPartition(partitionOf(deployment));
  const current = () => store.deployment(deployment.id) || deployment;

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = safeOrigin(details.requestingUrl);
    if (permission !== 'notifications' || !origin || !onDeployment(current().address, details.requestingUrl)) return callback(false);
    if (current().notifications.includes(origin)) return callback(true);
    askNotifications(current(), origin).then((yes) => callback(yes), () => callback(false));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => permission === 'notifications'
    && current().notifications.includes(safeOrigin(requestingOrigin)));
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((request, callback) => callback({}));
  ses.setUSBProtectedClassesHandler?.(() => []);

  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !plainAllowed(details.url) }));

  // An untrusted or changed certificate is held, not refused, while the person decides: Chromium remembers a
  // verification's answer, so the answer given is the person's.
  ses.setCertificateVerifyProc((request, callback) => {
    const d = decide(current(), { hostname: request.hostname, errorCode: request.errorCode, pem: request.certificate.data });
    if (!d.tell) return callback(CODE[d.verdict]);
    onCertificate(current(), d.tell, (accepted) => callback(accepted ? CODE.accept : CODE.refuse));
  });

  ses.on('will-download', (event, item) => { item.setSaveDialogOptions({ title: 'Save the download' }); });
  ses.setSpellCheckerEnabled(false);
  hardened.set(deployment.id, ses);
  return ses;
}

function safeOrigin(url) { try { return new URL(url).origin; } catch { return null; } }

module.exports = { forDeployment, partitionOf };
