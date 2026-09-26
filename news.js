// Pulls today's headlines from public RSS feeds (no API key) and turns them into short "gist" cards.
const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');
const crypto = require('crypto');

const MAX_ITEMS = 20;
const GIST_MAX = 300; // chars, about 5 lines on a phone
const GIST_MIN = 160;
const FETCH_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (compatible; newsapp/0.1)';

// One entry per feed; items are taken round-robin so the 20 cards mix topics and sources.
const FEEDS = [
  { source: 'BBC News', category: 'World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { source: 'The Hindu', category: 'India', url: 'https://www.thehindu.com/news/national/feeder/default.rss' },
  { source: 'BBC News', category: 'Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { source: 'BBC News', category: 'Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { source: 'BBC News', category: 'Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
];

const BOILERPLATE = /subscribed with another email|sign up|newsletter|copyright|all rights reserved|read more|follow us|download the/i;

async function get(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// drops ?at_medium=RSS style tracking parameters so links are clean and the same story dedupes
function stripTracking(link) {
  try {
    const u = new URL(link);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return link;
  }
}

function parseFeed(xml, feed) {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml);
  const raw = doc?.rss?.channel?.item || [];
  return (Array.isArray(raw) ? raw : [raw]).map((it) => {
    const media = it['media:thumbnail'] || it['media:content'];
    const m = Array.isArray(media) ? media[0] : media;
    return {
      title: clean(it.title),
      link: stripTracking(clean(typeof it.link === 'string' ? it.link : it.link?.['#text'])),
      summary: clean(cheerio.load(`<p>${it.description || ''}</p>`).text()),
      publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      feedImage: m?.['@_url'] || null,
      category: feed.category,
      source: feed.source,
    };
  }).filter((it) => it.title && it.link);
}

// Cuts text to at most `max` chars, ending on a sentence boundary when there is one that is long enough.
function trimToSentence(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (end >= GIST_MIN) return cut.slice(0, end + 1);
  return cut.replace(/\s+\S*$/, '') + '…';
}

function buildGist(lead, paragraphs) {
  let gist = clean(lead);
  for (const p of paragraphs) {
    if (gist.length >= GIST_MIN) break;
    if (gist && (p.startsWith(gist.slice(0, 40)) || gist.startsWith(p.slice(0, 40)))) continue; // same sentence again
    gist = gist ? `${gist} ${p}` : p;
  }
  return trimToSentence(gist, GIST_MAX);
}

function usableImage(url) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  if (/og-image|logo|placeholder|default/i.test(url)) return null; // site-wide placeholder, not a story photo
  return url;
}

// Adds a hero image and a longer gist from the article page itself. Falls back to the feed's own data.
async function enrich(item) {
  let image = usableImage(item.feedImage);
  let lead = item.summary;
  let paragraphs = [];
  try {
    const $ = cheerio.load(await get(item.link));
    const meta = (p) => $(`meta[property="${p}"], meta[name="${p}"]`).attr('content');
    image = usableImage(meta('og:image')) || usableImage(meta('twitter:image:src')) || image;
    lead = clean(meta('og:description') || meta('description')) || lead;
    paragraphs = $('article p, main p')
      .map((_, el) => clean($(el).text()))
      .get()
      .filter((t) => t.length >= 60 && !BOILERPLATE.test(t));
  } catch (err) {
    console.warn(`article fetch failed (${item.link}): ${err.message}`);
  }
  return {
    id: crypto.createHash('sha1').update(item.link).digest('hex').slice(0, 12),
    title: item.title,
    gist: buildGist(lead, paragraphs) || item.title,
    image,
    category: item.category,
    source: item.source,
    url: item.link,
    publishedAt: item.publishedAt,
  };
}

async function inBatches(list, size, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

// Round-robin across feeds, skipping duplicate links/titles, up to `limit` items.
function pick(lists, limit) {
  const seen = new Set();
  const out = [];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const it = list[i];
      if (!it || out.length >= limit) continue;
      const key = it.link;
      const tkey = it.title.toLowerCase();
      if (seen.has(key) || seen.has(tkey)) continue;
      seen.add(key);
      seen.add(tkey);
      out.push(it);
    }
  }
  return out;
}

async function fetchTodaysNews(limit = MAX_ITEMS) {
  const lists = (await Promise.all(FEEDS.map(async (feed) => {
    try {
      return parseFeed(await get(feed.url), feed);
    } catch (err) {
      console.warn(`feed failed (${feed.url}): ${err.message}`);
      return [];
    }
  })));
  const chosen = pick(lists, limit);
  if (!chosen.length) throw new Error('no news feed returned any items');
  return inBatches(chosen, 5, enrich);
}

module.exports = { fetchTodaysNews, stripTracking, buildGist, trimToSentence, parseFeed, pick, MAX_ITEMS, GIST_MAX };
