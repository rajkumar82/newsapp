// Pulls today's headlines from public RSS feeds (no API key) and turns them into short "gist" cards.
const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { decodeHTML } = require('entities');

const GIST_MAX = 420; // chars, about 7 lines on a phone
const GIST_MIN = 230;
const FETCH_TIMEOUT_MS = 8000;
const PER_FEED_MAX = 10; // newest items kept per feed, so adding feeds doesn't mean ever more article fetches
const UA = 'Mozilla/5.0 (compatible; newsapp/0.1)';

// One entry per feed; items are taken round-robin so the cards mix topics and sources.
const FEEDS = [
  { source: 'BBC News', category: 'World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { source: 'The Hindu', category: 'India', url: 'https://www.thehindu.com/news/national/feeder/default.rss' },
  { source: 'Times of India', category: 'India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms' },
  { source: 'NDTV', category: 'India', url: 'https://feeds.feedburner.com/ndtvnews-india-news' },
  { source: 'The Straits Times', category: 'Singapore', url: 'https://www.straitstimes.com/news/singapore/rss.xml' },
  { source: 'BBC News', category: 'Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { source: 'TechCrunch', category: 'Technology', url: 'https://techcrunch.com/feed/' },
  { source: 'Ars Technica', category: 'Technology', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { source: 'WIRED', category: 'Technology', url: 'https://www.wired.com/feed/rss' },
  { source: 'TechCrunch', category: 'AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { source: 'TechCrunch', category: 'Gadgets', url: 'https://techcrunch.com/category/gadgets/feed/' },
  { source: 'BBC News', category: 'Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { source: 'BBC News', category: 'Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  { source: 'BBC News', category: 'Entertainment', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  { source: 'BBC News', category: 'Health', url: 'https://feeds.bbci.co.uk/news/health/rss.xml' },
  { source: 'BBC News', category: 'Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml' },
  { source: 'Economic Times', category: 'Business', url: 'https://economictimes.indiatimes.com/rssfeedstopstories.cms' },
  { source: 'Economic Times', category: 'Business', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { source: 'Economic Times', category: 'Technology', url: 'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms' },
  { source: 'Economic Times', category: 'India', url: 'https://economictimes.indiatimes.com/news/india/rssfeeds/81582957.cms' },
  { source: 'Times of India', category: 'World', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
  { source: 'Times of India', category: 'Business', url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms' },
  { source: 'Times of India', category: 'Technology', url: 'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms' },
  { source: 'Times of India', category: 'Entertainment', url: 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms' },
  { source: 'Times of India', category: 'Cricket', url: 'https://timesofindia.indiatimes.com/rssfeeds/4719161.cms' },
  { source: 'Times of India', category: 'Science', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128672765.cms' },
  { source: 'Indian Express', category: 'India', url: 'https://indianexpress.com/section/india/feed/' },
  { source: 'Indian Express', category: 'Business', url: 'https://indianexpress.com/section/business/feed/' },
  { source: 'Indian Express', category: 'Technology', url: 'https://indianexpress.com/section/technology/feed/' },
  { source: 'Indian Express', category: 'Cricket', url: 'https://indianexpress.com/section/sports/cricket/feed/' },
  { source: 'Indian Express', category: 'Politics', url: 'https://indianexpress.com/section/political-pulse/feed/' },
  { source: 'India Today', category: 'India', url: 'https://www.indiatoday.in/rss/1206514' },
  { source: 'India Today', category: 'World', url: 'https://www.indiatoday.in/rss/1206577' },
  { source: 'India Today', category: 'Technology', url: 'https://www.indiatoday.in/rss/1206550' },
  { source: 'India Today', category: 'Entertainment', url: 'https://www.indiatoday.in/rss/1206518' },
  { source: 'India Today', category: 'Cricket', url: 'https://www.indiatoday.in/rss/1206519' },
  { source: 'Hindustan Times', category: 'India', url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml' },
  { source: 'Hindustan Times', category: 'World', url: 'https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml' },
  { source: 'Hindustan Times', category: 'Cricket', url: 'https://www.hindustantimes.com/feeds/rss/cricket/rssfeed.xml' },
  { source: 'Hindustan Times', category: 'Entertainment', url: 'https://www.hindustantimes.com/feeds/rss/entertainment/rssfeed.xml' },
  { source: 'Mint', category: 'Business', url: 'https://www.livemint.com/rss/companies' },
  { source: 'Mint', category: 'Technology', url: 'https://www.livemint.com/rss/technology' },
  { source: 'Business Standard', category: 'Business', url: 'https://www.business-standard.com/rss/home_page_top_stories.rss' },
  { source: 'Business Standard', category: 'India', url: 'https://www.business-standard.com/rss/india-news-216.rss' },
  { source: 'Moneycontrol', category: 'Business', url: 'https://www.moneycontrol.com/rss/business.xml' },
  { source: 'Business Line', category: 'Business', url: 'https://www.thehindubusinessline.com/economy/feeder/default.rss' },
  { source: 'Business Line', category: 'Business', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss' },
  { source: 'Business Line', category: 'Technology', url: 'https://www.thehindubusinessline.com/info-tech/feeder/default.rss' },
  { source: 'Business Line', category: 'World', url: 'https://www.thehindubusinessline.com/news/world/feeder/default.rss' },
  { source: 'NDTV', category: 'World', url: 'https://feeds.feedburner.com/ndtvnews-world-news' },
  { source: 'NDTV', category: 'Business', url: 'https://feeds.feedburner.com/ndtvprofit-latest' },
  { source: 'The Hindu', category: 'World', url: 'https://www.thehindu.com/news/international/feeder/default.rss' },
  { source: 'The Hindu', category: 'Business', url: 'https://www.thehindu.com/business/feeder/default.rss' },
  { source: 'The Hindu', category: 'Science', url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss' },
  { source: 'The Hindu', category: 'Health', url: 'https://www.thehindu.com/sci-tech/health/feeder/default.rss' },
  { source: 'The Hindu', category: 'Cricket', url: 'https://www.thehindu.com/sport/cricket/feeder/default.rss' },
  { source: 'News18', category: 'India', url: 'https://www.news18.com/commonfeeds/v1/eng/rss/india.xml' },
  { source: 'Scroll', category: 'India', url: 'https://feeds.feedburner.com/ScrollinArticles.rss' },
  { source: 'ESPNcricinfo', category: 'Cricket', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml' },
  { source: 'BBC Sport', category: 'Cricket', url: 'https://feeds.bbci.co.uk/sport/cricket/rss.xml' },
  { source: 'BBC Sport', category: 'Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { source: 'Sky Sports', category: 'Football', url: 'https://www.skysports.com/rss/12040' },
  { source: 'ESPN', category: 'Basketball', url: 'https://www.espn.com/espn/rss/nba/news' },
  { source: 'ESPN', category: 'Football', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { source: 'CNA', category: 'Singapore', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416' },
  { source: 'CNA', category: 'World', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311' },
  { source: 'CNA', category: 'Business', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936' },
  { source: 'The Straits Times', category: 'World', url: 'https://www.straitstimes.com/news/world/rss.xml' },
  { source: 'The Straits Times', category: 'Business', url: 'https://www.straitstimes.com/news/business/rss.xml' },
  { source: 'Engadget', category: 'Gadgets', url: 'https://www.engadget.com/rss.xml' },
  { source: 'Al Jazeera', category: 'World', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { source: 'The Guardian', category: 'World', url: 'https://www.theguardian.com/world/rss' },
  { source: 'The Guardian', category: 'Science', url: 'https://www.theguardian.com/science/rss' },
  { source: 'NPR', category: 'World', url: 'https://feeds.npr.org/1004/rss.xml' },
  { source: 'CBS Sports', category: 'Basketball', url: 'https://www.cbssports.com/rss/headlines/nba/' },
  { source: 'CBS Sports', category: 'Football', url: 'https://www.cbssports.com/rss/headlines/soccer/' },
  { source: 'NDTV', category: 'Cricket', url: 'https://feeds.feedburner.com/ndtvsports-cricket' },
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
// Some feeds double-encode (the XML parser leaves "&#8217;" behind), so titles are decoded once more. Keeps stored days fixable too.
const decodeText = (s) => decodeHTML(String(s || ''));

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
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: { maxTotalExpansions: 100000 } }).parse(xml);
  const raw = doc?.rss?.channel?.item || [];
  return (Array.isArray(raw) ? raw : [raw]).map((it) => {
    const media = it['media:thumbnail'] || it['media:content'];
    const m = Array.isArray(media) ? media[0] : media;
    return {
      title: clean(decodeText(it.title)),
      link: stripTracking(clean(typeof it.link === 'string' ? it.link : it.link?.['#text'])),
      summary: clean(cheerio.load(`<p>${it.description || ''}</p>`).text()),
      publishedAt: it.pubDate && !isNaN(new Date(it.pubDate)) ? new Date(it.pubDate).toISOString() : null,
      feedImage: m?.['@_url'] || null,
      category: feed.category,
      source: feed.source,
    };
  }).filter((it) => it.title && it.link).slice(0, PER_FEED_MAX);
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

// Round-robin across feeds, skipping duplicate links/titles, up to `limit` items (default: all of them).
function pick(lists, limit = Infinity) {
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

async function fetchTodaysNews(limit = Infinity) {
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

module.exports = { decodeText, fetchTodaysNews, stripTracking, buildGist, trimToSentence, parseFeed, pick, GIST_MAX };
