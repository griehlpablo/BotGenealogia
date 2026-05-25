async function extractDuckDuckGoResults(page, limit) {
  const data = await page.evaluate((maxItems) => {
    const results = [];
    const seen = new Set();

    function normalizeUrl(href) {
      if (!href) return '';
      const raw = href.trim();
      if (!raw || raw.startsWith('javascript:')) return '';

      try {
        const parsed = new URL(raw, window.location.origin);
        const redirected = parsed.searchParams.get('uddg');
        if (redirected) return decodeURIComponent(redirected);
        return parsed.href;
      } catch (error) {
        return '';
      }
    }

    function shouldIgnore(url) {
      if (!url) return true;
      try {
        const parsed = new URL(url);
        return parsed.hostname.includes('duckduckgo.com');
      } catch (error) {
        return true;
      }
    }

    function pushResult(anchor, container) {
      const url = normalizeUrl(anchor.getAttribute('href') || anchor.href);
      if (shouldIgnore(url) || seen.has(url)) return;

      const title = (anchor.innerText || anchor.textContent || '').replace(/\s+/g, ' ').trim();
      if (!title) return;

      const snippetEl = container?.querySelector?.('.result__snippet, .result__extras__url, [data-result="snippet"]');
      const snippet = snippetEl ? (snippetEl.innerText || '').replace(/\s+/g, ' ').trim() : '';
      seen.add(url);
      results.push({ title, url, snippet, rank: results.length + 1, sourceDomain: new URL(url).hostname });
    }

    const containers = Array.from(document.querySelectorAll('.result, .result__body, article'));
    for (const item of containers) {
      const anchor = item.querySelector('a.result__a, a[data-testid="result-title-a"], a[href]');
      if (!anchor) continue;
      pushResult(anchor, item);
      if (results.length >= maxItems) break;
    }

    if (results.length < maxItems) {
      const anchors = Array.from(document.querySelectorAll('a.result__a, a[data-testid="result-title-a"], a[href]'));
      for (const anchor of anchors) {
        pushResult(anchor, anchor.closest('.result, .result__body, article') || anchor.parentElement);
        if (results.length >= maxItems) break;
      }
    }

    return results;
  }, limit);

  return data;
}

module.exports = {
  extractDuckDuckGoResults
};
