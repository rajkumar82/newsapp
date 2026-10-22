// Share links: /n/<code>. The code is the story id prefixed with a 3-character base-36 day number
// (days since 2020-01-01), so the server knows which day's file holds the story without showing a date.
const EPOCH = Date.UTC(2020, 0, 1);
const DAY_MS = 86400000;

function encodeCode(date, id) {
  const [y, m, d] = date.split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY_MS);
  return days.toString(36).padStart(3, '0') + id;
}

// -> { date: 'YYYY-MM-DD', id } or null when the code isn't one of ours
function decodeCode(code) {
  const m = /^([0-9a-z]{3})([0-9a-f]{12})$/.exec(String(code));
  if (!m) return null;
  const days = parseInt(m[1], 36);
  return { date: new Date(EPOCH + days * DAY_MS).toISOString().slice(0, 10), id: m[2] };
}

const escapeHtml = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Swaps the page's generic title / preview tags for this story's, so the link unfurls as the story in chat apps.
function withStoryMeta(html, item, pageUrl) {
  const title = escapeHtml(`${item.title} | Daily News`);
  const desc = escapeHtml(item.gist);
  const image = escapeHtml(item.image || 'https://dailynews.nocod.dev/og-image.png');
  const tags = `
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Daily News">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${image}">
  `;
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<!-- seo:start -->[\s\S]*<!-- seo:end -->/, () => `<!-- seo:start -->${tags}<!-- seo:end -->`);
}

module.exports = { encodeCode, decodeCode, withStoryMeta };
