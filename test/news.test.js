const test = require('node:test');
const assert = require('node:assert');
const { buildGist, trimToSentence, parseFeed, pick, stripTracking, GIST_MAX } = require('../news');

test('trimToSentence ends on a sentence boundary when one fits', () => {
  const text = `${'A'.repeat(200)}. ${'B'.repeat(200)}. tail`;
  assert.strictEqual(trimToSentence(text, GIST_MAX), `${'A'.repeat(200)}.`);
});

test('trimToSentence adds an ellipsis when there is no boundary', () => {
  const out = trimToSentence('word '.repeat(100), 100);
  assert.ok(out.length <= 101 && out.endsWith('…'));
});

test('buildGist tops up a short lead from paragraphs and skips repeats of the lead', () => {
  const lead = 'Short lead sentence about the event.';
  const paras = [`${lead} and more`, 'A second paragraph with plenty of extra detail, long enough on its own that together with the lead it reaches the minimum size of the gist text.', 'never used'];
  const gist = buildGist(lead, paras);
  assert.ok(gist.startsWith(lead));
  assert.ok(gist.includes('second paragraph'));
  assert.ok(!gist.includes('never used'));
  assert.ok(gist.length <= GIST_MAX);
});

test('stripTracking removes query and hash', () => {
  assert.strictEqual(stripTracking('https://x.com/a/b?at_medium=RSS#0'), 'https://x.com/a/b');
});

test('parseFeed reads title, link, summary, date and thumbnail', () => {
  const xml = `<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
    <title><![CDATA[Hello]]></title><description><![CDATA[<b>Sum</b> mary]]></description>
    <link>https://x.com/a?utm=1</link><pubDate>Sat, 26 Sep 2026 13:23:59 GMT</pubDate>
    <media:thumbnail url="https://x.com/i.jpg"/></item></channel></rss>`;
  const [it] = parseFeed(xml, { category: 'World', source: 'S' });
  assert.deepStrictEqual([it.title, it.link, it.summary, it.feedImage], ['Hello', 'https://x.com/a', 'Sum mary', 'https://x.com/i.jpg']);
  assert.strictEqual(it.publishedAt, '2026-09-26T13:23:59.000Z');
});

test('pick interleaves feeds, drops duplicates and respects the limit', () => {
  const mk = (t, l) => ({ title: t, link: l });
  const out = pick([[mk('a', 'u1'), mk('b', 'u2')], [mk('c', 'u3'), mk('A', 'u9'), mk('d', 'u4')]], 4);
  assert.deepStrictEqual(out.map((i) => i.title), ['a', 'c', 'b', 'd']);
});
