import { google } from 'googleapis';
import { getDb, closeDb } from './lib/mongo.mjs';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Gmail OAuth env vars missing');
  process.exit(1);
}

const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth.setCredentials({ refresh_token: REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth: oauth });

const db = await getDb();

try {
  // Fetch messages from last 2 days
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'newer_than:2d',
    maxResults: 50
  });
  const ids = (res.data.messages || []).map(m => m.id);
  console.log(`[Gmail] ${ids.length} messages found`);

  let kept = 0;
  for (const id of ids) {
    const existing = await db.collection('items').findOne({ source: 'gmail', externalId: `email:${id}` });
    if (existing) continue;

    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const headers = msg.data.payload.headers || [];
    const subj = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    const body = (msg.data.snippet || '').substring(0, 800);

    await db.collection('items').insertOne({
      source: 'gmail',
      type: 'email',
      externalId: `email:${id}`,
      title: subj,
      content: body,
      priority: 'medium',
      metadata: { from, date, gmailId: id, gmailUrl: `https://mail.google.com/mail/u/0/#all/${id}` },
      postedDate: new Date(),
      isRead: false,
      isCompleted: false,
      createdAt: new Date()
    });
    kept++;
  }
  console.log(`[Gmail] saved ${kept} new`);
  await closeDb();
} catch (err) {
  console.error('[Gmail] FAILED:', err.message);
  await closeDb().catch(() => {});
  process.exit(1);
}
