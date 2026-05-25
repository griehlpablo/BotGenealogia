async function extractBingResults(page, limit) {
  const data = await page.evaluate((maxItems) => {
    const results = [];
    const seen = new Set();
    const items = Array.from(document.querySelectorAll('li.b_algo'));

    for (const item of items) {
      const anchor = item.querySelector('h2 a');
      if (!anchor) continue;
      const url = anchor.href;
      if (!url || seen.has(url)) continue;
      const title = anchor.innerText.trim();
      const snippetEl = item.querySelector('.b_caption p');
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
  extractBingResults
};
