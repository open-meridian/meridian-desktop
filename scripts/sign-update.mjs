// Signs a release's files for the updater (src/main/update-signature.js): writes `<file>.sig` beside each
// installer and update payload in the directory given. The key comes from UPDATE_SIGNING_KEY, an Ed25519
// private key in PEM that the product owner holds and sets as a secret; it is never written to disk or printed.
// Usage: UPDATE_SIGNING_KEY=… node scripts/sign-update.mjs DIR
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sha512File, sign } = require('../src/main/update-signature.js');
const key = process.env.UPDATE_SIGNING_KEY;
if (!key) { console.error('sign-update: UPDATE_SIGNING_KEY is not set; the product owner sets it as a secret'); process.exit(1); }
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => /\.(dmg|zip|exe|AppImage)$/.test(f));
if (!files.length) { console.error(`sign-update: nothing to sign in ${dir}`); process.exit(1); }
for (const f of files) {
  fs.writeFileSync(path.join(dir, `${f}.sig`), `${sign(f, await sha512File(path.join(dir, f)), key)}\n`);
  console.log(`sign-update: signed ${f}`);
}
