const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('./config');
const { loadCookies, saveCookies } = require('./session');

puppeteer.use(StealthPlugin());

const SITE_CONFIG = {
  familysearch: {
    name: 'FamilySearch',
    baseUrl: 'https://www.familysearch.org',
    loginUrl: 'https://www.familysearch.org/auth/familysearch/login',
    searchUrl: 'https://www.familysearch.org/search/record/results',
    cookieDomainUrl: 'https://www.familysearch.org',
    loginSelectors: {
      email: 'input[name="username"], input[type="email"], #userName',
      password: 'input[name="password"], input[type="password"], #password',
      submit: 'button[type="submit"], input[type="submit"]'
    }
  },
  myheritage: {
    name: 'MyHeritage',
    baseUrl: 'https://www.myheritage.com',
    loginUrl: 'https://www.myheritage.com/login',
    searchUrl: 'https://www.myheritage.com/research',
    cookieDomainUrl: 'https://www.myheritage.com',
    loginSelectors: {
      email: 'input[name="email"], input[type="email"]',
      password: 'input[name="password"], input[type="password"]',
      submit: 'button[type="submit"], input[type="submit"]'
    }
  },
  google: {
    name: 'Google',
    baseUrl: 'https://www.google.com',
    searchUrl: 'https://www.google.com/search'
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanDelay(label = 'pausa') {
  const ms = randomInt(config.browser.minDelayMs, config.browser.maxDelayMs);
  await sleep(ms);
}

function resolveExecutablePath() {
  if (config.browser.executablePath) return config.browser.executablePath;

  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function createBrowser() {
  const executablePath = resolveExecutablePath();
  return puppeteer.launch({
    headless: config.browser.headless,
    slowMo: config.browser.slowMo,
    executablePath,
    defaultViewport: { width: 1366, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1366,900'
    ]
  });
}

function buildFamilySearchUrl(search, birthWindow) {
  const params = new URLSearchParams();
  if (search.givenName) params.set('q.givenName', search.givenName);
  if (search.surname) params.set('q.surname', search.surname);
  if (search.place) params.set('q.birthLikePlace', search.place);
  if (birthWindow) params.set('q.birthLikeDate.from', String(birthWindow.from));
  if (birthWindow) params.set('q.birthLikeDate.to', String(birthWindow.to));
  return `${SITE_CONFIG.familysearch.searchUrl}?${params.toString()}`;
}

function buildMyHeritageUrl(search, birthWindow) {
  const params = new URLSearchParams({
    formId: 'master',
    formMode: '1',
    action: 'query',
    exactSearch: '0',
    useTranslation: '1'
  });

  const fullName = [search.givenName, search.surname].filter(Boolean).join(' ');
  if (fullName) params.set('qname', fullName);
  if (birthWindow) params.set('qbirth', `${birthWindow.from}-${birthWindow.to}`);
  if (search.place) params.set('qevents-place', search.place);
  return `${SITE_CONFIG.myheritage.searchUrl}?${params.toString()}`;
}

function buildGoogleUrl(search, birthWindow) {
  const pieces = [];
  const name = [search.givenName, search.surname].filter(Boolean).join(' ').trim();
  if (name) pieces.push(`"${name}"`);
  if (search.place) pieces.push(`"${search.place}"`);

  const extras = '(genealogia OR genealogy OR obituario OR "family tree")';
  pieces.push(extras);

  if (birthWindow && birthWindow.from && birthWindow.to) {
    pieces.push(`${birthWindow.from}..${birthWindow.to}`);
  } else if (birthWindow && birthWindow.from) {
    pieces.push(String(birthWindow.from));
  } else if (birthWindow && birthWindow.to) {
    pieces.push(String(birthWindow.to));
  }

  const query = pieces.filter(Boolean).join(' ');
  const params = new URLSearchParams({ q: query });
  return `${SITE_CONFIG.google.searchUrl}?${params.toString()}`;
}

function buildSearchUrl(search, birthWindow) {
  if (search.site === 'myheritage') return buildMyHeritageUrl(search, birthWindow);
  if (search.site === 'google' || search.site === 'web') return buildGoogleUrl(search, birthWindow);
  return buildFamilySearchUrl(search, birthWindow);
}

async function clickIfExists(page, selector) {
  try {
    const element = await page.$(selector);
    if (!element) return false;
    await element.click();
    return true;
  } catch (error) {
    console.warn(`[scraper] Clique ignorado (${selector}): ${error.message}`);
    return false;
  }
}

async function typeIfExists(page, selector, value) {
  if (!value) return false;
  try {
    const element = await page.$(selector);
    if (!element) return false;
    await element.click({ clickCount: 3 });
    await element.type(value, { delay: randomInt(40, 140) });
    return true;
  } catch (error) {
    console.warn(`[scraper] Digitacao ignorada (${selector}): ${error.message}`);
    return false;
  }
}

async function authenticate(page, siteKey) {
  if (siteKey === 'google' || siteKey === 'web') {
    return;
  }

  const site = SITE_CONFIG[siteKey];
  const credentials = config.credentials[siteKey] || {};

  await page.goto(site.cookieDomainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const loaded = await loadCookies(page, config.sessionsDir, siteKey);
  if (loaded > 0) {
    console.log(`[sessao] ${loaded} cookies reaproveitados para ${site.name}.`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await humanDelay('validando sessao');
    return;
  }

  console.log(`[sessao] Sem cookies de ${site.name}. Abrindo login inicial.`);
  await page.goto(site.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await humanDelay('pagina de login');

  const typedEmail = await typeIfExists(page, site.loginSelectors.email, credentials.email);
  const typedPassword = await typeIfExists(page, site.loginSelectors.password, credentials.password);

  if (typedEmail && typedPassword) {
    await humanDelay('antes de enviar login');
    await clickIfExists(page, site.loginSelectors.submit);
  } else {
    console.log('[sessao] Faca login manualmente na janela aberta; vou aguardar ate 2 minutos.');
  }

  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => null);
  await humanDelay('apos login');
  const savedPath = await saveCookies(page, config.sessionsDir, siteKey);
  console.log(`[sessao] Cookies salvos em ${savedPath}`);
}

async function extractResults(page, siteKey, limit) {
  await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.8))).catch(() => null);
  await humanDelay('rolagem de resultados');

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
    site: siteKey,
    title: data.title,
    rawText: data.text,
    recordLinks: data.links
  };
}

async function runSearch(browser, search, birthWindow) {
  const siteKey = search.site || 'familysearch';
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
    await authenticate(page, siteKey);

    const url = buildSearchUrl(search, birthWindow);
    console.log(`[scraper] Buscando ${search.id || search.surname}: ${url}`);
    await humanDelay('antes da busca');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await humanDelay('pagina de resultados');

    const extracted = await extractResults(page, siteKey, config.browser.resultLimit);
    await saveCookies(page, config.sessionsDir, siteKey).catch(() => null);

    return {
      ok: true,
      searchUrl: url,
      extracted
    };
  } catch (error) {
    return {
      ok: false,
      searchUrl: buildSearchUrl(search, birthWindow),
      error: error.message,
      extracted: {
        site: siteKey,
        title: '',
        rawText: '',
        recordLinks: []
      }
    };
  } finally {
    await page.close().catch(() => null);
  }
}

module.exports = {
  SITE_CONFIG,
  createBrowser,
  runSearch,
  buildSearchUrl,
  humanDelay
};
