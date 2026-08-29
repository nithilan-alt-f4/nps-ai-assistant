import { getDb, closeDb } from './lib/mongo.mjs';
import { google } from 'googleapis';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../public/data');
mkdirSync(OUT_DIR, { recursive: true });
const write = (name, data) => writeFileSync(join(OUT_DIR, name), JSON.stringify(data, null, 2));

const SCHOOL_CALENDAR_ID = process.env.SCHOOL_CALENDAR_ID
  || '88db098d23735d6ce14060e3b84044eecb42eebda6403ad7ae737bb3cbf69cce@group.calendar.google.com';

const db = await getDb();

// ---- Fetch Google Calendar events (School + others) ----
async function fetchCalendarEvents() {
  const clientId = process.env.GCAL_CLIENT_ID;
  const clientSecret = process.env.GCAL_CLIENT_SECRET;
  const refreshToken = process.env.GCAL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.error('[Cal] GCAL env vars missing, skipping calendar events');
    return [];
  }
  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  const cal = google.calendar({ version: 'v3', auth: oauth });

  const now = new Date();
  // Range: today to end of this month; if in the last week of the month, extend through next month too.
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const lastWeekStart = new Date(monthEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rangeEnd = now >= lastWeekStart
    ? new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59)
    : monthEnd;

  try {
    // School calendar
    const school = await cal.events.list({
      calendarId: SCHOOL_CALENDAR_ID,
      timeMin: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250
    });
    return (school.data.items || []).map(e => ({
      id: e.id,
      title: e.summary,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      calendarName: 'School'
    }));
  } catch (err) {
    console.error('[Cal] School calendar fetch failed:', err.message);
    return [];
  }
}

try {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ---- Briefing ----
  const [assignments, notifications, circulars, emails, news, newToday] = await Promise.all([
    db.collection('items').find({ type: 'assignment' }).sort({ createdAt: -1 }).limit(15).toArray(),
    db.collection('items').find({ type: 'notification' }).sort({ postedDate: -1, createdAt: -1 }).limit(8).toArray(),
    db.collection('items').find({ type: 'circular' }).sort({ postedDate: -1, createdAt: -1 }).limit(5).toArray(),
    db.collection('items').find({ type: 'email' }).sort({ postedDate: -1, createdAt: -1 }).limit(5).toArray(),
    db.collection('items').find({ type: 'news' }).sort({ postedDate: -1, createdAt: -1 }).limit(8).toArray(),
    db.collection('items').countDocuments({ createdAt: { $gte: todayStart } })
  ]);

  const settings = await db.collection('settings').findOne({ key: 'narrative' });
  const brief = {
    date: now.toISOString().split('T')[0],
    generatedAt: now.toISOString(),
    stats: { newToday, assignments: assignments.length, emails: emails.length, news: news.length },
    narrative: settings?.value?.text || null,
    assignments: assignments.map(a => ({ id: a._id, title: a.title, subject: a.metadata?.subject, teacher: a.metadata?.teacher, summary: a.summary })),
    notifications: notifications.map(n => ({ id: n._id, title: n.title, summary: n.summary, content: n.content, postedDate: n.postedDate })),
    circulars: circulars.map(c => ({ id: c._id, title: c.title, category: c.metadata?.category, hasPdf: !!c.metadata?.circularId, postedDate: c.postedDate })),
    emails: emails.map(e => ({ id: e._id, title: e.title, from: e.metadata?.from, summary: e.summary, gmailUrl: e.metadata?.gmailUrl })),
    news: news.map(n => ({ id: n._id, title: n.title, sourceName: n.metadata?.source || n.metadata?.sourceName, url: n.metadata?.url, summary: n.summary }))
  };
  write('briefing.json', brief);

  // ---- Items (School / Inbox / World tabs) ----
  const items = await db.collection('items').find().sort({ createdAt: -1 }).limit(300).toArray();
  write('items.json', items.map(i => ({
    id: i._id, source: i.source, type: i.type, title: i.title, content: i.content,
    summary: i.summary, postedDate: i.postedDate, isRead: i.isRead, isCompleted: i.isCompleted,
    metadata: i.metadata || {}
  })));

  // ---- Holidays ----
  const holidays = await db.collection('items').find({ type: 'holiday' }).toArray();
  write('holidays.json', holidays.map(h => ({
    title: h.title, date: h.metadata?.startDate || h.postedDate, kind: 'holiday'
  })));

  // ---- Google Calendar events (School classes/exams) ----
  const events = await fetchCalendarEvents();
  write('calendar.json', { generatedAt: now.toISOString(), events });

  console.log('[Export] briefing, items, holidays, calendar written');
  await closeDb();
} catch (err) {
  console.error('[Export] FAILED:', err.message);
  await closeDb().catch(() => {});
  process.exit(1);
}
