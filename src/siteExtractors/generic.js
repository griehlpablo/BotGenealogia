async function extractGenericResults(page, limit) {
  const data = await page.evaluate((maxItems) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const seen = new Set();
    const links = [];

    for (const anchor of anchors) {
      const text = (anchor.innerText || anchor.textContent || '').replace(/\s+/g, ' ').trim();
      const href = anchor.href;
      if (!text || !href || seen.has(href)) continue;
      if (text.length < 3 || text.length > 220) continue;
      seen.add(href);
      links.push({ text, href });
      if (links.length >= maxItems) break;
    }

    const main =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('#content') ||
      document.body;

    const text = (main.innerText || main.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 14000);

    return {
      title: document.title,
      text,
      links
    };
  }, limit);

  return {
    title: data.title,
    rawText: data.text,
    recordLinks: data.links
  };
}

module.exports = {
  extractGenericResults
};
