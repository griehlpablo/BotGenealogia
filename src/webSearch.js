const config = require('./config');
const { extractGoogleResults } = require('./siteExtractors/google');
const { extractBingResults } = require('./siteExtractors/bing');
const { extractDuckDuckGoResults } = require('./siteExtractors/duckduckgo');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function webDelay(label = 'web search delay') {
  const min = config.webSearch.delayMinMs;
  const max = config.webSearch.delayMaxMs;
  const ms = randomInt(min, max);
  console.log(`[webSearch] ${label}: ${ms}ms`);
  await sleep(ms);
}

function buildSearchUrl(provider, query) {
  const encoded = encodeURIComponent(query);
  if (provider === 'bing') return `https://www.bing.com/search?q=${encoded}`;
  if (provider === 'duckduckgo') return `https://duckduckgo.com/html/?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}&hl=pt-BR`;
}

function detectSearchPageState(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText?.replace(/\s+/g, ' ').toLowerCase() || '';
    const url = window.location.href.toLowerCase();
    const blocked = /access denied|error 15|blocked by our security service|captcha|verify you are human|unusual traffic|sorry|temporarily unavailable|service unavailable|we detected unusual traffic/.test(text);
    if (blocked || /\/sorry\b|\/captcha\b|verify\/token|\/consent/.test(url)) {
      return 'blocked_or_captcha';
    }
    return 'ok';
  }).catch(() => 'generic_error');
}

async function extractSearchResults(page, provider, limit) {
  if (provider === 'bing') return extractBingResults(page, limit);
  if (provider === 'duckduckgo') return extractDuckDuckGoResults(page, limit);
  return extractGoogleResults(page, limit);
}

async function searchWeb(browser, queryObject) {
  const provider = config.webSearch.provider || 'duckduckgo';
  const query = queryObject.query;
  const searchUrl = buildSearchUrl(provider, query);
  const page = await browser.newPage();

  try {
    if (config.browser.customUserAgent) {
      await page.setUserAgent(config.browser.customUserAgent);
    }
    await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
    await webDelay('pre-search delay');
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await webDelay('post-search delay');

    const pageState = await detectSearchPageState(page);
    if (pageState !== 'ok') {
      return {
        provider,
        query,
        searchUrl,
        results: [],
        ok: false,
        error: 'Bloqueio ou captcha detectado na busca web.',
        pageState
      };
    }

    const results = await extractSearchResults(page, provider, config.webSearch.limit || 10);
    return {
      provider,
      query,
      searchUrl,
      results,
      ok: true,
      pageState: 'ok'
    };
  } catch (error) {
    return {
      provider,
      query,
      searchUrl,
      results: [],
      ok: false,
      error: error.message,
      pageState: 'error'
    };
  } finally {
    await page.close().catch(() => null);
  }
}

module.exports = {
  searchWeb
};
