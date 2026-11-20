'use strict';
// Certificate pinning (the-workspace ruling 7; spec requirement 6). A deployment whose certificate a public
// authority vouches for needs no pin. One that is self-signed is shown with its fingerprint on first connection,
// accepted by the person and pinned; a certificate that differs from the pin is refused, with both fingerprints,
// until the person accepts the new one knowingly. Never `ignore-certificate-errors`.
const crypto = require('node:crypto');
const { hostOnDeployment } = require('./origins');

// SHA-256 of the certificate's DER, as colon-separated upper-case hex: what the person compares by eye.
function fingerprint(pem) {
  const b64 = String(pem).replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
  const hex = crypto.createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex').toUpperCase();
  return hex.match(/.{2}/g).join(':');
}

// The decision for one verification, without Electron: `accept` (0), `refuse` (-2) or `chromium` (-3, Chromium's
// own answer stands), and what to tell the person when refused.
function decide({ address, pins }, { hostname, errorCode, pem }) {
  if (!hostOnDeployment(address, hostname)) return { verdict: 'chromium' };
  const seen = fingerprint(pem);
  if (pins.length > 0) {
    if (pins.includes(seen)) return { verdict: 'accept' };
    return { verdict: 'refuse', tell: { kind: 'changed', hostname, seen, pinned: pins[0] } };
  }
  if (errorCode === 0) return { verdict: 'chromium' };
  return { verdict: 'refuse', tell: { kind: 'first', hostname, seen } };
}

const CODE = { accept: 0, refuse: -2, chromium: -3 };

module.exports = { fingerprint, decide, CODE };
