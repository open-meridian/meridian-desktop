'use strict';
// What a release's update files are signed with, and the check: an Ed25519 signature, made by the release
// workflow with the key the product owner holds (UPDATE_SIGNING_KEY), over the file's name and SHA-512. The app
// carries only the public key. Pure functions: tested in test/unit/update-signature.test.mjs.
const crypto = require('node:crypto');
const fs = require('node:fs');

function message(name, sha512hex) { return Buffer.from(`meridian-desktop update\n${name}\nsha512:${sha512hex}\n`); }

function sha512File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

function sign(name, sha512hex, privateKeyPem) {
  return crypto.sign(null, message(name, sha512hex), crypto.createPrivateKey(privateKeyPem)).toString('base64');
}

function verify(name, sha512hex, signatureB64, publicKeyPem) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') return false;
    return crypto.verify(null, message(name, sha512hex), key, Buffer.from(String(signatureB64).trim(), 'base64'));
  } catch { return false; }
}

module.exports = { message, sha512File, sign, verify };
