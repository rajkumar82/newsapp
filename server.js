const express = require('express');
const path = require('path');
const fsp = require('fs/promises');
const { fetchTodaysNews } = require('./news');

const PORT = process.env.PORT || 8080;
const BUCKET = process.env.BUCKET; // if unset, the daily JSON is stored in ./data
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
    res.json(await newsForDay(todayKey()));
  } catch (err) {
    console.error('news failed:', err);
    res.set('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Could not load the news right now. Please try again in a minute.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

if (require.main === module) {
  app.listen(PORT, () => console.log(`newsapp listening on ${PORT} (${BUCKET ? `bucket ${BUCKET}` : 'local ./data'})`));
}

module.exports = { app, newsForDay, todayKey };
