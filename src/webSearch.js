const config = require('./config');
const fs = require('fs/promises');
const path = require('path');
const { extractGoogleResults } = require('./siteExtractors/google');
const { extractBingResults } = require('./siteExtractors/bing');
const { extractDuckDuckGoResults } = require('./siteExtractors/duckduckgo');
const { isProviderCoolingDown, setProviderCooldown } = require('./cooldown');

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

function orderedProviders() {
  const primary = config.webSearch.provider || 'duckduckgo';
  const providers = [primary, ...(config.webSearch.fallbackProviders || [])];
  return [...new Set(providers.map((provider) => provider.toLowerCase()).filter(Boolean))];
}

function detectSearchPageState(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText?.replace(/\s+/g, ' ').toLowerCase() || '';
    const url = window.location.href.toLowerCase();
    const blocked = /access denied|error 15|blocked by our security service|captcha|verify you are human|unusual traffic|sorry|temporarily unavailable|service unavailable|we detected unusual traffic|blocked/.test(text);
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

async function saveSearchDebugScreenshot(page, provider) {
  try {
    const debugDir = path.join(config.outputDir, 'debug');
    await fs.mkdir(debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(debugDir, `search-${provider}-${stamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[webSearch] Screenshot debug: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    console.warn(`[webSearch] Falha ao salvar screenshot debug: ${error.message}`);
    return undefined;
  }
}

async function searchWithProvider(browser, query, provider) {
  const searchUrl = buildSearchUrl(provider, query);
  const cooldown = await isProviderCoolingDown(provider);
  if (cooldown) {
    console.warn(`[webSearch] Provedor ${provider} em cooldown ate ${cooldown.until}`);
    return {
      provider,
      query,
      searchUrl,
      results: [],
      ok: false,
      pageState: 'provider_cooldown',
      error: `Provedor em cooldown ate ${cooldown.until}.`,
      providerCooldown: cooldown
    };
  }

  const page = await browser.newPage();

  try {
    console.log(`[webSearch] Provider: ${provider}`);
    console.log(`[webSearch] URL: ${searchUrl}`);
    if (config.browser.customUserAgent) {
      await page.setUserAgent(config.browser.customUserAgent);
    }
    await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
    await webDelay('pre-search delay');
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await webDelay('post-search delay');

    const pageState = await detectSearchPageState(page);
    console.log(`[webSearch] pageState: ${pageState}`);
    if (pageState !== 'ok') {
      const debugScreenshot = await saveSearchDebugScreenshot(page, provider);
      const captchaDetected = pageState === 'blocked_or_captcha';
      let providerCooldown;
      if (captchaDetected && config.webSearch.stopOnCaptcha) {
        providerCooldown = await setProviderCooldown(provider, 'captcha');
      }

      return {
        provider,
        query,
        searchUrl,
        results: [],
        ok: false,
        error: 'Bloqueio ou captcha detectado na busca web.',
        pageState,
        captchaDetected,
        providerCooldown,
        debugScreenshot
      };
    }

    const results = await extractSearchResults(page, provider, config.webSearch.limit || 10);
    console.log(`[webSearch] Resultados extraidos: ${results.length}`);
    if (results.length === 0) {
      const debugScreenshot = await saveSearchDebugScreenshot(page, provider);
      return {
        provider,
        query,
        searchUrl,
        results: [],
        ok: false,
        pageState: 'no_results_extracted',
        error: 'Extractor nao encontrou resultados organicos na pagina de busca.',
        debugScreenshot
      };
    }

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

async function searchWeb(browser, queryObject) {
  const query = queryObject.query;
  const attempts = [];

  for (const provider of orderedProviders()) {
    const result = await searchWithProvider(browser, query, provider);
    attempts.push({
      provider: result.provider,
      query,
      searchUrl: result.searchUrl,
      ok: result.ok,
      pageState: result.pageState,
      error: result.error,
      resultsCount: result.results?.length || 0,
      captchaDetected: Boolean(result.captchaDetected),
      providerCooldown: result.providerCooldown
    });

    if (result.ok || result.pageState === 'blocked_or_captcha' || result.captchaDetected) {
      result.attempts = attempts;
      return result;
    }

    if (!['no_results_extracted', 'error'].includes(result.pageState)) {
      result.attempts = attempts;
      return result;
    }

    console.warn(`[webSearch] ${provider} retornou zero resultados extraidos; tentando fallback se existir.`);
  }

  const last = attempts[attempts.length - 1];
  return {
    provider: last?.provider || config.webSearch.provider || 'duckduckgo',
    query,
    searchUrl: last?.searchUrl || '',
    results: [],
    ok: false,
    pageState: last?.pageState || 'no_results_extracted',
    error: last?.error || 'Nenhum provedor retornou resultados organicos extraidos.',
    attempts
  };
}

module.exports = {
  searchWeb,
  buildSearchUrl
};
