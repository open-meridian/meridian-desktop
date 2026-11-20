// The gate on Electron's support window (spec requirement 14; the-workspace ruling 9): a build fails when its
// Electron major is not one of the three Electron still supports. The latest stable major is read from npm's
// `latest` tag at build time, so the gate turns red on its own when Electron moves on.
import fs from 'node:fs';

const pinned = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).devDependencies.electron;
if (!/^\d+\.\d+\.\d+$/.test(pinned)) { console.error(`electron is pinned as "${pinned}": pin an exact release`); process.exit(1); }
const response = await fetch('https://registry.npmjs.org/-/package/electron/dist-tags');
if (!response.ok) { console.error(`npm answered ${response.status} for electron's dist-tags`); process.exit(1); }
const latest = (await response.json()).latest;
const [ours, newest] = [Number(pinned.split('.')[0]), Number(latest.split('.')[0])];
const supported = [newest, newest - 1, newest - 2];
if (!supported.includes(ours)) {
  console.error(`Electron ${pinned} is out of support: Electron supports majors ${supported.join(', ')} (latest ${latest}). Move to a supported major.`);
  process.exit(1);
}
console.log(`Electron ${pinned}: major ${ours} is supported (supported: ${supported.join(', ')}; latest ${latest})`);
