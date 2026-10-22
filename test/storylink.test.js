const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { encodeCode, decodeCode, withStoryMeta } = require('../storylink');
const { app, findStory } = require('../server');

test('share code round-trips the day and story id', () => {
  const code = encodeCode('2026-10-22', '28ca6e97f5a5');
  assert.match(code, /^[0-9a-z]{3}28ca6e97f5a5$/);
  assert.deepStrictEqual(decodeCode(code), { date: '2026-10-22', id: '28ca6e97f5a5' });
});

test('decodeCode rejects codes that are not ours', () => {
  for (const bad of ['', 'abc', 'zzzzzzzzzzzzzzz', '../../etc/passwd', '0012XYZ']) assert.strictEqual(decodeCode(bad), null);
});

test('withStoryMeta puts the story in the title and preview tags, escaped', () => {
  const html = '<title>x</title><!-- seo:start --><meta name="description" content="old"><!-- seo:end -->';
  const out = withStoryMeta(html, { title: 'A "big" <story>', gist: 'g', image: 'https://i/x.jpg' }, 'https://h/n/c');
  assert.match(out, /<title>A &quot;big&quot; &lt;story&gt; \| Daily News<\/title>/);
  assert.match(out, /og:image" content="https:\/\/i\/x.jpg"/);
  assert.doesNotMatch(out, /content="old"/);
});

test('findStory and /n/:code serve a saved story from an earlier day', async () => {
  const dir = path.join(__dirname, '..', 'data');
  const file = path.join(dir, 'news-2020-03-04.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ date: '2020-03-04', items: [{ id: 'aaaaaaaaaaaa', title: 'Old news', gist: 'It happened', url: 'https://e/x' }] }));
  const server = app.listen(0);
  try {
    const code = encodeCode('2020-03-04', 'aaaaaaaaaaaa');
    assert.strictEqual((await findStory(code)).item.title, 'Old news');
    assert.strictEqual(await findStory(encodeCode('2020-03-04', 'bbbbbbbbbbbb')), null);
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await (await fetch(`${base}/n/${code}`)).text();
    assert.match(page, /<title>Old news \| Daily News<\/title>/);
    assert.strictEqual((await fetch(`${base}/api/story/${code}`)).status, 200);
    assert.strictEqual((await fetch(`${base}/api/story/${encodeCode('2020-03-04', 'bbbbbbbbbbbb')}`)).status, 404);
  } finally {
    server.close();
    fs.rmSync(file, { force: true });
  }
});
