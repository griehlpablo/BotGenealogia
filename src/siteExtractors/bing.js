async function extractBingResults(page, limit) {
  const data = await page.evaluate((maxItems) => {
    const results = [];
    const seen = new Set();

    function decodeBingBase64(value) {
      try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return atob(padded);
      } catch (error) {
        return '';
      }
    }

    function normalizeUrl(href) {
      if (!href) return '';
      try {
        const parsed = new URL(href, window.location.origin);
        const encodedTarget = parsed.searchParams.get('u');
        if (parsed.hostname.includes('bing.com') && encodedTarget) {
          const decoded = decodeBingBase64(encodedTarget.replace(/^a1/i, ''));
          if (/^https?:\/\//i.test(decoded)) return decoded;
        }
        return parsed.href;
      } catch (error) {
        return '';
      }
    }

    function shouldIgnore(url) {
      if (!url) return true;
      try {
        const parsed = new URL(url);
        return parsed.hostname.includes('bing.com') || url.startsWith('javascript:');
      } catch (error) {
        return true;
      }
    }

    const items = Array.from(document.querySelectorAll('li.b_algo'));

    for (const item of items) {
      const anchor = item.querySelector('h2 a');
      if (!anchor) continue;
      const url = normalizeUrl(anchor.getAttribute('href') || anchor.href);
      if (shouldIgnore(url) || seen.has(url)) continue;
      const heading = item.querySelector('h2');
      const title = (anchor.innerText || anchor.textContent || heading?.innerText || anchor.getAttribute('aria-label') || '')
        .replace(/\s+/g, ' ')
        .trim();
      const snippetEl = item.querySelector('.b_caption p');
      const snippet = snippetEl ? snippetEl.innerText.replace(/\s+/g, ' ').trim() : '';
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
