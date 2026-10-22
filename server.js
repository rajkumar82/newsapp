const express = require('express');
const path = require('path');
const fsp = require('fs/promises');
const { fetchTodaysNews, decodeText } = require('./news');
const { encodeCode, decodeCode, withStoryMeta } = require('./storylink');

const PORT = process.env.PORT || 8080;
const BUCKET = process.env.BUCKET; // if unset, the daily JSON is stored in ./data
const PUBLIC_ORIGIN = 'https://dailynews.nocod.dev'; // used in share-link previews
const TZ = 'Asia/Kolkata'; // "today" rolls over at midnight IST

// ---- storage: one JSON document per day ----
// Both backends expose: read(name) -> object|null, write(name, object)

function gcsStorage(bucketName) {
  const { Storage } = require('@google-cloud/storage');
  const bucket = new Storage().bucket(bucketName);
  return {
    async read(name) {
      try {
        const [buf] = await bucket.file(name).download();
        return JSON.parse(buf.toString('utf8'));
      } catch (err) {
        if (err.code === 404) return null;
        throw err;
      }
    },
    async write(name, obj) {
      await bucket.file(name).save(JSON.stringify(obj), { contentType: 'application/json' });
    },
  };
}

function localStorage(dir) {
  return {
    async read(name) {
      try {
        return JSON.parse(await fsp.readFile(path.join(dir, name), 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async write(name, obj) {
      await fsp.mkdir(dir, { recursive: true });
      const file = path.join(dir, name);
      await fsp.writeFile(`${file}.tmp`, JSON.stringify(obj));
      await fsp.rename(`${file}.tmp`, file); // never leave a half-written day behind
    },
  };
}

const store = BUCKET ? gcsStorage(BUCKET) : localStorage(path.join(__dirname, 'data'));

const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // YYYY-MM-DD

// If the day's JSON exists, serve it. Otherwise fetch once (concurrent requests share the same fetch),
// save it, and serve that. Nothing is saved when the fetch fails or returns no items.
const inflight = new Map();
async function newsForDay(date) {
  const name = `news-${date}.json`;
  const saved = await store.read(name);
  if (saved) return saved;
  if (!inflight.has(date)) {
    inflight.set(date, (async () => {
      const items = await fetchTodaysNews();
      const doc = { date, fetchedAt: new Date().toISOString(), items };
      await store.write(name, doc);
      return doc;
    })().finally(() => inflight.delete(date)));
  }
  return inflight.get(date);
}

const app = express();
app.disable('x-powered-by');

app.get('/api/news', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    // days saved before titles were decoded can still hold "&#8217;" style text, so clean it on the way out
    const doc = await newsForDay(todayKey());
    res.json({ ...doc, items: doc.items.map((it) => ({ ...it, code: encodeCode(doc.date, it.id), title: decodeText(it.title), gist: decodeText(it.gist) })) });
  } catch (err) {
    console.error('news failed:', err);
    res.set('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Could not load the news right now. Please try again in a minute.' });
  }
});

// One story by share code. Only a day that was already saved is read; a past date never triggers a fetch.
async function findStory(code) {
  const at = decodeCode(code);
  if (!at) return null;
  const doc = at.date === todayKey() ? await newsForDay(at.date) : await store.read(`news-${at.date}.json`);
  const item = doc && doc.items.find((it) => it.id === at.id);
  return item ? { date: at.date, item: { ...item, code: encodeCode(at.date, item.id), title: decodeText(item.title), gist: decodeText(item.gist) } } : null;
}

app.get('/api/story/:code', async (req, res) => {
  try {
    const story = await findStory(req.params.code);
    if (!story) return res.status(404).json({ error: 'Story not found.' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json(story);
  } catch (err) {
    console.error('story failed:', err);
    res.status(503).json({ error: 'Could not load the story right now.' });
  }
});

// A shared link: the normal app page, with this story's title and photo in the preview tags.
// Unknown codes still open the app (on today's news) rather than showing an error.
app.get('/n/:code', async (req, res) => {
  try {
    const html = await fsp.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const story = await findStory(req.params.code);
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(story ? withStoryMeta(html, story.item, `${PUBLIC_ORIGIN}${req.originalUrl}`) : html);
  } catch (err) {
    console.error('share page failed:', err);
    res.redirect('/');
  }
});

// Same-origin copy of a story photo so the browser can draw it onto a canvas for the share image.
// Only photos that belong to today's news are served, so this can't be used as an open proxy.
app.get('/api/img', async (req, res) => {
  try {
    const url = String(req.query.url || '');
    const doc = await newsForDay(todayKey());
    if (!url || !doc.items.some((it) => it.image === url)) return res.status(404).end();
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return res.status(404).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return res.status(404).end();
    res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
    res.send(buf);
  } catch (err) {
    res.status(404).end();
  }
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, file) {
    // the service worker must always be re-checked, or installed copies of the app can get stuck on an old version
    if (path.basename(file) === 'sw.js') res.set('Cache-Control', 'no-cache');
  },
}));

if (require.main === module) {
  app.listen(PORT, () => console.log(`newsapp listening on ${PORT} (${BUCKET ? `bucket ${BUCKET}` : 'local ./data'})`));
}

module.exports = { app, newsForDay, todayKey, findStory };
