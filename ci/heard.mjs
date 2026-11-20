// A plugin is ready for the desktop's run once the dashboard shows one of its pages: framed in its area, or as
// a tab of it. The dashboard knows a plugin's pages from its sidecar's report, which comes every 30 seconds, so
// a plugin whose workload is Available may not have been heard yet. This signs in as the one person, opens each
// instance's area from the home page as the person would, and loads it again until a page shows.
// Never prints the password. Usage: node ci/heard.mjs PERSON_JSON DASHBOARD INSTANCE...
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [personFile, dashboard, ...instances] = process.argv.slice(2);
const person = JSON.parse(fs.readFileSync(personFile, 'utf8'));
const SECONDS = 120; // four of the sidecar's reports
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
try {
  const page = await browser.newPage();
  await page.goto(`${dashboard}/sign-in`);
  await page.fill('#name', person.name);
  await page.fill('#password', person.password);
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  for (const instance of instances) {
    await page.goto(`${dashboard}/`);
    const href = await page.getAttribute(`li[data-instance="${instance}"] a.plugin-level`, 'href', { timeout: 30_000 });
    const end = Date.now() + SECONDS * 1000;
    let shows = null, tabs = [];
    while (!shows && Date.now() < end) {
      await page.goto(new URL(href, dashboard).href);
      shows = await page.$('iframe[data-plugin-frame]') ? 'a page' : await page.$('nav a[data-page]') ? 'a tab for a page' : null;
      tabs = await page.$$eval('nav a[data-tab]', (links) => links.map((a) => a.dataset.tab));
      if (!shows) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!shows) {
      console.error(`heard: ${instance}'s area at ${href} showed none of its pages in ${SECONDS}s; its tabs: ${tabs.join(', ') || 'none'}`);
      process.exit(1);
    }
    console.log(`heard: ${instance}'s area at ${href} shows ${shows}; its tabs: ${tabs.join(', ') || 'none'}`);
  }
} finally {
  await browser.close();
}
