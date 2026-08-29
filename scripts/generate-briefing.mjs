import { getDb, closeDb } from './lib/mongo.mjs';

const GROQ_KEY = process.env.GROQ_API_KEY;
if (!GROQ_KEY) {
  console.error('GROQ_API_KEY not set');
  process.exit(1);
}

const db = await getDb();

async function groqChat(prompt, maxTokens) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Groq: ${data.error?.message || res.status}`);
  return data.choices?.[0]?.message?.content || '';
}

try {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = now.toISOString().split('T')[0];

  const notifications = await db.collection('items')
    .find({ type: 'notification', postedDate: { $gte: todayStart } }).limit(6).toArray();
  const emails = await db.collection('items')
    .find({ type: 'email' }).sort({ postedDate: -1 }).limit(3).toArray();
  const news = await db.collection('items')
    .find({ type: 'news' }).sort({ postedDate: -1 }).limit(5).toArray();
  const events = await db.collection('items')
    .find({ type: 'holiday', postedDate: { $gte: now, $lte: new Date(now.getTime() + 7 * 86400000) } }).limit(5).toArray();

  // Weather (Open-Meteo, Bengaluru)
  let weatherLine = 'unavailable';
  try {
    const w = await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=12.9716&longitude=77.5946&current=temperature_2m,weather_code&daily=precipitation_probability_max&timezone=Asia%2FKolkata')).json();
    const temp = w.current?.temperature_2m;
    const rain = w.daily?.precipitation_probability_max?.[0] ?? 0;
    weatherLine = `${Math.round(temp)}C, rain chance ${rain}%`;
  } catch {}

  const notifyText = notifications.map(n => `- ${n.title}: ${n.content}`).join('\n');
  const emailText = emails.map(e => `- ${e.title} (${e.metadata?.from || ''})`).join('\n');
  const newsText = news.map(n => `- ${n.title} (${n.metadata?.source || ''})`).join('\n');
  const eventText = events.length
    ? events.map(e => `- ${e.title} on ${e.metadata?.startDate || e.postedDate}`).join('\n')
    : 'None this week';

  const prompt = [
    `You are writing a morning briefing for a high school student in Bengaluru.`,
    `Write a single, concise briefing of 3-4 short sentences maximum — roughly 400-500 characters total, no more.`,
    `Conversational and encouraging, second person ("you"/"your"). Keep it tight and skimmable.`,
    `Do NOT use em dashes (use commas or periods). Use **bold** for key words and [[News:]] / [[Mail:]] style jump links for news/emails.`,
    ``,
    `Today's date: ${todayKey}  Weather: ${weatherLine}`,
    ``,
    `School notifications:`,
    notifyText || 'None',
    ``,
    `Emails:`,
    emailText || 'None',
    ``,
    `News:`,
    newsText || 'None',
    ``,
    `Upcoming holidays/events:`,
    eventText,
    ``,
    `Give 1-2 actionable advice items (dress code, timings, what to bring) only where the school notifications mention it.`
  ].join('\n');

  const text = await groqChat(prompt, 175);

  if (text) {
    await db.collection('settings').updateOne(
      { key: 'narrative' },
      { $set: { value: { text, date: todayKey }, updatedAt: new Date() } },
      { upsert: true }
    );
    console.log('[Briefing] narrative generated');
  } else {
    console.error('[Briefing] empty narrative from Groq');
    process.exitCode = 1;
  }

  await closeDb();
} catch (err) {
  console.error('[Briefing] FAILED:', err.message);
  await closeDb().catch(() => {});
  process.exit(1);
}
