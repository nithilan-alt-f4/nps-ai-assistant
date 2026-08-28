import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from './lib/mongo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = join(__dirname, '../nps-session.json');

const PORTAL_URL = process.env.NPS_PORTAL_URL || 'https://parent.npsnorthacadamis.com/';
const USERNAME = process.env.NPS_USERNAME;
const PASSWORD = process.env.NPS_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error('NPS_USERNAME / NPS_PASSWORD not set');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  ...(existsSync(SESSION_PATH) ? { storageState: SESSION_PATH } : {})
});

async function login(page, force = false) {
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 45000 });
  if (!force && (await page.$('#username')) === null) return;
  console.log('[NPS] Logging in...');
  await page.fill('#username', USERNAME);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(8000);
  if ((await page.$('#username')) !== null) throw new Error('Login failed');
  const state = await context.storageState();
  writeFileSync(SESSION_PATH, JSON.stringify(state));
  console.log('[NPS] Logged in');
}

async function goto(path) {
  const page = await context.newPage();
  await page.goto(PORTAL_URL + path, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  if ((await page.$('#username')) !== null) {
    await login(page, true);
    await page.goto(PORTAL_URL + path, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
  }
  return page;
}

async function upsert(db, type, externalId, doc) {
  await db.collection('items').updateOne(
    { source: 'nps', type, externalId },
    { $setOnInsert: { source: 'nps', type, externalId, ...doc, isRead: false, isCompleted: false, createdAt: new Date() } },
    { upsert: true }
  );
}

try {
  const page = await goto('Assignment');
  const assignments = await page.evaluate(() => {
    const blocks = document.querySelectorAll('.notification__list');
    const out = [];
    for (const b of blocks) {
      const title = b.querySelector('h4')?.textContent?.trim();
      const subject = b.querySelector('.text-orange')?.textContent?.trim();
      const sub = b.querySelector('h6')?.textContent?.trim();
      const teacher = b.querySelector('h5')?.textContent?.trim();
      const download = b.querySelector('a.btn.btn-info')?.getAttribute?.('href');
      if (!title) continue;
      out.push({ title, subject, submissionDate: sub, teacher, downloadUrl: download });
    }
    return out;
  });
  await page.close();

  const page2 = await goto('Notifications');
  const notifications = await page2.evaluate(() => {
    const blocks = document.querySelectorAll('.notification__list');
    const out = [];
    for (const b of blocks) {
      const title = b.querySelector('h4')?.textContent?.trim();
      const meta = b.querySelector('.text-muted')?.textContent?.trim();
      const full = b.querySelector('.modal .modal-body')?.textContent?.trim() || title;
      if (!title) continue;
      out.push({ title, meta, full });
    }
    return out;
  });
  await page2.close();

  const page3 = await goto('Circular');
  const circulars = await page3.evaluate(() => {
    const blocks = document.querySelectorAll('.attachment-block');
    const out = [];
    for (const b of blocks) {
      const date = b.querySelector('h4.title-c')?.textContent?.trim();
      const title = b.querySelector('h5[title]')?.title || b.querySelector('h5[title]')?.textContent?.trim();
      const category = b.querySelector('h6')?.textContent?.trim();
      const id = b.querySelector('button[onclick*="modifyRow"]')?.getAttribute('onclick')?.match(/'(\d+)'/)?.[1];
      if (!title) continue;
      out.push({ title, date, category, circularId: id });
    }
    return out;
  });
  await page3.close();

  const db = await getDb();

  for (const a of assignments) {
    const externalId = `assignment:${a.title}:${a.submissionDate}:${a.teacher}`;
    await upsert(db, 'assignment', externalId, {
      title: a.title,
      content: [a.subject, `Teacher: ${a.teacher}`].filter(Boolean).join('\n'),
      priority: 'medium',
      metadata: {
        subject: a.subject,
        teacher: a.teacher,
        submissionDate: a.submissionDate,
        downloadUrl: a.downloadUrl
      },
      postedDate: new Date()
    });
  }
  console.log(`[NPS] assignments: ${assignments.length}`);

  for (const n of notifications) {
    const externalId = `notification:${n.title}:${n.meta}`;
    await upsert(db, 'notification', externalId, {
      title: n.title,
      content: n.full,
      priority: 'medium',
      metadata: { meta: n.meta },
      postedDate: new Date()
    });
  }
  console.log(`[NPS] notifications: ${notifications.length}`);

  for (const c of circulars) {
    const externalId = `circular:${c.circularId || c.title}`;
    await upsert(db, 'circular', externalId, {
      title: c.title,
      content: c.category || '',
      priority: 'medium',
      metadata: { date: c.date, category: c.category, circularId: c.circularId },
      postedDate: new Date()
    });
  }
  console.log(`[NPS] circulars: ${circulars.length}`);

  await closeDb();
  await browser.close();
  console.log('[NPS] DONE');
} catch (err) {
  console.error('[NPS] FAILED:', err.message);
  await browser.close().catch(() => {});
  process.exit(1);
}
