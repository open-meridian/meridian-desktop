import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sig from '../../src/main/update-signature.js';

// A key made for this test only, and thrown away with it.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });

test('an update file signed with the release key checks; any change does not', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-sig-'));
  const file = path.join(dir, 'Meridian-Desktop-0.2.0.AppImage');
  fs.writeFileSync(file, 'release bytes');
  const sha = await sig.sha512File(file);
  const signature = sig.sign(path.basename(file), sha, priv);
  assert.ok(sig.verify(path.basename(file), sha, signature, pub));
  fs.writeFileSync(file, 'tampered bytes');
  assert.ok(!sig.verify(path.basename(file), await sig.sha512File(file), signature, pub));
  assert.ok(!sig.verify('Other-name.AppImage', sha, signature, pub), 'a signature is for one file name');
  const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.ok(!sig.verify(path.basename(file), sha, signature, other), 'another key does not check');
  assert.ok(!sig.verify(path.basename(file), sha, 'garbage', pub));
  fs.rmSync(dir, { recursive: true });
});
