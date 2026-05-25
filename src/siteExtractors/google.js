async function extractGoogleResults(page, limit) {
  const data = await page.evaluate((maxItems) => {
    const results = [];
    const seen = new Set();

    function normalizeUrl(href) {
      if (!href) return '';
      const url = href.trim();
      const match = url.match(/\/url\?q=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
      return url;
    }

    const items = Array.from(document.querySelectorAll('div#search div.g'));
    for (const item of items) {
      const anchor = item.querySelector('a');
      const titleEl = item.querySelector('h3');
      const snippetEl = item.querySelector('.VwiC3b, .aCOpRe, .IsZvec');
      if (!anchor || !titleEl) continue;
      const url = normalizeUrl(anchor.getAttribute('href') || anchor.href);
      if (!url || url.includes('google.com') || url.includes('/settings/')) continue;
      if (seen.has(url)) continue;
      const title = titleEl.innerText.trim();
      const snippet = snippetEl ? snippetEl.innerText.trim() : '';
      seen.add(url);
      results.push({ title, url, snippet, rank: results.length + 1, sourceDomain: new URL(url).hostname });
      if (results.length >= maxItems) break;
    }

    return results;
  }, limit);

  return data;
}

module.exports = {
  extractGoogleResults
};
