// The person allows `meridian connect`: the CLI printed where to sign in; sign in there in a headless browser,
// as the one person ci/first_run.py made, and allow it. Never prints the password or the link's code.
// Usage: node ci/connect.mjs CONNECT_LOG PERSON_JSON DASHBOARD
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [log, personFile, dashboard] = process.argv.slice(2);
const person = JSON.parse(fs.readFileSync(personFile, 'utf8'));
let url = null;
for (let i = 0; i < 300 && !url; i++) {
  const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  url = text.split(/\s+/).find((w) => w.startsWith(`${dashboard}/oauth/authorize?`)) || null;
  if (!url) await new Promise((r) => setTimeout(r, 1000));
}
if (!url) { console.error('connect: the CLI never said where to sign in'); process.exit(1); }
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.fill('#name', person.name);
  await page.fill('#password', person.password);
  await page.click('button[type=submit]');
  await page.click('button[name=decision][value=allow]', { timeout: 60_000 });
  await page.waitForLoadState();
  console.log('connect: allowed');
} finally {
  await browser.close();
}
