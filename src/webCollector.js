const config = require('./config');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function collectDelay(label = 'web collect delay') {
  const min = config.webSearch.collectDelayMinMs;
  const max = config.webSearch.collectDelayMaxMs;
  const ms = randomInt(min, max);
  console.log(`[webCollector] ${label}: ${ms}ms`);
  await sleep(ms);
}

function isPublicPageUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes('familysearch.org')) return false;
  if (lower.match(/\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|jpg|jpeg|png|svg)(\?|$)/i)) return false;
  return /^https?:\/\//.test(url);
}

function detectPageBlock(text, url) {
  const lowerText = String(text || '').toLowerCase();
  const lowerUrl = String(url || '').toLowerCase();
  if (/access denied|captcha|verify you are human|unusual traffic|cloudflare|service unavailable|temporarily unavailable|blocked by our security service|login required|sign in|sign in to continue/.test(lowerText)) {
    return 'blocked_or_captcha';
  }
  if (/\/captcha\b|\/login\b|\/signin\b|\/verify\b/.test(lowerUrl)) {
    return 'manual_required';
  }
  return 'ok';
}

async function collectPublicPage(browser, result, options = {}) {
  const { url, title, snippet } = result;
  if (!isPublicPageUrl(url)) {
    return {
      url,
      title,
      rawText: '',
      links: [],
      ok: false,
      pageState: 'skip_unsupported',
      error: 'URL nao é uma pagina publica HTML adequada.',
      sourceDomain: new URL(url).hostname
    };
  }

  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await collectDelay('web collect delay');

    const data = await page.evaluate((maxText) => {
      const title = document.title || '';
      const body = document.body || document.documentElement;
      const rawText = (body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, maxText);
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const seen = new Set();
      const links = [];

      for (const anchor of anchors) {
        const href = anchor.href;
        const text = (anchor.innerText || '').trim();
        if (!href || seen.has(href)) continue;
        seen.add(href);
        links.push({ href, text: text || href });
        if (links.length >= 40) break;
      }

      return { title, rawText, links };
    }, options.maxText || 14000);

    const pageState = detectPageBlock(data.rawText, url);
    const ok = pageState === 'ok';

    return {
      url,
      title: data.title || title,
      rawText: data.rawText,
      links: data.links,
      ok,
      pageState,
      error: ok ? undefined : `Pagina pecisa de atencao manual: ${pageState}`,
      sourceDomain: new URL(url).hostname,
      snippet
    };
  } catch (error) {
    return {
      url,
      title,
      rawText: '',
      links: [],
      ok: false,
      pageState: 'error',
      error: error.message,
      sourceDomain: new URL(url).hostname,
      snippet
    };
  } finally {
    await page.close().catch(() => null);
  }
}

module.exports = {
  collectPublicPage
};
