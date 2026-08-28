import { getDb, closeDb } from './lib/mongo.mjs';

const API_KEY = process.env.NEWS_API_KEY;
const SEARCH_TOPICS = ['Donald Trump', 'Narendra Modi', 'D.K. Shivakumar', 'Joseph Vijay TVK', 'Abhijeet Dipke'];

if (!API_KEY) {
  console.error('NEWS_API_KEY not set');
  process.exit(1);
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1] : '';
}

function cleanEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

async function fetchRSS(topic, count = 4) {
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const xml = await res.text();
  const articles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && articles.length < count) {
    const itemXml = match[1];
    const title = cleanEntities(extractTag(itemXml, 'title'));
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    if (title) {
      articles.push({
        title,
        source: sourceMatch ? sourceMatch[1].trim() : 'Google News',
        url: link,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        topic
      });
    }
  }
  return articles;
}

const db = await getDb();

try {
  // Wipe yesterday's news (daily reset)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.collection('items').deleteMany({ source: 'news', createdAt: { $lt: cutoff } });

  let saved = 0;
  for (const topic of SEARCH_TOPICS) {
    const articles = await fetchRSS(topic, 4);
    for (const a of articles) {
      const externalId = `news:${topic}:${a.title}`;
      await db.collection('items').updateOne(
        { source: 'news', externalId },
        {
          $setOnInsert: {
            source: 'news',
            type: 'news',
            externalId,
            title: a.title,
            content: a.source,
            priority: 'low',
            metadata: { topic: a.topic, url: a.url, source: a.source, publishedAt: a.publishedAt },
            postedDate: new Date(),
            isRead: false,
            isCompleted: false,
            createdAt: new Date()
          }
        },
        { upsert: true }
      );
      saved++;
    }
    console.log(`[News] ${topic}: ${articles.length}`);
  }
  console.log(`[News] total saved ${saved}`);
  await closeDb();
} catch (err) {
  console.error('[News] FAILED:', err.message);
  await closeDb().catch(() => {});
  process.exit(1);
}
