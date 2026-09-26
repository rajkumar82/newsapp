const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { newsForDay } = require('../server');

// Uses a date far in the past so it cannot collide with real data, and cleans up after itself.
test('newsForDay serves the saved JSON without fetching again', async () => {
  const dir = path.join(__dirname, '..', 'data');
  const file = path.join(dir, 'news-1999-01-01.json');
  fs.mkdirSync(dir, { recursive: true });
  const doc = { date: '1999-01-01', fetchedAt: 'x', items: [{ title: 'saved' }] };
  fs.writeFileSync(file, JSON.stringify(doc));
  try {
    assert.deepStrictEqual(await newsForDay('1999-01-01'), doc);
  } finally {
    fs.rmSync(file, { force: true });
  }
});
