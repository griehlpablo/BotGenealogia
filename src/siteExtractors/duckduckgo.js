async function extractDuckDuckGoResults(page, limit) {
  const data = await page.evaluate((maxItems) => {
    const results = [];
    const seen = new Set();
    const items = Array.from(document.querySelectorAll('.result, .result__body'));

    for (const item of items) {
      const anchor = item.querySelector('a.result__a, a[data-testid="result-title-a"]');
      if (!anchor) continue;
      const url = anchor.href;
      if (!url || seen.has(url)) continue;
      const title = anchor.innerText.trim();
      const snippetEl = item.querySelector('.result__snippet, .result__extras__url, .result__snippet');
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
  extractDuckDuckGoResults
};
